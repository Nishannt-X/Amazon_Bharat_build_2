import { randomUUID } from "node:crypto";
import { currentAccount, isAccountOwner, secureCookie } from "./account-store";
const buckets = new Map<string, { count: number; expires: number }>();
export function analysisOwner(request: Request) {
  const account = currentAccount(request);
  if (account) return account.id;
  return guestEvidenceOwner(request);
}
export function guestEvidenceOwner(request: Request) {
  const owner = (
    request.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)ff_evidence=([a-f0-9-]{36})(?:;|$)/)?.[1] ?? null
  );
  return owner && !isAccountOwner(owner) ? owner : null;
}
export function ownerHeaders(request: Request, owner: string) {
  return {
    "Cache-Control": "no-store",
    ...(currentAccount(request) ? {} : {"Set-Cookie": `ff_evidence=${owner}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000${secureCookie(request) ? "; Secure" : ""}`}),
  };
}
export function requestOwner(request: Request) {
  return analysisOwner(request) ?? randomUUID();
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    if (!["http:", "https:"].includes(source.protocol)) return false;
    const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
    const host = forwardedHost || request.headers.get("host") || new URL(request.url).host;
    const hostName = host.split(":")[0];
    const directHost = (request.headers.get("host") || "").split(":")[0];
    return (
      source.host === host ||
      source.hostname === hostName ||
      (directHost !== "" && source.hostname === directHost) ||
      source.hostname.endsWith(".cloudfront.net") ||
      source.hostname === "localhost" ||
      source.hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}
export function guardAnalysis(request: Request, owner: string) {
  if (!sameOrigin(request))
    throw new Error("Cross-site analysis requests are not allowed.");
  const now = Date.now();
  if (buckets.size > 10000)
    for (const [key, b] of buckets) if (b.expires < now) buckets.delete(key);
  const bucket = buckets.get(owner);
  if (bucket && bucket.expires > now) {
    if (bucket.count >= 12)
      throw new Error("Too many requests. Wait one minute.");
    bucket.count++;
  } else buckets.set(owner, { count: 1, expires: now + 60000 });
}
export async function boundedBody(
  request: Request,
  max: number,
): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > max)
    throw new Error("Upload is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Request body is required.");
  const chunks: Uint8Array[] = [];
  let count = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    count += item.value.length;
    if (count > max) {
      await reader.cancel();
      throw new Error("Upload is too large.");
    }
    chunks.push(item.value);
  }
  return Buffer.concat(chunks);
}
export async function boundedJson(
  request: Request,
  max = 16000,
): Promise<Record<string, unknown>> {
  const result = JSON.parse((await boundedBody(request, max)).toString());
  if (!result || typeof result !== "object" || Array.isArray(result))
    throw new Error("Invalid request.");
  return result;
}
