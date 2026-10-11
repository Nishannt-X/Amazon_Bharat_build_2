import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import {
  PollyClient,
  SynthesizeSpeechCommand,
} from "@aws-sdk/client-polly";
import { parseVoiceLanguage, type VoiceLanguage } from "./voice-language";

export const voiceBucket = () => process.env.TRANSCRIBE_BUCKET || process.env.S3_EVIDENCE_BUCKET || null;
export const pollyEnabled = () => process.env.POLLY_ENABLED !== "false";
const region = () => process.env.TRANSCRIBE_REGION || process.env.S3_REGION || process.env.AWS_REGION || "ap-south-1";
const pollyRegion = () => process.env.POLLY_REGION || process.env.AWS_REGION || "ap-south-1";
export async function startVoice(bytes: Buffer, mime: string, id: string, language: VoiceLanguage = "en-IN") {
  parseVoiceLanguage(language);
  const bucket = voiceBucket();
  if (!bucket)
    throw new Error(
      "Amazon Transcribe is not configured. You can type your answer.",
    );
  const format = mime.startsWith("audio/webm")
    ? "webm"
    : mime.startsWith("audio/ogg")
      ? "ogg"
      : mime.startsWith("audio/mpeg")
        ? "mp3"
    : mime.startsWith("audio/mp4")
        ? "mp4"
        : null;
  if (!format) throw new Error("Use a WebM, Ogg, MP3, or MP4 audio recording.");
  const key = `voice/recordings/${id}.${format}`;
  const signal = AbortSignal.timeout(15000);
  await new S3Client({ region: region(), maxAttempts: 1 }).send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: bytes,
      ContentType: mime,
      ServerSideEncryption: "AES256",
    }),
    { abortSignal: signal },
  );
  try { await new TranscribeClient({ region: region(), maxAttempts: 1 }).send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: id,
      LanguageCode: language,
      MediaFormat: format,
      Media: { MediaFileUri: `s3://${bucket}/${key}` },
      OutputBucketName: bucket,
      OutputKey: `voice/transcripts/${id}.json`,
    }),
    { abortSignal: signal },
  ); } catch (error) {
    if (error instanceof Error && /AccessDenied/.test(error.name)) throw new Error(/service control policy/i.test(error.message) ? "Amazon Transcribe is blocked by your AWS organization policy. Ask the organization administrator to enable Transcribe." : "Amazon Transcribe permission is missing. Ask your AWS administrator to grant transcription access.");
    throw error;
  }
}
export async function readVoice(id: string) {
  const result = await new TranscribeClient({
    region: region(),
    maxAttempts: 1,
  }).send(new GetTranscriptionJobCommand({ TranscriptionJobName: id }), {
    abortSignal: AbortSignal.timeout(15000),
  });
  const job = result.TranscriptionJob;
  if (job?.TranscriptionJobStatus === "FAILED") return {status:"FAILED",text:null,error:"Amazon Transcribe could not process this recording. Record again or type your answer."};
  if (job?.TranscriptionJobStatus !== "COMPLETED")
    return { status: job?.TranscriptionJobStatus ?? "QUEUED", text: null };
  // Read the known output bucket/key using the SDK, never a caller-provided URL.
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const output = await new S3Client({ region: region() }).send(
    new GetObjectCommand({
      Bucket: voiceBucket()!,
      Key: `voice/transcripts/${id}.json`,
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  const data = JSON.parse(await output.Body!.transformToString());
  return {
    status: "COMPLETED",
    language: job.LanguageCode ?? data.results?.language_code ?? null,
    text: String(data.results?.transcripts?.[0]?.transcript ?? "").slice(
      0,
      2000,
    ),
  };
}
export async function speak(text: string, language: VoiceLanguage = "en-IN") {
  parseVoiceLanguage(language);
  if (!pollyEnabled())
    throw new Error("Amazon Polly is not configured.");
  const voice = process.env.POLLY_VOICE_ID === "Aditi" ? "Aditi" : "Kajal";
  const requestedRate = Number(process.env.POLLY_SPEECH_RATE || 125);
  const rate = Number.isFinite(requestedRate) ? Math.min(150, Math.max(100, requestedRate)) : 125;
  const escaped = text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&apos;");
  const result = await new PollyClient({
    region: pollyRegion(),
    maxAttempts: 1,
  }).send(
    new SynthesizeSpeechCommand({
      Text: `<speak><prosody rate="${rate}%">${escaped}</prosody></speak>`,
      TextType: "ssml",
      VoiceId: voice,
      LanguageCode: language,
      OutputFormat: "mp3",
      Engine: voice === "Kajal" ? "neural" : "standard",
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  return result.AudioStream!.transformToByteArray();
}
