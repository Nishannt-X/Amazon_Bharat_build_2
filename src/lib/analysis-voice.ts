import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand,
} from "@aws-sdk/client-transcribe";
import {
  PollyClient,
  SynthesizeSpeechCommand,
  type VoiceId,
} from "@aws-sdk/client-polly";
const region = () => process.env.AWS_REGION || "ap-south-1";
export async function startVoice(bytes: Buffer, mime: string, id: string) {
  const bucket = process.env.TRANSCRIBE_BUCKET;
  if (!bucket)
    throw new Error(
      "Amazon Transcribe is not configured. You can type your answer.",
    );
  const format = mime.startsWith("audio/webm")
    ? "webm"
    : mime.startsWith("audio/ogg")
      ? "ogg"
      : mime.startsWith("audio/mp4")
        ? "mp4"
        : null;
  if (!format) throw new Error("Use a WebM, Ogg, or MP4 audio recording.");
  const key = `voice/${id}.${format}`;
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
  await new TranscribeClient({ region: region(), maxAttempts: 1 }).send(
    new StartTranscriptionJobCommand({
      TranscriptionJobName: id,
      LanguageCode: "en-IN",
      MediaFormat: format,
      Media: { MediaFileUri: `s3://${bucket}/${key}` },
      OutputBucketName: bucket,
      OutputKey: `transcripts/${id}.json`,
    }),
    { abortSignal: signal },
  );
}
export async function readVoice(id: string) {
  const result = await new TranscribeClient({
    region: region(),
    maxAttempts: 1,
  }).send(new GetTranscriptionJobCommand({ TranscriptionJobName: id }), {
    abortSignal: AbortSignal.timeout(15000),
  });
  const job = result.TranscriptionJob;
  if (job?.TranscriptionJobStatus !== "COMPLETED")
    return { status: job?.TranscriptionJobStatus ?? "QUEUED", text: null };
  // Read the known output bucket/key using the SDK, never a caller-provided URL.
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const output = await new S3Client({ region: region() }).send(
    new GetObjectCommand({
      Bucket: process.env.TRANSCRIBE_BUCKET,
      Key: `transcripts/${id}.json`,
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  const data = JSON.parse(await output.Body!.transformToString());
  return {
    status: "COMPLETED",
    text: String(data.results?.transcripts?.[0]?.transcript ?? "").slice(
      0,
      2000,
    ),
  };
}
export async function speak(text: string) {
  if (process.env.POLLY_ENABLED !== "true")
    throw new Error("Amazon Polly is not configured.");
  const result = await new PollyClient({
    region: region(),
    maxAttempts: 1,
  }).send(
    new SynthesizeSpeechCommand({
      Text: text,
      TextType: "text",
      VoiceId: (process.env.POLLY_VOICE_ID || "Aditi") as VoiceId,
      OutputFormat: "mp3",
      Engine: "standard",
    }),
    { abortSignal: AbortSignal.timeout(15000) },
  );
  return result.AudioStream!.transformToByteArray();
}
