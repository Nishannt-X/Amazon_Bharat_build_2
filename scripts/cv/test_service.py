import importlib.util
import json
import os
from pathlib import Path
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request

spec = importlib.util.spec_from_file_location("cv_service", Path(__file__).with_name("service.py"))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)


class ServiceTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"CV_SERVICE_TOKEN": "test-only-token"})
        self.environment.start()
        self.server = service.ThreadingHTTPServer(("127.0.0.1", 0), service.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_port}"

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.environment.stop()

    def request(self, payload, auth=True, stream=False):
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = "Bearer test-only-token"
        if stream:
            headers["Accept"] = "application/x-ndjson"
        request = urllib.request.Request(self.url + "/analyze", json.dumps(payload).encode(), headers)
        return urllib.request.urlopen(request, timeout=3)

    def test_health_does_not_run_models(self):
        with patch.object(service, "analyze") as analyze:
            self.assertEqual(urllib.request.urlopen(self.url + "/health").status, 200)
            analyze.assert_not_called()

    def test_authentication_precedes_processing(self):
        with patch.object(service, "analyze") as analyze:
            with self.assertRaises(urllib.error.HTTPError) as failure:
                self.request({}, auth=False)
            self.assertEqual(failure.exception.code, 401)
            analyze.assert_not_called()

    def test_authenticated_result_returned_once(self):
        result = {"version": 1, "photoHash": "test", "baselineId": "dry", "evidence": {}}
        with patch.object(service, "analyze", return_value=result) as analyze:
            with self.request({"version": 1}) as response:
                self.assertEqual(json.load(response), result)
            analyze.assert_called_once()

    def test_busy_worker_does_not_start_duplicate_analysis(self):
        service.WORKER.acquire()
        try:
            with self.assertRaises(urllib.error.HTTPError) as failure:
                self.request({})
            self.assertEqual(failure.exception.code, 429)
        finally:
            service.WORKER.release()

    def test_invalid_input_and_model_failure_are_not_successes(self):
        for exception, status in [(ValueError("bad input"), 400), (RuntimeError("failed"), 503)]:
            with patch.object(service, "analyze", side_effect=exception):
                with self.assertRaises(urllib.error.HTTPError) as failure:
                    self.request({})
                self.assertEqual(failure.exception.code, status)

    def test_hash_mismatch_is_rejected_before_image_decoding(self):
        with self.assertRaisesRegex(ValueError, "hash mismatch"):
            service.decode_image("aW1hZ2U=", "wrong")

    def test_stream_sends_progress_and_exactly_one_result(self):
        with patch.object(service, "analyze", return_value={"version": 1}):
            with self.request({}, stream=True) as response:
                events = [json.loads(line) for line in response.read().decode().splitlines()]
            self.assertEqual([event["type"] for event in events], ["progress", "result"])
            self.assertEqual(events[-1]["result"]["version"], 1)


if __name__ == "__main__":
    unittest.main()
