"""Authenticated CV worker for ECS; uses the same CLI scripts as local analysis."""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent
MAX_BODY = 24 * 1024 * 1024
WORKER = threading.BoundedSemaphore(1)


def decode_image(encoded, expected_hash):
    if not isinstance(encoded, str):
        raise ValueError("Missing image")
    data = base64.b64decode(encoded, validate=True)
    if not data or len(data) > 10 * 1024 * 1024:
        raise ValueError("Image too large or empty")
    if hashlib.sha256(data).hexdigest() != expected_hash:
        raise ValueError("Image hash mismatch")
    # Decode bounds before invoking the measurement pipeline.
    import cv2
    import numpy as np
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[0] * image.shape[1] > 40_000_000:
        raise ValueError("Invalid image")
    return data


def run_script(name, *args, timeout=45):
    result = subprocess.run([sys.executable, str(ROOT / name), *map(str, args)],
                            check=True, capture_output=True, text=True, timeout=timeout)
    if len(result.stdout) > 1024 * 1024:
        raise ValueError("CV output too large")
    return json.loads(result.stdout)


def analyze(payload):
    if payload.get("version") != 1:
        raise ValueError("Unsupported protocol")
    baselines = payload.get("baselines")
    if not isinstance(baselines, list) or not 1 <= len(baselines) <= 4:
        raise ValueError("Invalid baseline list")
    with tempfile.TemporaryDirectory(prefix="ff-cv-service-") as directory:
        directory = Path(directory)
        wet = directory / "wet.jpg"
        wet.write_bytes(decode_image(payload.get("photo"), payload.get("photoHash")))
        matches = []
        for index, candidate in enumerate(baselines):
            if not isinstance(candidate.get("id"), str) or len(candidate["id"]) > 100:
                raise ValueError("Invalid baseline id")
            dry, aligned = directory / f"dry-{index}.png", directory / f"aligned-{index}.jpg"
            dry.write_bytes(decode_image(candidate.get("image"), candidate.get("sha256")))
            try:
                mode = ['--upload-only'] if candidate['id'] == 'upload-only' else (
                    [] if payload.get("allowComparison", True) else ['--unregistered-reference'])
                evidence = run_script("analyze.py", dry, wet, aligned, *mode)
                matches.append((candidate, dry, aligned, evidence))
            except (subprocess.SubprocessError, ValueError):
                continue
        if not matches:
            raise RuntimeError("No comparison completed")
        matches.sort(key=lambda match: (bool(match[3].get("registered")),
            bool(match[3].get("sceneMatched")), match[3].get("inliers", 0)), reverse=True)
        candidate, dry, aligned, evidence = matches[0]
        try:
            mode = ['--upload-only'] if candidate['id'] == 'upload-only' else (
                [] if evidence.get("registered") or evidence.get("sceneMatched") else ['--unregistered-reference'])
            references = run_script("analyze_references.py", dry, wet,
                *mode, timeout=60)
            evidence["sceneReferences"] = references
            evidence["limitations"].extend(references.get("limitations", []))
        except (subprocess.SubprocessError, ValueError):
            evidence["limitations"].append("Optional scene-reference inference failed; base CV measurements retained.")
        profile = None
        if candidate['id'] != 'upload-only':
            try:
                profile = run_script("analyze_dry.py", dry, timeout=30)
            except (subprocess.SubprocessError, ValueError):
                evidence["limitations"].append("Dry reference inventory unavailable; comparison retained.")
        return {"version": 1, "photoHash": payload["photoHash"], "baselineId": candidate["id"],
            "baselineHash": candidate["sha256"], "evidence": evidence, "dryProfile": profile,
            "alignedBaseline": base64.b64encode(aligned.read_bytes()).decode() if aligned.exists() else None}


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def reply(self, status, payload):
        body = json.dumps(payload, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"ok": self.path == "/health"})

    def do_POST(self):
        if self.path != "/analyze":
            self.reply(404, {"error": "Not found"})
            return
        token = os.environ.get("CV_SERVICE_TOKEN", "")
        if not token or not hmac.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token):
            self.reply(401, {"error": "Unauthorized"})
            return
        if not WORKER.acquire(blocking=False):
            self.reply(429, {"error": "CV worker busy; retry later"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= MAX_BODY:
                self.reply(413, {"error": "Invalid request size"})
                return
            raw = self.rfile.read(length)
            if len(raw) != length:
                raise ValueError("Incomplete request")
            payload = json.loads(raw)
            if "application/x-ndjson" in self.headers.get("Accept", ""):
                self.stream_analysis(payload)
            else:
                self.reply(200, analyze(payload))
        except (ValueError, KeyError, TypeError, AttributeError):
            self.reply(400, {"error": "Invalid analysis request"})
        except Exception:
            self.reply(503, {"error": "CV processing unavailable"})
        finally:
            WORKER.release()

    def stream_analysis(self, payload):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson")
        self.send_header("Cache-Control", "no-store, no-transform")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        def emit(event):
            self.wfile.write((json.dumps(event, allow_nan=False) + "\n").encode())
            self.wfile.flush()
        # Keep the origin response active during model startup and inference.
        with ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(analyze, payload)
            emit({"type": "progress", "stage": "measure"})
            while True:
                try:
                    result = future.result(timeout=10)
                    emit({"type": "result", "result": result})
                    break
                except FutureTimeout:
                    emit({"type": "heartbeat"})
                except Exception:
                    emit({"type": "error", "error": "CV processing unavailable"})
                    break

    def log_message(self, format, *args):
        # Log status only, never uploaded content, credentials or request bodies.
        print(json.dumps({"service": "cv", "event": "request", "status": args[1] if len(args) > 1 else "unknown"}), flush=True)


if __name__ == "__main__":
    if not os.environ.get("CV_SERVICE_TOKEN"):
        raise SystemExit("CV_SERVICE_TOKEN must be configured")
    ThreadingHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8080"))), Handler).serve_forever()
