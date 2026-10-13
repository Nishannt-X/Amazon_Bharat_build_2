import { accessDenied } from "../../../../lib/demo-access";
import { deepgramEnabled, transcribeDeepgram } from "../../../../lib/deepgram-voice";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  analysisOwner,
  boundedBody,
  guardAnalysis,
} from "../../../../lib/analysis-http";
import { startVoice, readVoice } from "../../../../lib/analysis-voice";
import { parseVoiceLanguage } from "../../../../lib/voice-language";
const ownerTag = (owner: string) =>
  createHash("sha256").update(owner).digest("hex").slice(0, 16);
export async function POST(request: Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    const owner = analysisOwner(request);
    if (!owner)
      return Response.json({ error: "Upload a photo first." }, { status: 401 });
    guardAnalysis(request, owner);
    let language;
    try { language = parseVoiceLanguage(new URL(request.url).searchParams.get("language")); } catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
    const bytes = await boundedBody(request, 3 * 1024 * 1024);
    if (!bytes.length) throw new Error("Record an answer first.");
    if (deepgramEnabled()) return Response.json(await transcribeDeepgram(bytes, request.headers.get("content-type") ?? "",language),{headers:{"Cache-Control":"no-store"}});
    const id = `ff-${ownerTag(owner)}-${randomUUID()}`;
    await startVoice(bytes, request.headers.get("content-type") ?? "", id, language);
    return Response.json(
      { jobId: id },
      { status: 202, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Voice service unavailable.",
      },
      { status: 503 },
    );
  }
}
export async function GET(request: Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    const owner = analysisOwner(request);
    const id = new URL(request.url).searchParams.get("jobId");
    if (
      !owner ||
      !id ||
      !new RegExp(`^ff-${ownerTag(owner)}-[a-f0-9-]{36}$`).test(id)
    )
      return Response.json({ error: "Recording not found." }, { status: 404 });
    return Response.json(await readVoice(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Voice transcription could not be read." },
      { status: 503 },
    );
  }
}
