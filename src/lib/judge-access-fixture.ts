// Test-only helper: existing account/evidence tests run inside unlocked judge access.
import { randomBytes } from "node:crypto";
import { accessCookie } from "./demo-access";

export function judgeRequest(input: string | URL | Request, init?: RequestInit): Request {
  process.env.FLOODFLOW_PASSCODE ||= randomBytes(24).toString("hex");
  const request = new Request(input, init);
  const token = accessCookie(request, true).split(";")[0];
  const cookie = request.headers.get("cookie");
  request.headers.set("cookie", cookie ? `${cookie}; ${token}` : token);
  return request;
}
