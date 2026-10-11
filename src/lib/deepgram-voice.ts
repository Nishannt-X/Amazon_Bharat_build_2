import { parseVoiceLanguage, type VoiceLanguage } from "./voice-language";

export function deepgramEnabled() { return Boolean(process.env.DEEPGRAM_API_KEY?.trim()); }
export async function transcribeDeepgram(bytes: Buffer, mime: string, language: VoiceLanguage) {
  parseVoiceLanguage(language);
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) throw new Error("Deepgram is not configured. You can still type your answer.");
  if (!/^audio\/(webm|ogg|mp4|mpeg)(?:;|$)/i.test(mime)) throw new Error("Use a WebM, Ogg, MP4 or MP3 recording.");
  const url = new URL("https://api.deepgram.com/v1/listen");
  url.searchParams.set("model",process.env.DEEPGRAM_MODEL || "nova-3");
  url.searchParams.set("language",language === "hi-IN" ? "hi" : "en");
  url.searchParams.set("smart_format","true");
  url.searchParams.set("punctuate","true");
  const response = await fetch(url,{method:"POST",headers:{Authorization:`Token ${key}`,"Content-Type":mime},body:new Uint8Array(bytes).buffer,signal:AbortSignal.timeout(20000)});
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "Deepgram rejected the API key or its permissions. Check the server configuration." : "Deepgram transcription is unavailable. Retry or type your answer.");
  const data = await response.json();
  const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
  if (typeof transcript !== "string" || !transcript.trim()) throw new Error("No clear speech was found. Record again or type your answer.");
  return {status:"COMPLETED" as const,text:transcript.trim().slice(0,2000),language,provider:"deepgram" as const};
}
