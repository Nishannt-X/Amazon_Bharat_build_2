import assert from "node:assert/strict";
import test from "node:test";
import { HEAT_MAX_RADIUS_PX, HEAT_MIN_RADIUS_PX, heatAlpha, heatRadiusPx, usableHeatPoints } from "./report-heat";

test("radius stays within pixel bounds at every zoom", () => {
  for (let z = 3; z <= 19; z++) for (const c of [0, 1, 4, 99, NaN]) {
    const r = heatRadiusPx(c, 28.6, z);
    assert.ok(r >= HEAT_MIN_RADIUS_PX && r <= HEAT_MAX_RADIUS_PX);
  }
});

test("more reports never shrink or fade the wash", () => {
  assert.ok(heatRadiusPx(5, 28.6, 14) >= heatRadiusPx(1, 28.6, 14));
  assert.ok(heatAlpha(5) > heatAlpha(1));
  assert.ok(heatAlpha(100) <= 0.5801);
});

test("invalid coordinates are dropped", () => {
  const ok = { lat: 1, lng: 2, reportCount: 1 };
  assert.deepEqual(usableHeatPoints([ok, { lat: NaN, lng: 0, reportCount: 1 }, { lat: 0, lng: 200, reportCount: 1 }]), [ok]);
});
