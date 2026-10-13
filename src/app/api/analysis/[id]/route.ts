import { accessDenied } from "../../../../lib/demo-access";
import { parseVoiceLanguage } from "../../../../lib/voice-language";
import {
  readAnalysis,
  readPhotoAnalysis,
} from "../../../../lib/analysis-store";
import { analysisOwner } from "../../../../lib/analysis-http";
import { publicAnalysis, nextQuestion } from "../../../../lib/photo-analysis";
import { generateQuantitativeMcqQuestion, type QuantitativeQuestion } from "../../../../lib/aws/bedrock";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = accessDenied(request);
  if (denied) return denied;
  const owner = analysisOwner(request);
  const { id } = await params;
  const result = owner ? readAnalysis(id, owner) : null;
  if (!result) {
    return Response.json({ error: "Analysis not found." }, { status: 404 });
  }

  let language;
  try { language = parseVoiceLanguage(new URL(request.url).searchParams.get("language")); } catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
  let mcq: QuantitativeQuestion | null = null;
  if (result.answers.length < 4) {
    try {
      mcq = await generateQuantitativeMcqQuestion(result, language);
    } catch {}
  }

  return Response.json(
    {
      analysis: publicAnalysis(result),
      photoAnalysis: owner
        ? (() => {
            const raw = readPhotoAnalysis(id, owner);
            return raw ? publicAnalysis(raw) : null;
          })()
        : null,
      question: result.answers.length >= 4 ? null : (mcq?.question || nextQuestion(result)),
      mcq: result.answers.length >= 4 ? null : mcq,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
