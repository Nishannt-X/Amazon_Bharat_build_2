import { accessConfigured, accessCookie, allowPasscodeAttempt, hasDemoAccess, sameAccessOrigin, validPasscode } from "../../../lib/demo-access";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  return Response.json({ unlocked: hasDemoAccess(request), configured: accessConfigured() }, { headers });
}
export async function POST(request: Request) {
  if (!sameAccessOrigin(request)) return Response.json({ error: "Unlock from this site's passcode field." }, { status: 403, headers });
  if (!allowPasscodeAttempt(request)) return Response.json({ error: "Too many attempts. Wait one minute." }, { status: 429, headers: { ...headers, "Retry-After": "60" } });
  if (!accessConfigured()) return Response.json({ error: "Passcode access has not been configured yet." }, { status: 503, headers });
  try {
    // Stream-bound even when Content-Length is omitted or inaccurate.
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      bytes += item.value.length;
      if (bytes > 2048) { await reader.cancel(); return Response.json({ error: "Passcode request is too large." }, { status: 413, headers }); }
      chunks.push(item.value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!validPasscode(body?.passcode)) return Response.json({ error: "Incorrect passcode." }, { status: 403, headers });
    return Response.json({ unlocked: true }, { headers: { ...headers, "Set-Cookie": accessCookie(request, true) } });
  } catch { return Response.json({ error: "Enter a valid passcode." }, { status: 400, headers }); }
}
export async function DELETE(request: Request) {
  if (!sameAccessOrigin(request)) return Response.json({ error: "Lock access from this site." }, { status: 403, headers });
  return Response.json({ unlocked: false }, { headers: { ...headers, "Set-Cookie": accessCookie(request, false) } });
}
