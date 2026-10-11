"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PhotoState } from "../lib/report";
import { photoComparison, type PublicAnalysis } from "../lib/photo-analysis";

interface Props {
  photo: PhotoState;
  initial: PublicAnalysis | null;
  onResult: (result: PublicAnalysis) => void;
  onContinue: () => void;
}
export default function PhotoAnalysisOverlay({
  photo,
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
  const [baselineLoading, setBaselineLoading] = useState(true);
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
    setBaselineLoading(true);
    setBaselineError(false);
    setStage("decode");
    setError("");
    const form = new FormData();
    form.set("photo", photo.file);
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
        if (!abort.signal.aborted) {
          setBaselineLoading(false);
          setBaselineError(true);
          setError(
            e.message ||
              "Analysis failed. Retry or continue without a depth estimate.",
          );
        }
      })
      .finally(() => {
        if (!abort.signal.aborted) setBusy(false);
      });
    return () => abort.abort();
  }, [photo.file, retry]);
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
      const sceneReferences = result?.cv?.sceneReferences;
      const referenceDepth = sceneReferences?.referenceDepth;
      if (!dry && referenceDepth) {
        if (showAll) {
          ctx.strokeStyle = "#38bdf8";
          ctx.fillStyle = "rgba(56,189,248,.10)";
          ctx.lineWidth = 2;
          for (const contour of referenceDepth.maskContours) {
            ctx.beginPath();
            contour.forEach((point, i) => i ? ctx.lineTo(point[0] * element.width, point[1] * element.height) : ctx.moveTo(point[0] * element.width, point[1] * element.height));
            ctx.closePath(); ctx.fill(); ctx.stroke();
          }
        }
        const primary = [...referenceDepth.references].filter(r => r.type === "car-wheel-prior" && (r.visibleArcEdgeSupport ?? 0) >= .7)
          .sort((a, b) => b.referencePixels - a.referencePixels)[0] ?? referenceDepth.references[0];
        for (const reference of (showAll ? referenceDepth.references : primary ? [primary] : [])) {
          const top = reference.referenceTop, bottom = reference.referenceBottom, water = reference.waterPoint;
          ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 3;
          ctx.beginPath(); ctx.moveTo(top[0] * element.width, top[1] * element.height);
          ctx.lineTo(bottom[0] * element.width, bottom[1] * element.height); ctx.stroke();
          ctx.strokeStyle = "#38bdf8"; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(water[0] * element.width, water[1] * element.height);
          ctx.lineTo(bottom[0] * element.width, bottom[1] * element.height); ctx.stroke();
          dot(water, "#38bdf8");
          label(`${reference.id} · local ~${reference.depthMm} mm · ${reference.submergedPixels}/${reference.referencePixels} px`, top[0] * element.width + 8, top[1] * element.height - 10, "#ffffff");
        }
      }
      const context = dry ? (aligned ? sceneReferences?.comparisons ?? [] : sceneReferences?.dryReferences ?? []) : sceneReferences?.wetReferences ?? [];
      for (const reference of (showAll ? context : dry ? context.filter(r => r.category === "curb").slice(0, 1) : referenceDepth?.references.length ? [] : context.filter((r) => r.category === "column").slice(0, 1))) {
        const polygon = "projectedPolygon" in reference ? reference.projectedPolygon : null;
        const box = "box" in reference ? reference.box : null;
        ctx.strokeStyle = "#ffd166";
        ctx.lineWidth = 2;
        if (polygon?.length) {
          ctx.beginPath();
          polygon.forEach((point, i) => i ? ctx.lineTo(point[0] * element.width, point[1] * element.height) : ctx.moveTo(point[0] * element.width, point[1] * element.height));
          ctx.closePath();
          ctx.stroke();
          label(`${"dryId" in reference ? reference.dryId : reference.id} · ${reference.category} · projected candidate`, polygon[0][0] * element.width, polygon[0][1] * element.height, "#ffd166");
        } else if (box) {
          ctx.strokeRect(box[0] * element.width, box[1] * element.height, box[2] * element.width, box[3] * element.height);
          label(`${"id" in reference ? reference.id : reference.dryId} · ${reference.category} · ${"visibleHeightPixels" in reference ? reference.visibleHeightPixels : reference.dryVisiblePixels} px visible`, box[0] * element.width, box[1] * element.height, "#ffd166");
        }
      }
      if (!aligned) return;
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
      if (!dry) {
        const wheels = result?.cv?.relativeAnchors ?? [];
        for (const wheel of (showAll ? wheels : !referenceDepth?.references.length && !comparison?.measurements.length ? wheels.slice(0, 1) : [])) {
          ctx.strokeStyle = "#e98eff";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(wheel.center[0] * element.width, wheel.center[1] * element.height,
            wheel.radiusPixels * element.width / (result?.cv?.width ?? element.width), 0, Math.PI * 2);
          ctx.stroke();
          label(`${wheel.id} · ${wheel.diameterPixels} px · size unverified`,
            wheel.center[0] * element.width + 8, wheel.center[1] * element.height - 8, "#e98eff");
        }
      }
      const refs =
        comparison?.measurements.filter(
          (m) =>
            showAll ||
            (!referenceDepth?.references.length && (m.id === comparison.primaryReferenceId ||
            (!comparison.primaryReferenceId && m.id === "R1"))),
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
    // Wait for the matched reference instead of flashing the default dry image.
    if (!result) return () => { cancelled = true; };
    const dry = new Image();
    dry.onload = () => {
      if (!cancelled) {
        setBaselineError(false);
        draw(dryCanvas.current, dry, true);
        setBaselineLoading(false);
      }
    };
    dry.onerror = () => {
      if (!cancelled) {
        setBaselineError(true);
        setBaselineLoading(false);
      }
    };
    dry.src = result?.cv?.registered
      ? `/api/analysis/${result.id}/baseline`
      : result?.comparison?.baselineImageUrl ?? "/demo/dry-underpass.png";
    return () => {
      cancelled = true;
    };
  }, [photo, result, comparison, showAll]);
  return createPortal(
    <div className="ff-themed ff-analysis-backdrop">
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
                        baseline: "Analyzing dry curbs, wheels and ground contact first",
                        measure: "Matching references, segmenting water and measuring local contact",
                        assess: "Calculating depth, confidence and context",
                        save: "Saving analysis results",
                      } as Record<string, string>
                    )[stage] ?? "Calculating…"}
                  </span>
                </div>
              )}
            </div>
            {!busy && result?.cv?.sceneReferences?.referenceDepth?.references.length ? <div className="ff-analysis-referenceSummary">
              <strong>Scene estimate: {result.depthMm} mm · multiple local references</strong>
              <p>White span: reconstructed circular reference. Blue span: candidate submerged portion. Each label shows a local estimate, which can differ across the road.</p>
              <small>Show all details to inspect water segmentation and every measured reference. Dimensions and ground contact are assumed.</small>
            </div> : !busy && comparison && visibleMeasurements.length > 0 && (
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
                  {comparison.referenceHeightMm == null
                    ? "Physical reference height is unknown. Pixel spans do not establish millimetres."
                    : `Physical length assumes a ${comparison.referenceHeightMm} mm reference.`}
                  {" "}Candidate boundaries and object identity remain unverified.
                </small>
              </div>
            )}
            <div className="ff-analysis-baseline">
              <h3>Dry baseline</h3>
              {comparison?.baselineLabel && <p>{comparison.baselineLabel}</p>}
              {comparison?.baselineLocation && <p>Reference location: {comparison.baselineLocation.lat}, {comparison.baselineLocation.lng}</p>}
              {!busy && <p>
                {result?.cv?.registered
                  ? "Stored dry reference · aligned to this photo"
                  : result?.cv?.sceneMatched
                    ? "Matched facade · partial alignment; road-plane measurements withheld"
                    : "Registered demo reference · alignment not established yet"}
              </p>}
              {baselineError && (
                <p role="status">Dry baseline could not load.</p>
              )}
              <div className={`ff-analysis-imageFrame ff-analysis-baselineFrame${busy || baselineLoading ? " is-loading" : ""}`} aria-busy={busy || baselineLoading}>
                <canvas
                  ref={dryCanvas}
                  hidden={baselineError}
                  style={{ visibility: busy || baselineLoading ? "hidden" : "visible" }}
                  aria-label="Dry baseline reference measurements"
                />
                {!baselineError && (busy || baselineLoading) && (
                  <div className="ff-analysis-imageLoading" role="status">
                    <span className="ff-analysis-pulse" />
                    <strong>Fetching dry baseline…</strong>
                    <span>Google Street View Static · demo reference</span>
                  </div>
                )}
              </div>
            </div>
            {showAll && (
              <p className="ff-analysis-automaticNote">
                White lines: reference spans. Blue points: candidate water
                boundaries. Amber: detected edges. Green: detected traffic. Magenta: alternative wheel candidates.
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
                        : result.cv?.sceneMatched ? "Scene recognized · road plane unverified" : "Not established"}
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
                    <dt>Matching method / supported image area</dt>
                    <dd>{result.cv?.alignmentMethod ?? "—"} · {Math.round((result.cv?.supportArea ?? 0) * 100)}%</dd>
                  </div>
                  <div>
                    <dt>Traffic detector</dt>
                    <dd>{result.cv?.detectorStatus ?? "Legacy detector"}</dd>
                  </div>
                  <div>
                    <dt>Alternative wheel references</dt>
                    <dd>{result.cv?.relativeAnchors?.length ?? 0} candidates · physical size unverified</dd>
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
                    <dd>{(result.cv?.durationMs ?? 0) + (result.cv?.sceneReferences?.durationMs ?? 0)} ms</dd>
                  </div>
                </dl>
                {result.cv?.sceneReferences?.referenceDepth && <section className="ff-analysis-metrics" aria-label="Automatic water measurement">
                  <h3>How this upload was measured</h3>
                  <p>Water segmentation · {result.cv.sceneReferences.referenceDepth.status}</p>
                  <p>Water model: {result.cv.sceneReferences.referenceDepth.modelId ?? "Unavailable"} · {result.cv.sceneReferences.referenceDepth.durationMs ?? "—"} ms</p>
                  {result.cv.sceneReferences.referenceDepth.waterEvidence && <p>Detected water region: {Math.round(result.cv.sceneReferences.referenceDepth.waterEvidence.wetCoverage * 100)}% of photo. Dry reference: {Math.round(result.cv.sceneReferences.referenceDepth.waterEvidence.dryCoverage * 100)}%. Region size is not depth.</p>}
                  {result.cv.sceneReferences.referenceDepth.references.map(reference => <div key={reference.id}>
                    <strong>{reference.id} · {reference.type.replaceAll("-", " ")}</strong>
                    <p>{reference.submergedPixels} px submerged / {reference.referencePixels} px reference × assumed {reference.dimensionRangeMm[0]}–{reference.dimensionRangeMm[1]} mm size.</p>
                    <p>Local estimate: {reference.depthMm} mm · range {reference.rangeMm[0]}–{reference.rangeMm[1]} mm.</p>
                    <small>{reference.assumption}</small>
                  </div>)}
                  <details><summary>Measurement limitations</summary>{result.cv.sceneReferences.referenceDepth.limitations.map((note, i) => <p key={i}>{note}</p>)}</details>
                </section>}
                {result.cv?.sceneReferences && <details>
                  <summary>Scene references beyond tires</summary>
                  <p>{result.cv.sceneReferences.dryReferences.length} dry candidates · {result.cv.sceneReferences.wetReferences.length} wet candidates. Detector scores describe object proposals, not depth confidence.</p>
                  <p>Reference model: {result.cv.sceneReferences.wetDetectorStatus}</p>
                  <details>
                    <summary>Dry and wet object measurements</summary>
                    {(["dry", "wet"] as const).map((side) => <div key={side}>
                      <strong>{side === "dry" ? "Dry reference" : "Uploaded photo"}</strong>
                      {(side === "dry" ? result.cv!.sceneReferences!.dryReferences : result.cv!.sceneReferences!.wetReferences).map((reference) => <p key={reference.id}>{reference.id} · {reference.category}: {reference.visibleHeightPixels} × {reference.visibleWidthPixels} px visible box · detector score {Math.round(reference.detectorScore * 100)}%. Physical size unverified.</p>)}
                    </div>)}
                  </details>
                  <details>
                    <summary>Which dry references match or disappear?</summary>
                    {result.cv.sceneReferences.comparisons.map((reference) => <p key={reference.dryId}><strong>{reference.dryId} · {reference.category} · {reference.status}</strong><br />{reference.dryVisiblePixels} px dry visible span; {reference.wetVisiblePixels ?? "unknown"} px wet visible span. {reference.reason}<br />Dry base: {reference.dryBaseAssessment.status}. {reference.dryBaseAssessment.reason}{reference.wetBaseAssessment && <><br />Wet base: {reference.wetBaseAssessment.status}. {reference.wetBaseAssessment.reason}</>}</p>)}
                    {result.cv.sceneReferences.limitations.map((note, i) => <p key={i}>{note}</p>)}
                  </details>
                </details>}
                {comparison?.baselineProfile && <details>
                  <summary>Dry reference · analysed first</summary>
                  <p>{comparison.baselineProfile.curbCandidates.length} painted-curb candidates · {comparison.baselineProfile.wheelCandidates.length} wheel candidates</p>
                  {comparison.baselineProfile.curbCandidates.map((curb) => <p key={curb.id}>{curb.id}: painted region spans {curb.visibleFacePixels} px vertically (not a measured curb height). {curb.reason}</p>)}
                  {comparison.baselineProfile.wheelCandidates.map((wheel) => <p key={wheel.id}>Dry {wheel.id}: circular span {wheel.diameterPixels} px · actual diameter unverified.</p>)}
                </details>}
                {result.anchorFusion && <details>
                  <summary>Curb + tire cross-check · {result.anchorFusion.status}</summary>
                  {result.anchorFusion.reasons.map((reason, i) => <p key={i}>{reason}</p>)}
                </details>}
                {!!result.cv?.anchorAssessments?.length && <details>
                  <summary>Why a dry reference could not measure depth</summary>
                  {result.cv.anchorAssessments.map((anchor) => <p key={anchor.id}><strong>{anchor.id} · {anchor.dryPixels} px · {anchor.status}</strong><br />{anchor.reason}</p>)}
                </details>}
                <details>
                  <summary>Pixel measurements & limitations</summary>
                  {result.cv?.relativeAnchors?.map((anchor) => <p key={anchor.id}>{anchor.id} · {anchor.objectType}: {anchor.diameterPixels} px circular span. {anchor.reason}</p>)}
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
            : analysis.depthSource === "reference-prior-estimate"
              ? "Reference-based depth · assumed dimensions"
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
          <dt>Confidence</dt>
          <dd>{analysis.confidence}%</dd>
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
      {analysis.depthSource === "reference-prior-estimate" && <p className="ff-analysis-pending">Live water segmentation and local object geometry produce this estimate. Object dimensions and ground contact remain unverified. The broad range includes these uncertainties.</p>}
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
          : "Pending evidence · kept off the global map. Demo baseline results require validation."}
      </p>
    </div>
  );
}

function AnalysisCalculatingMetrics({ stage }: { stage: string }) {
  const stages = [
    { key: "decode", label: "Read uploaded photo" },
    { key: "baseline", label: "Analyze dry curb, wheels & ground first" },
    { key: "measure", label: "Match references, detect water & measure contact" },
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
