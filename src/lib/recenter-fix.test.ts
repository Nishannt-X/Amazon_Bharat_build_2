import assert from "node:assert/strict";
import test from "node:test";
import { approximateLocationNote, usableRecenterFix } from "./recenter-fix";

const now = Date.parse("2026-01-01T10:00:00Z");
const fix = (over: Partial<{ lat: number; lng: number; accuracyMeters: number; capturedAt: string }> = {}) =>
  ({ lat: 28.63, lng: 77.22, accuracyMeters: 8, capturedAt: new Date(now - 2000).toISOString(), ...over });

test("a recent device fix is reused", () => assert.equal(usableRecenterFix(fix(), now)?.lat, 28.63));
test("a stale fix is rejected so a fresh one is requested", () => assert.equal(usableRecenterFix(fix({ capturedAt: new Date(now - 60000).toISOString() }), now), null));
test("missing, malformed and future fixes are rejected", () => {
  assert.equal(usableRecenterFix(null, now), null);
  assert.equal(usableRecenterFix(fix({ lat: Number.NaN }), now), null);
  assert.equal(usableRecenterFix(fix({ lng: 200 }), now), null);
  assert.equal(usableRecenterFix(fix({ capturedAt: "garbage" }), now), null);
  assert.equal(usableRecenterFix(fix({ capturedAt: new Date(now + 60000).toISOString() }), now), null);
});
test("coarse fixes are explained; precise fixes are not", () => {
  assert.match(approximateLocationNote(fix({ accuracyMeters: 4200 }))!, /Approximate location \(±4200 m\)/);
  assert.equal(approximateLocationNote(fix({ accuracyMeters: 100 })), null);
  assert.equal(approximateLocationNote(null), null);
});
