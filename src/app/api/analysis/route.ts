import { voiceBucket, pollyEnabled } from "../../../lib/analysis-voice";
import { analyzePhoto } from "../../../lib/analysis-engine";
import { saveAnalysis } from "../../../lib/analysis-store";
import {
  boundedBody,
  guardAnalysis,
  ownerHeaders,
  requestOwner,
} from "../../../lib/analysis-http";
import { publicAnalysis, nextQuestion } from "../../../lib/photo-analysis";
import { validatePhoto } from "../../../lib/report-store";
import { MAX_PHOTO_BYTES } from "../../../lib/report";
export async function POST(request: Request) {
  const owner = requestOwner(request);
  const headers = ownerHeaders(request, owner);
  try {
    guardAnalysis(request, owner);
    const body = await boundedBody(request, MAX_PHOTO_BYTES + 65536);
    const form = await new Response(new Uint8Array(body), {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Upload a photo to analyze.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    validatePhoto(bytes, file.type);
    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      let cancelled = false;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const emit = (event: unknown) => {
            if (!cancelled)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          try {
            const { result, photo, baseline } = await analyzePhoto(
              bytes,
              owner,
              (stage) => emit({ type: "progress", stage }),
            );
            emit({ type: "progress", stage: "save" });
            saveAnalysis(result, photo, baseline);
            emit({
              type: "result",
              analysis: publicAnalysis(result),
              question: nextQuestion(result),
            });
          } catch (error) {
            emit({
              type: "error",
              error:
                error instanceof Error
                  ? error.message
                  : "Photo analysis failed.",
            });
          } finally {
            if (!cancelled) controller.close();
          }
        },
        cancel() {
          cancelled = true;
        },
      });
      return new Response(stream, {
        headers: {
          ...headers,
          "Content-Type": "application/x-ndjson",
          "X-Accel-Buffering": "no",
        },
      });
    }
    const { result, photo, baseline } = await analyzePhoto(bytes, owner);
    saveAnalysis(result, photo, baseline);
    return Response.json(
      { analysis: publicAnalysis(result), question: nextQuestion(result) },
      { headers },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Photo analysis failed.",
      },
      { status: 400, headers },
    );
  }
}

export async function GET() {
  return Response.json(
    {
      confidenceThreshold: 75,
      baseline: "demo",
      providers: {
        bedrock: Boolean(process.env.BEDROCK_VISION_MODEL_ID),
        transcribe: Boolean(voiceBucket()),
        polly: pollyEnabled(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
