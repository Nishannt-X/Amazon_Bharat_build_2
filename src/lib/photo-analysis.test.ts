import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAnswer,
  photoComparison,
  waterlogGuidance,
  evidenceQuality,
  caliperDepth,
  withRisk,
  type AnalysisResult,
} from "./photo-analysis";
const base = (): AnalysisResult => ({
  id: "test",
  owner: "test",
  photoHash: "test",
  createdAt: new Date().toISOString(),
  cv: null,
  scene: { roadType: "Unknown", traffic: [], hazards: [], explanation: "" },
  provider: "local-cv",
  baseline: "demo",
  depthMm: null,
  depthRangeMm: null,
  depthSource: "unknown",
  confidence: 20,
  confidenceMeaning: "experimental",
  riskScore: null,
  riskType: "unknown",
  publication: "pending",
  notes: [],
  answers: [],
});
test("caliper converts only the same reference span and rejects invalid geometry", () => {
  assert.equal(caliperDepth(250, [0.1, 0.2], [0.1, 0.8], [0.1, 0.44]), 150);
  assert.equal(
    caliperDepth(250, [0.1, 0.2], [0.5, 0.8], [0.26, 0.44], 1.8),
    150,
  );
  assert.throws(() => caliperDepth(250, [0.1, 0.2], [0.1, 0.2], [0.1, 0.44]));
  assert.throws(() => caliperDepth(250, [0.1, 0.2], [0.1, 0.8], [0.1, 0.1]));
  assert.throws(() => caliperDepth(NaN, [0.1, 0.2], [0.1, 0.8], [0.1, 0.44]));
});
test("a dry baseline match alone cannot generate depth, risk, or global publication", () => {
  const result = withRisk({ ...base(), confidence: 99 });
  assert.equal(result.depthMm, null);
  assert.equal(result.riskScore, null);
  assert.equal(result.publication, "pending");
  assert.equal(
    withRisk({
      ...base(),
      confidence: 99,
      depthMm: 150,
      depthRangeMm: [120, 180],
    }).publication,
    "pending",
  );
  assert.equal(
    withRisk({
      ...base(),
      baseline: "registered",
      confidence: 74,
      depthMm: 150,
    }).publication,
    "pending",
  );
  assert.equal(
    withRisk({
      ...base(),
      baseline: "registered",
      confidence: 75,
      depthMm: 150,
    }).publication,
    "eligible",
  );
});
test("body reference yields a range without promoting self-reported answers", () => {
  let result = applyAnswer(base(), "The water is at my knee");
  result = applyAnswer(result, "175 cm");
  assert.deepEqual(result.depthRangeMm, [385, 560]);
  assert.equal(result.depthMm, 473);
  result = applyAnswer(
    result,
    "A red DTC bus passed; water was halfway up a wheel",
  );
  result = applyAnswer(result, "Underpass with flowing water");
  assert.equal(result.publication, "pending");
  assert.ok(result.confidence < 75);
  assert.match(result.scene.traffic[0], /DTC/);
  assert.equal(result.scene.roadType, "Underpass (citizen observation)");
});
test("unknown answers do not invent dimensions or confidence", () => {
  let result = applyAnswer(base(), "I cannot judge");
  result = applyAnswer(result, "unknown");
  assert.equal(result.depthMm, null);
  assert.equal(result.riskScore, null);
});

test("moving water and underpass context increase screening risk; negated observations do not", () => {
  const initial = {
    ...base(),
    depthMm: 150,
    depthRangeMm: [120, 180] as [number, number],
  };
  assert.equal(withRisk(initial).riskScore, 36);
  assert.equal(
    withRisk({
      ...initial,
      scene: {
        ...initial.scene,
        roadType: "Underpass",
        movingWater: true,
        roadSurfaceVisible: false,
      },
    }).riskScore,
    71,
  );
  let result: AnalysisResult = initial;
  for (const answer of [
    "unknown",
    "unknown",
    "unknown",
    "Underpass, water is not moving; can see the road",
  ])
    result = applyAnswer(result, answer);
  assert.equal(result.scene.movingWater, false);
  assert.equal(result.riskScore, 46);
});

test("image quality contributes measured evidence points and never creates publication confidence", () => {
  const cv = {
    width: 1000,
    height: 560,
    blurVariance: 150,
    brightness: 100,
    matches: 100,
    inliers: 80,
    inlierRatio: 0.8,
    registered: true,
    homography: null,
    candidateWaterlineY: null,
    structuralEdges: [],
    traffic: [],
    durationMs: 250,
    limitations: [],
  };
  assert.equal(evidenceQuality(cv, "unknown").confidence, 38);
  assert.equal(evidenceQuality(cv, "calibrated-caliper").confidence, 58);
  assert.ok(
    evidenceQuality(
      { ...cv, blurVariance: 0, brightness: 0 },
      "calibrated-caliper",
    ).confidence < 58,
  );
  assert.throws(
    () => caliperDepth(250, [0.1, 0.2], [0.1, 0.8], [0.9, 0.4]),
    /same reference/,
  );
});

test("conflicting body and reviewed photo references reduce evidence confidence", () => {
  const initial: AnalysisResult = {
    ...base(),
    depthMm: 75,
    depthRangeMm: [50, 100],
    depthSource: "calibrated-caliper",
    confidence: 60,
  };
  const result = applyAnswer(applyAnswer(initial, "knee"), "175 cm");
  assert.equal(result.depthMm, 75);
  assert.deepEqual(result.citizenDepthRangeMm, [385, 560]);
  assert.ok(result.confidence <= 25);
  assert.match(result.notes[0], /Conflicting depth references/);
});

test("comparison keeps one primary reference and records auditable pixel-to-mm projection", () => {
  const cv = {
    width: 1000,
    height: 1000,
    registered: true,
    referenceCandidates: [
      {
        label: "tiny",
        top: [0.1, 0.1],
        bottom: [0.1, 0.12],
        heightPixels: 20,
        waterPoint: [0.1, 0.11],
        submergedPixels: 10,
      },
      {
        label: "usable",
        top: [0.1, 0.1],
        bottom: [0.1, 0.2],
        heightPixels: 100,
        waterPoint: [0.1, 0.14],
        submergedPixels: 60,
      },
    ],
  } as NonNullable<AnalysisResult["cv"]>;
  const comparison = photoComparison(cv, "baseline-hash");
  assert.equal(comparison.primaryReferenceId, "R1");
  assert.equal(comparison.measurements[0].referencePixels, 100);
  assert.equal(comparison.measurements[0].submergedPixels, 60);
  assert.equal(comparison.measurements[0].estimatedDepthMm, 150);
  assert.equal(comparison.measurements[0].mmPerPixel, 2.5);
  assert.equal(comparison.measurements.length, 2);
  assert.equal(comparison.baselineHash, "baseline-hash");
  assert.equal(
    photoComparison({ ...cv, registered: false }, "baseline-hash").measurements
      .length,
    0,
  );
});

test("guidance colors never turn uncertain or hazardous evidence green", () => {
  const lower = {
    ...base(),
    publication: "eligible" as const,
    baseline: "registered" as const,
    confidence: 80,
    riskType: "water-present" as const,
    scene: {
      roadType: "Street",
      traffic: [],
      hazards: [],
      explanation: "",
      movingWater: false,
      roadSurfaceVisible: true,
    },
  };
  assert.equal(waterlogGuidance(lower).level, "lower");
  assert.equal(waterlogGuidance({ ...lower, confidence: 49 }).level, "caution");
  assert.equal(
    waterlogGuidance({ ...lower, publication: "pending" }).level,
    "caution",
  );
  assert.equal(
    waterlogGuidance({
      ...lower,
      scene: { ...lower.scene, hazards: ["Open drain"] },
    }).level,
    "caution",
  );
  assert.equal(
    waterlogGuidance({ ...lower, riskType: "severe" }).level,
    "high",
  );
  assert.equal(
    waterlogGuidance({ ...lower, scene: { ...lower.scene, movingWater: true } })
      .level,
    "high",
  );
  assert.equal(waterlogGuidance(null).level, "caution");
});
