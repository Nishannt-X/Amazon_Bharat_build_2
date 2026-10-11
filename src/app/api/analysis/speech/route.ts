import {
  analysisOwner,
  boundedJson,
  guardAnalysis,
} from "../../../../lib/analysis-http";
import { speak } from "../../../../lib/analysis-voice";
import { parseVoiceLanguage } from "../../../../lib/voice-language";
export async function POST(request: Request) {
  try {
    const owner = analysisOwner(request);
    if (!owner)
      return Response.json({ error: "Upload a photo first." }, { status: 401 });
    guardAnalysis(request, owner);
    const body = await boundedJson(request);
    if (
      typeof body.text !== "string" ||
      body.text.length > 1500 ||
      !body.text.trim()
    )
      throw new Error("Question is required.");
    let language;
    try { language = parseVoiceLanguage(body.language); } catch (error) { return Response.json({error:(error as Error).message},{status:400}); }
    return new Response(Buffer.from(await speak(body.text, language)), {
      headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Speech unavailable." },
      { status: 503 },
    );
  }
}
