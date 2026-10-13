import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const cookieName = "ff_demo_access";
const lifetime = 4 * 60 * 60;
const equal = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
const secret = () => process.env.FLOODFLOW_PASSCODE?.trim() || "";
const sign = (payload: string) => createHmac("sha256", secret()).update(`floodflow-access-v1:${payload}`).digest("hex");

export function hasDemoAccess(request: Request, now = Date.now()): boolean {
  if (!secret()) return false;
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)ff_demo_access=([^;]+)/)?.[1];
  if (!token || token.length > 200) return false;
  const [expires, nonce, signature, extra] = token.split(".");
  if (extra || !/^\d{10}$/.test(expires) || !/^[a-f0-9]{32}$/.test(nonce ?? "") || !/^[a-f0-9]{64}$/.test(signature ?? "")) return false;
  const expiry = Number(expires);
  return expiry > Math.floor(now / 1000) && expiry <= Math.floor(now / 1000) + lifetime
    && equal(signature, sign(`${expires}.${nonce}`));
}

export function accessDenied(request: Request): Response | null {
  if (hasDemoAccess(request)) return null;
  return Response.json({ error: "Enter the passcode to unlock this action." }, { status: 403, headers: { "Cache-Control": "no-store" } });
}

export function validPasscode(value: unknown): boolean {
  return !!secret() && typeof value === "string" && value.length <= 256 && equal(value, secret());
}

export function accessConfigured() { return !!secret(); }

export function sameAccessOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    const source = new URL(origin);
    const host = request.headers.get("x-forwarded-host")?.split(",")[0].trim() || request.headers.get("host") || new URL(request.url).host;
    const hostName = host.split(":")[0];
    return (
      source.host === host ||
      source.hostname === hostName ||
      source.hostname.endsWith(".cloudfront.net") ||
      source.hostname === "localhost" ||
      source.hostname === "127.0.0.1"
    );
  } catch { return false; }
}

export function accessCookie(request: Request, unlock: boolean, now = Date.now()): string {
  const payload = `${Math.floor(now / 1000) + lifetime}.${randomBytes(16).toString("hex")}`;
  const token = unlock ? `${payload}.${sign(payload)}` : "";
  const secure = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https" || process.env.FLOODFLOW_PUBLIC_PROTOCOL === "https";
  return `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${unlock ? lifetime : 0}${secure ? "; Secure" : ""}`;
}

// A global cap also bounds guessing with rotating client addresses. No paid calls occur here.
const attempts = new Map<string, { count: number; expires: number }>();
export function allowPasscodeAttempt(request: Request, now = Date.now()): boolean {
  const address = request.headers.get("x-forwarded-for")?.split(",")[0].trim().slice(0, 100) || "local";
  for (const [key, bucket] of attempts) if (bucket.expires <= now) attempts.delete(key);
  const keys = [["global", 100], [`ip:${address}`, 10]] as const;
  if (keys.some(([key, limit]) => (attempts.get(key)?.count ?? 0) >= limit)) return false;
  for (const [key] of keys) {
    const bucket = attempts.get(key) ?? { count: 0, expires: now + 60000 };
    bucket.count++; attempts.set(key, bucket);
  }
  return true;
}
