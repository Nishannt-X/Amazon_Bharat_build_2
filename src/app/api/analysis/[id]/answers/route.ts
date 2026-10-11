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
import {
  generateQuantitativeMcqQuestion,
  evaluateObservationAnswer,
  type McqOption,
  type QuantitativeQuestion,
} from "../../../../../lib/aws/bedrock";

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

      const currentQuestion = nextQuestion(result) || "Observation details";
      result = applyAnswer(result, body.answer.trim());

      // If a structured quantitative option was selected:
      const selectedOption = (body.option && typeof body.option === "object") ? body.option as McqOption : null;
      if (selectedOption) {
        if (selectedOption.depthMm != null) {
          result.depthMm = selectedOption.depthMm;
          result.depthRangeMm = [
            Math.max(0, Math.round(selectedOption.depthMm * 0.8)),
            Math.round(selectedOption.depthMm * 1.2)
          ];
          result.depthSource = "citizen-body-reference";
        }
        if (selectedOption.movingWater === true) {
          result.scene.movingWater = true;
        } else if (selectedOption.movingWater === false) {
          result.scene.movingWater = false;
        }
        if (selectedOption.hazard) {
          const hazards = new Set(result.scene.hazards);
          hazards.add(selectedOption.hazard);
          result.scene.hazards = Array.from(hazards);
        }
        if (selectedOption.confidenceBonus) {
          const baseConfidence = result.contextConfidence ?? result.confidence;
          result.contextConfidence = Math.min(95, baseConfidence + selectedOption.confidenceBonus);
        }
        result = withRisk(result);
      } else {
        // Free-text evaluation fallback via Bedrock
        try {
          const evalResult = await evaluateObservationAnswer(currentQuestion, body.answer.trim());
          if (evalResult) {
            if (evalResult.movingWater === true) {
              result.scene.movingWater = true;
            }
            if (evalResult.roadSurfaceVisible === false) {
              result.scene.roadSurfaceVisible = false;
            }
            if (Array.isArray(evalResult.hazardsToAdd) && evalResult.hazardsToAdd.length > 0) {
              const existing = new Set(result.scene.hazards);
              for (const h of evalResult.hazardsToAdd) {
                if (h && !existing.has(h)) existing.add(h);
              }
              result.scene.hazards = Array.from(existing);
            }
            if (evalResult.confidenceDelta) {
              const baseConfidence = result.contextConfidence ?? result.confidence;
              result.contextConfidence = Math.min(95, Math.max(10, baseConfidence + evalResult.confidenceDelta));
            }
            result = withRisk(result);
          }
        } catch (e) {
          console.warn("[Bedrock RAG] Answer evaluation skipped:", (e as Error).message);
        }
      }
    }

    saveAnalysis(result);

    let nextMcq: QuantitativeQuestion | null = null;
    if (result.answers.length < 3) {
      try {
        nextMcq = await generateQuantitativeMcqQuestion(result);
      } catch {}
    }

    return Response.json(
      {
        analysis: publicAnalysis(result),
        question: result.answers.length >= 3 ? null : (nextMcq?.question || nextQuestion(result)),
        mcq: result.answers.length >= 3 ? null : nextMcq,
      },
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
