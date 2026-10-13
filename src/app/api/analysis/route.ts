import { deepgramEnabled } from "../../../lib/deepgram-voice";
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

/** Optional photo location (lat/lng form fields); invalid or partial values are ignored. */
function photoLocation(form: FormData) {
  const lat = Number(form.get("lat")), lng = Number(form.get("lng"));
  if (form.get("lat") === null || form.get("lng") === null) return null;
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? { lat, lng } : null;
}
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
    const location = photoLocation(form);
    const mode = form.get("mode") === "upload" ? "upload" : "demo";
    if (request.headers.get("accept")?.includes("application/x-ndjson")) {
      let cancelled = false;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const emit = (event: unknown) => {
            if (!cancelled)
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
          };
          const heartbeat = setInterval(() => emit({type:"heartbeat"}), 15000);
          try {
            const { result, photo, baseline } = await analyzePhoto(
              bytes,
              owner,
              (stage) => emit({ type: "progress", stage }),
              location,
              mode,
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
            clearInterval(heartbeat);
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
    const { result, photo, baseline } = await analyzePhoto(bytes, owner, undefined, location, mode);
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
        deepgram: deepgramEnabled(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
