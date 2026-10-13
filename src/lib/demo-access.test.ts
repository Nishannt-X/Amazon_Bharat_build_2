import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { accessCookie, accessDenied, allowPasscodeAttempt, hasDemoAccess, sameAccessOrigin, validPasscode } from "./demo-access";
import { POST, DELETE } from "../app/api/demo-access/route";

const origin = "http://localhost:3000";
const request = (cookie = "") => new Request(`${origin}/api/analysis`, { headers: { cookie } });
const previous = process.env.FLOODFLOW_PASSCODE;
test.after(() => { if (previous === undefined) delete process.env.FLOODFLOW_PASSCODE; else process.env.FLOODFLOW_PASSCODE = previous; });

test("unconfigured access fails closed, including a previously issued cookie", () => {
  process.env.FLOODFLOW_PASSCODE = randomBytes(24).toString("hex");
  const cookie = accessCookie(request(), true);
  delete process.env.FLOODFLOW_PASSCODE;
  assert.equal(hasDemoAccess(request(cookie)), false);
  assert.equal(validPasscode(""), false);
  assert.equal(accessDenied(request(cookie))?.status, 403);
});

test("signed sessions accept only valid, unexpired cookies and revoke after rotation", () => {
  process.env.FLOODFLOW_PASSCODE = randomBytes(24).toString("hex");
  const now = Date.now();
  const cookie = accessCookie(request(), true, now);
  assert.equal(hasDemoAccess(request(cookie), now), true);
  assert.equal(accessDenied(request(cookie)), null);
  assert.equal(hasDemoAccess(request(cookie), now + 4 * 3600000), false);
  const [token] = cookie.split(";");
  assert.equal(hasDemoAccess(request(`${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`)), false);
  assert.equal(hasDemoAccess(request(`${token}.extra`)), false);
  assert.equal(hasDemoAccess(request("ff_demo_access=true")), false);
  process.env.FLOODFLOW_PASSCODE = randomBytes(24).toString("hex");
  assert.equal(hasDemoAccess(request(cookie)), false);
});

test("cookies are HttpOnly, SameSite strict and secure on HTTPS; locking clears them", () => {
  process.env.FLOODFLOW_PASSCODE = randomBytes(24).toString("hex");
  const cookie = accessCookie(new Request("https://floodflow.example/api/demo-access"), true);
  assert.match(cookie, /HttpOnly; SameSite=Strict; Path=\//);
  assert.match(cookie, /; Secure$/);
  assert.match(accessCookie(request(), false), /ff_demo_access=;.*Max-Age=0/);
});

test("unlock endpoint rejects missing/cross-site origins, wrong passcodes and oversized streams", async () => {
  process.env.FLOODFLOW_PASSCODE = randomBytes(24).toString("hex");
  assert.equal(sameAccessOrigin(request()), false);
  const make = (body: string, source = origin) => new Request(`${origin}/api/demo-access`, { method: "POST", headers: { origin: source, "Content-Type": "application/json", "x-forwarded-for": "test-endpoint" }, body });
  assert.equal((await POST(make("{}", "https://other.example"))).status, 403);
  assert.equal((await POST(make(JSON.stringify({ passcode: "incorrect" })))).status, 403);
  assert.equal((await POST(make("x".repeat(2049)))).status, 413);
  const response = await POST(make(JSON.stringify({ passcode: process.env.FLOODFLOW_PASSCODE })));
  assert.equal(response.status, 200);
  assert.equal(hasDemoAccess(request(response.headers.get("set-cookie")!)), true);
  assert.deepEqual(await response.json(), { unlocked: true });
  const lock = await DELETE(new Request(`${origin}/api/demo-access`, { method: "DELETE", headers: { origin } }));
  assert.equal(lock.status, 200);
  assert.match(lock.headers.get("set-cookie")!, /Max-Age=0/);
});

test("guess attempts are bounded even with rotating client addresses", () => {
  const now = Date.now() + 120000;
  const same = new Request(origin, { headers: { "x-forwarded-for": "test-limit" } });
  for (let i = 0; i < 10; i++) assert.equal(allowPasscodeAttempt(same, now), true);
  assert.equal(allowPasscodeAttempt(same, now), false);
  for (let i = 0; i < 90; i++) assert.equal(allowPasscodeAttempt(new Request(origin, { headers: { "x-forwarded-for": `rotating-${i}` } }), now), true);
  assert.equal(allowPasscodeAttempt(new Request(origin, { headers: { "x-forwarded-for": "new-address" } }), now), false);
  assert.equal(allowPasscodeAttempt(same, now + 60001), true);
});
