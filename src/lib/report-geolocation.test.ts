import assert from "node:assert/strict";
import test from "node:test";
import { watchDeviceLocation } from "./report-geolocation";

function harness() {
  const previous = { navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), window: Object.getOwnPropertyDescriptor(globalThis, "window") };
  const requests: { success: PositionCallback; failure: PositionErrorCallback }[] = [];
  const watches: { success: PositionCallback; failure: PositionErrorCallback; cleared: boolean }[] = [];
  const permission = { state: "granted", onchange: null as (() => void) | null };
  const geo = {
    watchPosition(success: PositionCallback, failure: PositionErrorCallback) { watches.push({ success, failure, cleared: false }); return watches.length - 1; },
    getCurrentPosition(success: PositionCallback, failure: PositionErrorCallback) { requests.push({ success, failure }); },
    clearWatch(id: number) { if (watches[id]) watches[id].cleared = true; },
  };
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { geolocation: geo, permissions: { query: async () => permission } } });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { isSecureContext: true } });
  return { watches, requests, permission, restore() {
    for (const name of ["navigator", "window"] as const) {
      const descriptor = previous[name];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  } };
}
const fix = (accuracy = 8, timestamp = Date.now()) => ({ coords: { latitude: 28.63, longitude: 77.22, accuracy }, timestamp }) as GeolocationPosition;
const error = (code: number) => ({ code }) as GeolocationPositionError;

test("permission grant restarts GPS after denial and ignores callbacks from the canceled watch", async () => {
  const env = harness();
  const fixes: number[] = [], failures: string[] = [];
  const stop = watchDeviceLocation((position) => fixes.push(position.accuracyMeters), (reason) => failures.push(reason));
  try {
    await Promise.resolve();
    assert.equal(env.watches.length, 0, "initial acquisition must not compete with a watch");
    env.permission.state = "denied";
    env.requests[0].failure(error(1));
    assert.deepEqual(failures, ["denied"]);
    env.permission.state = "granted";
    env.permission.onchange?.();
    assert.equal(env.requests.length, 2);
    env.requests[0].success(fix(1));
    env.requests[1].success(fix(8));
    assert.equal(env.watches.length, 1);
    assert.deepEqual(fixes, [8]);
    stop();
    env.watches[0].success(fix(2));
    assert.deepEqual(fixes, [8]);
    assert.ok(env.watches[0].cleared);
    assert.equal(env.permission.onchange, null);
  } finally { stop(); env.restore(); }
});

test("stale and invalid fixes do not locate the map; newer live fixes update the position even when accuracy varies", () => {
  const env = harness();
  const fixes: number[] = [];
  const stop = watchDeviceLocation((position) => fixes.push(position.accuracyMeters), () => {});
  try {
    env.requests[0].success(fix(8, Date.now() - 31000));
    env.watches[0].success(fix(-1));
    env.watches[0].success(fix(900));
    env.watches[0].success(fix(8));
    env.watches[0].success(fix(500));
    assert.deepEqual(fixes, [900, 8, 500]);
  } finally { stop(); env.restore(); }
});

test("provider unavailable is reported accurately after both requests have had time to finish", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const env = harness();
  const failures: string[] = [];
  const stop = watchDeviceLocation(() => {}, (reason) => failures.push(reason));
  try {
    env.requests[0].failure(error(2));
    env.watches[0].failure(error(2));
    assert.deepEqual(failures, []);
    t.mock.timers.tick(33000);
    assert.deepEqual(failures, ["unavailable"]);
  } finally { stop(); env.restore(); }
});


test("granting initial permission does not interrupt the acquisition waiting for it", async () => {
  const env = harness();
  env.permission.state = "prompt";
  const fixes: number[] = [];
  const stop = watchDeviceLocation((position) => fixes.push(position.accuracyMeters), () => {});
  try {
    await Promise.resolve();
    env.permission.state = "granted";
    env.permission.onchange?.();
    assert.equal(env.requests.length, 1);
    env.requests[0].success(fix(8));
    assert.deepEqual(fixes, [8]);
    assert.equal(env.watches.length, 1);
  } finally { stop(); env.restore(); }
});

test("an unanswered permission prompt ends as no-response instead of spinning, and a later grant restarts", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const env = harness();
  env.permission.state = "prompt";
  const failures: string[] = [], fixes: number[] = [];
  const stop = watchDeviceLocation((position) => fixes.push(position.accuracyMeters), (reason) => failures.push(reason));
  try {
    await Promise.resolve();
    t.mock.timers.tick(33000);
    assert.deepEqual(failures, ["no-response"]);
    env.permission.state = "granted";
    env.permission.onchange?.();
    assert.equal(env.requests.length, 2);
    env.requests[1].success(fix(8));
    assert.deepEqual(fixes, [8]);
  } finally { stop(); env.restore(); }
});

test("timeout without a pending prompt is reported as timeout", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const env = harness();
  const failures: string[] = [];
  const stop = watchDeviceLocation(() => {}, (reason) => failures.push(reason));
  try {
    await Promise.resolve();
    t.mock.timers.tick(33000);
    assert.deepEqual(failures, ["timeout"]);
  } finally { stop(); env.restore(); }
});

test("tab switches do not restart an attempt that has no fix, so its deadline still fires", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const env = harness();
  const doc = { visibilityState: "visible", listeners: [] as (() => void)[], addEventListener(_: string, fn: () => void) { this.listeners.push(fn); }, removeEventListener() {} };
  Object.defineProperty(globalThis, "document", { configurable: true, value: doc });
  const failures: string[] = [];
  const stop = watchDeviceLocation(() => {}, (reason) => failures.push(reason));
  try {
    await Promise.resolve();
    t.mock.timers.tick(15000);
    doc.listeners.forEach((fn) => fn());
    t.mock.timers.tick(15000);
    doc.listeners.forEach((fn) => fn());
    assert.equal(env.requests.length, 1, "no duplicate acquisition");
    t.mock.timers.tick(3000);
    assert.deepEqual(failures, ["timeout"]);
  } finally { stop(); Reflect.deleteProperty(globalThis, "document"); env.restore(); }
});
