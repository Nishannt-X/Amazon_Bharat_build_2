import { readAnalysis, saveAnalysis } from "../../../../../lib/analysis-store";
import {
  analysisOwner,
  boundedJson,
  guardAnalysis,
} from "../../../../../lib/analysis-http";
import {
  applyAnswer,
  caliperDepth,
  nextQuestion,
  publicAnalysis,
  withRisk,
  evidenceQuality,
} from "../../../../../lib/photo-analysis";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const owner = analysisOwner(request);
    if (!owner)
      return Response.json(
        { error: "Analysis session expired." },
        { status: 401 },
      );
    guardAnalysis(request, owner);
    const { id } = await params;
    let result = readAnalysis(id, owner);
    if (!result)
      return Response.json({ error: "Analysis not found." }, { status: 404 });
    const body = await boundedJson(request);
    if (body.calibration) {
      const c = body.calibration as Record<string, unknown>;
      if (!result.cv?.registered)
        throw new Error(
          "Images did not align. Metric comparison is not available.",
        );
      const points = [c.top, c.bottom, c.water];
      if (points.some((p) => !Array.isArray(p) || p.length !== 2))
        throw new Error("Three calibration points are required.");
      const [top, bottom, water] = points as number[][];
      // Normalize x by the image aspect so projections use square pixels.
      const aspect = result.cv.width / result.cv.height;
      const depth = caliperDepth(
        Number(c.heightMm),
        top,
        bottom,
        water,
        aspect,
      );
      result = withRisk({
        ...result,
        depthMm: depth,
        depthRangeMm: [
          Math.max(0, Math.round(depth * 0.8)),
          Math.round(depth * 1.2 + 10),
        ],
        depthSource: "calibrated-caliper",
        ...evidenceQuality(result.cv, "calibrated-caliper"),
        notes: [
          ...result.notes.filter((note) => !note.startsWith("Caliper uses")),
          "Caliper uses a user-provided height and reviewed image points. ±20% + 10 mm is a heuristic range, not validated accuracy.",
        ],
      });
    } else {
      if (
        typeof body.answer !== "string" ||
        !body.answer.trim() ||
        body.answer.length > 2000
      )
        throw new Error("Answer must contain 1–2000 characters.");
      result = applyAnswer(result, body.answer.trim());
    }
    saveAnalysis(result);
    return Response.json(
      { analysis: publicAnalysis(result), question: nextQuestion(result) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save evidence.",
      },
      { status: 400 },
    );
  }
}
