import { accessDenied } from "../../../../../lib/demo-access";
import { parseVoiceLanguage } from "../../../../../lib/voice-language";
import { contextQuestion } from "../../../../../lib/context-questions";
import { assessContextAnswer, reassessContext } from "../../../../../lib/context-assessment";
import { readAnalysis, readPhotoAnalysis, saveAnalysis } from "../../../../../lib/analysis-store";
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
  type QuantitativeQuestion,
} from "../../../../../lib/aws/bedrock";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = accessDenied(request);
  if (denied) return denied;
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
    const language = parseVoiceLanguage(body.language);
    const photo = readPhotoAnalysis(id,owner) ?? result;
    if (body.reassess === true) {
      result = await reassessContext(result,photo);
    } else if (body.calibration) {
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

      const currentQuestion = nextQuestion(result);
      if (!currentQuestion) throw new Error("All context questions are answered. Re-evaluate existing answers instead.");
      const previous = result;
      const requestedOption = body.option && typeof body.option === "object" ? (body.option as Record<string,unknown>).id : null;
      const selectedOption = requestedOption != null ? contextQuestion(result.answers.length)?.options.find(option => option.id === requestedOption) : null;
      if (requestedOption != null && !selectedOption) throw new Error("That option does not belong to the current question. Reload context and try again.");
      // Client/model-provided depth and confidence fields are never authoritative.
      result = applyAnswer(result, selectedOption?.label ?? body.answer.trim());
      if (selectedOption) {
        if (typeof selectedOption.movingWater === "boolean") result.scene.movingWater = selectedOption.movingWater;
        if (typeof selectedOption.roadSurfaceVisible === "boolean") result.scene.roadSurfaceVisible = selectedOption.roadSurfaceVisible;
        if (selectedOption.hazard) result.scene.hazards = Array.from(new Set([...result.scene.hazards,selectedOption.hazard]));
        result = withRisk(result);
      }
      // Every answer, including a selected choice, receives one bounded LLM assessment.
      result = await assessContextAnswer(result,previous,photo,currentQuestion,selectedOption?.label ?? body.answer.trim());
    }

    saveAnalysis(result);

    let nextMcq: QuantitativeQuestion | null = null;
    if (result.answers.length < 4) {
      try {
        nextMcq = await generateQuantitativeMcqQuestion(result, language);
      } catch {}
    }

    return Response.json(
      {
        analysis: publicAnalysis(result),
        question: result.answers.length >= 4 ? null : (nextMcq?.question || nextQuestion(result)),
        mcq: result.answers.length >= 4 ? null : nextMcq,
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
