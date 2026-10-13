import test from "node:test";
import assert from "node:assert/strict";
import { createReportReadCache } from "./cloud-report-cache";

test("concurrent visitors share one read, including after expiry", async () => {
  let now = 0, calls = 0;
  const read = createReportReadCache(async () => { calls++; return [calls]; }, 60000, () => now);
  const first = await Promise.all(Array.from({ length: 100 }, () => read()));
  assert.equal(calls, 1);
  assert.ok(first.every(result => result?.[0] === 1));
  now = 59999;
  assert.deepEqual(await read(), [1]);
  now = 60000;
  const second = await Promise.all([read(), read()]);
  assert.equal(calls, 2);
  assert.deepEqual(second, [[2], [2]]);
});

test("empty feeds and provider failures do not cause a read on every visitor", async () => {
  for (const value of [null, []]) {
    let calls = 0;
    const read = createReportReadCache(async () => { calls++; return value; });
    await Promise.all([read(), read(), read()]);
    assert.equal(calls, 1);
  }
  let calls = 0;
  const failing = createReportReadCache(async () => { calls++; throw new Error("Unavailable"); });
  assert.deepEqual(await Promise.all([failing(), failing(), failing()]), [null, null, null]);
  assert.equal(calls, 1);
});
