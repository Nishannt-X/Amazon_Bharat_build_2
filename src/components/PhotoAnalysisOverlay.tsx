"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PhotoState } from "../lib/report";
import { photoComparison, type PublicAnalysis } from "../lib/photo-analysis";

interface Props {
  photo: PhotoState;
  location: { lat: number; lng: number; accuracyMeters: number; capturedAt: string } | null;
  initial: PublicAnalysis | null;
  onResult: (result: PublicAnalysis) => void;
  onContinue: () => void;
}
export default function PhotoAnalysisOverlay({
  photo,
  location,
  initial,
  onResult,
  onContinue,
}: Props) {
  const [result, setResult] = useState(initial);
  const [busy, setBusy] = useState(!initial);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [stage, setStage] = useState("decode");
  const [showAll, setShowAll] = useState(false);
  const [baselineError, setBaselineError] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const dryCanvas = useRef<HTMLCanvasElement>(null);
  const comparison = useMemo(
    () =>
      result?.comparison ??
      (result?.cv ? photoComparison(result.cv, "") : null),
    [result],
  );
  const visibleMeasurements =
    comparison?.measurements.filter(
      (m) =>
        showAll ||
        m.id === comparison.primaryReferenceId ||
        (!comparison.primaryReferenceId && m.id === "R1"),
    ) ?? [];
  const dialog = useRef<HTMLDivElement>(null);
  const initialRef = useRef(initial);
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);
  const previousFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    return () => {
      document.body.style.overflow = old;
      previousFocus.current?.focus();
    };
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    if (initialRef.current && retry === 0) return () => abort.abort();
    setBusy(true);
    setResult(null);
    setStage("decode");
    setError("");
    const form = new FormData();
    form.set("photo", photo.file);
    if (location) {
      form.set("lat", String(location.lat));
      form.set("lng", String(location.lng));
      form.set("accuracyMeters", String(location.accuracyMeters));
      form.set("capturedAt", location.capturedAt);
    }
    fetch("/api/analysis", {
      method: "POST",
      headers: { Accept: "application/x-ndjson" },
      body: form,
      signal: abort.signal,
    })
      .then(async (r) => {
        if (!r.ok)
          throw new Error((await r.json()).error || "Analysis failed.");
        const reader = r.body?.getReader();
        if (!reader) throw new Error("Analysis stream is unavailable.");
        const decoder = new TextDecoder();
        let pending = "";
        const final: {
          value: { analysis: PublicAnalysis; question: string | null } | null;
        } = { value: null };
        function consume(line: string) {
          if (!line.trim() || abort.signal.aborted) return;
          const event = JSON.parse(line);
          if (event.type === "progress") setStage(event.stage);
          else if (event.type === "error") throw new Error(event.error);
          else if (event.type === "result") final.value = event;
        }
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          pending += decoder.decode(chunk.value, { stream: true });
          let end: number;
          while ((end = pending.indexOf("\n")) >= 0) {
            consume(pending.slice(0, end));
            pending = pending.slice(end + 1);
          }
        }
        pending += decoder.decode();
        if (pending.trim()) consume(pending);
        if (!final.value)
          throw new Error("Analysis ended without a result. Retry the upload.");
        return final.value;
      })
      .then((data) => {
        if (abort.signal.aborted) return;
        setResult(data.analysis);
        setBusy(false);
        onResultRef.current(data.analysis);
      })
      .catch((e) => {
        if (!abort.signal.aborted)
          setError(
            e.message ||
              "Analysis failed. Retry or continue without a depth estimate.",
          );
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [photo.file, location, retry]);
  useEffect(() => {
    let cancelled = false;
    function draw(
      element: HTMLCanvasElement | null,
      image: HTMLImageElement,
      dry: boolean,
    ) {
      if (cancelled || !element) return;
      const ctx = element.getContext("2d");
      if (!ctx) return;
      const aligned = !dry || !!result?.cv?.registered;
      element.width = aligned
        ? (result?.cv?.width ?? photo.width)
        : image.naturalWidth;
      element.height = aligned
        ? (result?.cv?.height ?? photo.height)
        : image.naturalHeight;
      ctx.drawImage(image, 0, 0, element.width, element.height);
      if (!aligned) return;
      const label = (text: string, x: number, y: number, color: string) => {
        ctx.font = "bold 13px sans-serif";
        const width = ctx.measureText(text).width + 14;
        x = Math.max(8, Math.min(element!.width - width - 8, x));
        y = Math.max(20, Math.min(element!.height - 10, y));
        ctx.fillStyle = "rgba(16,32,38,.88)";
        ctx.fillRect(x - 5, y - 15, width, 22);
        ctx.fillStyle = color;
        ctx.fillText(text, x, y);
      };
      const dot = (point: number[], color: string) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(
          point[0] * element!.width,
          point[1] * element!.height,
          4,
          0,
          Math.PI * 2,
        );
        ctx.fill();
      };
      if (showAll) {
        for (const [index, edge] of (
          result?.cv?.structuralEdges ?? []
        ).entries()) {
          ctx.strokeStyle = "#ffbd69";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(
            edge.points[0][0] * element.width,
            edge.points[0][1] * element.height,
          );
          ctx.lineTo(
            edge.points[1][0] * element.width,
            edge.points[1][1] * element.height,
          );
          ctx.stroke();
          label(
            `E${index + 1} · ${edge.pixels} px`,
            edge.points[0][0] * element.width + 6,
            edge.points[0][1] * element.height - 8,
            "#ffbd69",
          );
        }
        if (!dry) {
          const y = result?.cv?.candidateWaterlineY;
          if (y != null) {
            ctx.setLineDash([10, 8]);
            ctx.strokeStyle = "#4ad6f0";
            ctx.beginPath();
            ctx.moveTo(0, y * element.height);
            ctx.lineTo(element.width, y * element.height);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          for (const person of result?.cv?.traffic ?? []) {
            ctx.strokeStyle = "#67e1a0";
            ctx.strokeRect(
              person.box[0] * element.width,
              person.box[1] * element.height,
              person.box[2] * element.width,
              person.box[3] * element.height,
            );
          }
        }
      }
      const refs =
        comparison?.measurements.filter(
          (m) =>
            showAll ||
            m.id === comparison.primaryReferenceId ||
            (!comparison.primaryReferenceId && m.id === "R1"),
        ) ?? [];
      for (const ref of refs) {
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ref.top[0] * element.width, ref.top[1] * element.height);
        ctx.lineTo(
          ref.bottom[0] * element.width,
          ref.bottom[1] * element.height,
        );
        ctx.stroke();
        dot(ref.top, "#fff");
        dot(ref.bottom, "#fff");
        if (dry)
          label(
            `${ref.id} · ${ref.referencePixels} px dry span`,
            ref.top[0] * element.width + 12,
            ref.top[1] * element.height,
            "#fff",
          );
        else {
          if (ref.waterPoint) {
            dot(ref.waterPoint, "#4ad6f0");
            ctx.strokeStyle = "#4ad6f0";
            ctx.beginPath();
            ctx.moveTo(
              ref.waterPoint[0] * element.width,
              ref.waterPoint[1] * element.height,
            );
            ctx.lineTo(
              ref.bottom[0] * element.width,
              ref.bottom[1] * element.height,
            );
            ctx.stroke();
          }
          label(
            `${ref.id} · ${ref.submergedPixels == null ? "boundary unknown" : `${ref.submergedPixels} px ≈ ${ref.estimatedDepthMm} mm*`}`,
            ref.top[0] * element.width + 12,
            ref.top[1] * element.height,
            "#4ad6f0",
          );
        }
      }
    }
    const wet = new Image();
    wet.onload = () => draw(canvas.current, wet, false);
    wet.onerror = () => {
      if (!cancelled)
        setError("Uploaded photo could not load. Try uploading it again.");
    };
    wet.src = photo.objectUrl;
    if (!result || result.baseline === "unavailable") return () => { cancelled = true; };
    const dry = new Image();
    dry.onload = () => {
      if (!cancelled) {
        setBaselineError(false);
        draw(dryCanvas.current, dry, true);
      }
    };
    dry.onerror = () => {
      if (!cancelled) setBaselineError(true);
    };
    dry.src = result?.baseline === "street-imagery" || result?.cv?.registered
      ? `/api/analysis/${result.id}/baseline`
      : "/demo/dry-underpass.png";
    return () => {
      cancelled = true;
    };
  }, [photo, result, comparison, showAll]);
  return createPortal(
    <div className="ff-analysis-backdrop">
      <div
        ref={dialog}
        className="ff-analysis-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-title"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !busy) onContinue();
          if (e.key === "Tab") {
            const items = dialog.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),textarea:not(:disabled),a[href]",
            );
            if (!items?.length) return;
            const first = items[0],
              last = items[items.length - 1];
            if (
              e.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === dialog.current)
            ) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
              e.preventDefault();
              first.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <span className="ff-analysis-eyebrow">Live evidence demo</span>
            <h2 id="analysis-title">What does this photo tell us?</h2>
          </div>
          <button
            disabled={busy}
            onClick={onContinue}
            aria-label="Close photo analysis"
          >
            ×
          </button>
        </header>
        <div className="ff-analysis-layout">
          <section>
            <div className="ff-analysis-photoToolbar">
              <h3>Uploaded photo</h3>
              <button
                disabled={busy}
                aria-pressed={showAll}
                onClick={() => setShowAll((value) => !value)}
              >
                {showAll ? "Hide details" : "Show all details"}
              </button>
            </div>
            <div className="ff-analysis-imageFrame" aria-busy={busy}>
              <canvas
                ref={canvas}
                aria-label="Automatic object measurements and water-boundary candidates"
              />
              {busy && (
                <div className="ff-analysis-imageLoading" role="status">
                  <span className="ff-analysis-pulse" />
                  <strong>Analyzing your photo</strong>
                  <span>
                    {(
                      {
                        decode: "Reading image pixels",
                        search: "Finding and matching nearby street views",
                        measure: "Matching the dry scene and measuring objects",
                        assess: "Calculating depth, confidence and context",
                        save: "Saving analysis results",
                      } as Record<string, string>
                    )[stage] ?? "Calculating…"}
                  </span>
                </div>
              )}
            </div>
            {!busy && comparison && visibleMeasurements.length > 0 && (
              <div className="ff-analysis-referenceSummary">
                {visibleMeasurements.map((ref) => (
                  <div key={ref.id}>
                    <strong>{ref.id} · dry / water comparison</strong>
                    <p>
                      Dry span: {ref.referencePixels} px · submerged span:{" "}
                      {ref.submergedPixels ?? "Unknown"}
                      {ref.submergedPixels != null ? " px" : ""}
                    </p>
                    <p>
                      {ref.estimatedDepthMm == null
                        ? "No usable boundary for a length estimate."
                        : `${ref.submergedPixels} px × ${ref.mmPerPixel} mm/px ≈ ${ref.estimatedDepthMm} mm`}
                    </p>
                  </div>
                ))}
                <small>
                  *Physical length assumes a {comparison.referenceHeightMm} mm
                  reference. Candidate boundaries and object identity remain
                  unverified.
                </small>
              </div>
            )}
            <div className="ff-analysis-baseline">
              <h3>{result?.baseline === "street-imagery" ? "Closest street reference" : "Dry baseline"}</h3>
              <p>
                {result?.streetReference
                  ? `${result.streetReference.distanceMeters} m away · heading ${Math.round(result.streetReference.heading)}° · captured ${result.streetReference.capturedAt?.slice(0, 10) ?? "date unknown"} · ${result.cv?.registered ? "aligned" : "alignment uncertain"}`
                  : result?.baseline === "unavailable"
                    ? "No matching nearby street image found."
                    : result?.cv?.registered
                      ? "Stored demonstration reference · aligned to this photo"
                      : "Demonstration reference · alignment not established yet"}
              </p>
              {result?.streetReference && <p>{result.streetReference.attribution} · Historical image; dry condition unverified.</p>}
              {baselineError && (
                <p role="status">Dry baseline could not load.</p>
              )}
              <canvas
                ref={dryCanvas}
                hidden={baselineError || result?.baseline === "unavailable"}
                aria-label="Dry baseline reference measurements"
              />
            </div>
            {showAll && (
              <p className="ff-analysis-automaticNote">
                White R-lines: dry reference spans. Blue points: candidate water
                boundaries. Amber: detected edges. Green: pedestrian candidates.
              </p>
            )}
          </section>
          <section aria-live="polite">
            {busy ? (
              <AnalysisCalculatingMetrics stage={stage} />
            ) : result ? (
              <>
                <AnalysisMetrics analysis={result} />
                <dl className="ff-analysis-diagnostics">
                  <div>
                    <dt>Baseline alignment</dt>
                    <dd>
                      {result.cv?.registered
                        ? "Matched scene plane"
                        : "Not established"}
                    </dd>
                  </div>
                  <div>
                    <dt>Feature matches / inliers</dt>
                    <dd>
                      {result.cv
                        ? `${result.cv.matches} / ${result.cv.inliers}`
                        : "CV unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt>Edge calipers</dt>
                    <dd>{result.cv?.structuralEdges.length ?? 0} candidates</dd>
                  </div>
                  <div>
                    <dt>Sharpness / brightness</dt>
                    <dd>
                      {result.cv
                        ? `${result.cv.blurVariance} / ${result.cv.brightness}`
                        : "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt>CV processing</dt>
                    <dd>{result.cv?.durationMs ?? "—"} ms</dd>
                  </div>
                </dl>
                <details>
                  <summary>Pixel measurements & limitations</summary>
                  {result.cv?.structuralEdges.map((edge, i) => (
                    <p key={i}>
                      {edge.label}: {edge.pixels} px
                    </p>
                  ))}
                  {Object.entries(result.confidenceFactors ?? {}).map(
                    ([factor, value]) => (
                      <p key={factor}>
                        {factor}: +{value} evidence points
                      </p>
                    ),
                  )}
                  {result.notes.map((note, i) => (
                    <p key={i}>{note}</p>
                  ))}
                </details>
              </>
            ) : null}
            {error && (
              <p role="alert" className="ff-report-error">
                {error}
              </p>
            )}
            {!result && !busy && (
              <button onClick={() => setRetry((n) => n + 1)}>
                Retry analysis
              </button>
            )}
          </section>
        </div>
        <footer>
          <p>
            Demo estimates are not crossing clearance. Stay out of water to
            collect evidence.
          </p>
          <button
            className="ff-report-primary"
            disabled={busy}
            onClick={onContinue}
          >
            {result
              ? "Use analysis & continue"
              : "Continue without an estimate"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
export function AnalysisMetrics({ analysis }: { analysis: PublicAnalysis }) {
  return (
    <div className="ff-analysis-metrics">
      <div className="ff-analysis-score">
        <span>
          {analysis.depthSource === "demo-assumed-reference"
            ? "Automatic demo depth · 250 mm reference assumed"
            : "Estimated water depth"}
        </span>
        <strong>
          {analysis.depthMm == null ? "Unknown" : `${analysis.depthMm} mm`}
        </strong>
        <small>
          {analysis.depthRangeMm
            ? `Range: ${analysis.depthRangeMm[0]}–${analysis.depthRangeMm[1]} mm · ${analysis.depthSource}`
            : "No verified scale or water line"}
        </small>
      </div>
      <dl>
        <div>
          <dt>Evidence confidence</dt>
          <dd>{analysis.confidence}% · experimental</dd>
        </div>
        <div>
          <dt>Environmental risk score</dt>
          <dd>
            {analysis.riskScore ?? "Unknown"}
            {analysis.riskScore != null ? " / 100" : ""}
          </dd>
        </div>
        <div>
          <dt>Risk type</dt>
          <dd>{analysis.riskType}</dd>
        </div>
        <div>
          <dt>Road type</dt>
          <dd>{analysis.scene.roadType}</dd>
        </div>
        <div>
          <dt>Traffic visible</dt>
          <dd>{analysis.scene.traffic.join(", ") || "Unknown"}</dd>
        </div>
        <div>
          <dt>Hazards</dt>
          <dd>{analysis.scene.hazards.join(", ") || "Not established"}</dd>
        </div>
      </dl>
      {analysis.citizenDepthRangeMm && (
        <p>
          Separate body-reference observation: {analysis.citizenDepthRangeMm[0]}
          –{analysis.citizenDepthRangeMm[1]} mm (unverified).
        </p>
      )}
      {analysis.notes
        .filter((note) => note.startsWith("Conflicting depth references"))
        .map((note) => (
          <p key={note} className="ff-analysis-pending">
            {note}
          </p>
        ))}
      <p>{analysis.scene.explanation}</p>
      {analysis.depthSource === "demo-assumed-reference" && (
        <p className="ff-analysis-pending">
          Illustrative calculation from detected pixel spans. Object identity,
          reference height, and water boundary need review.
        </p>
      )}
      <small>
        {analysis.confidenceMeaning} Risk uses the upper depth estimate and
        observed road conditions, not verified vehicle specifications.
      </small>
      <p className="ff-analysis-pending">
        {analysis.publication === "eligible"
          ? "Evidence meets the configured publication threshold."
          : "Pending evidence · kept off the global map. Reference and depth require validation."}
      </p>
    </div>
  );
}

function AnalysisCalculatingMetrics({ stage }: { stage: string }) {
  const stages = [
    { key: "decode", label: "Read uploaded photo" },
    { key: "measure", label: "Match dry reference & measure objects" },
    { key: "assess", label: "Evaluate depth, context & confidence" },
    { key: "save", label: "Save evidence" },
  ];
  const active = stages.findIndex((item) => item.key === stage);
  return (
    <div className="ff-analysis-calculating" aria-busy="true">
      <div className="ff-analysis-stageList">
        {stages.map((item, index) => (
          <div
            key={item.key}
            className={
              index === active ? "active" : index < active ? "complete" : ""
            }
          >
            <span>{index < active ? "✓" : index + 1}</span>
            {item.label}
          </div>
        ))}
      </div>
      <div className="ff-analysis-metrics">
        <div className="ff-analysis-score">
          <span>Estimated water depth</span>
          <strong>Calculating…</strong>
        </div>
        <dl>
          {[
            "Evidence confidence",
            "Environmental risk score",
            "Risk type",
            "Road type",
            "Traffic visible",
            "Hazards",
            "Baseline alignment",
            "Feature matches / inliers",
            "Edge calipers",
            "Sharpness / brightness",
            "CV processing",
          ].map((label) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>Calculating…</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
