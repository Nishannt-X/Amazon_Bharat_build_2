import {
  readAnalysis,
  readPhotoAnalysis,
} from "../../../../lib/analysis-store";
import { analysisOwner } from "../../../../lib/analysis-http";
import { publicAnalysis, nextQuestion } from "../../../../lib/photo-analysis";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = analysisOwner(request);
  const { id } = await params;
  const result = owner ? readAnalysis(id, owner) : null;
  return result
    ? Response.json(
        {
          analysis: publicAnalysis(result),
          photoAnalysis: owner
            ? (() => {
                const raw = readPhotoAnalysis(id, owner);
                return raw ? publicAnalysis(raw) : null;
              })()
            : null,
          question: nextQuestion(result),
        },
        { headers: { "Cache-Control": "no-store" } },
      )
    : Response.json({ error: "Analysis not found." }, { status: 404 });
}
