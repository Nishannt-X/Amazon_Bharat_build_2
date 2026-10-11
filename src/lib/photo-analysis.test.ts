import test from "node:test";
import assert from "node:assert/strict";
import {
  applyAnswer,
  applyContextAssessment,
  combineAnchorEvidence,
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
  assert.equal(evidenceQuality(cv, "unknown").confidence, 68);
  assert.equal(evidenceQuality(cv, "calibrated-caliper").confidence, 88);
  assert.ok(
    evidenceQuality(
      { ...cv, blurVariance: 0, brightness: 0 },
      "calibrated-caliper",
    ).confidence < 88,
  );
  assert.throws(
    () => caliperDepth(250, [0.1, 0.2], [0.1, 0.8], [0.9, 0.4]),
    /same reference/,
  );
});

test("conflicting body and photo references preserve raw confidence until bounded assessment", () => {
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
  assert.equal(result.confidence,60);
  assert.equal(applyContextAssessment(result,{confidenceDelta:-10,confidenceReason:"Body reference conflicts with the photo.",contradiction:true}).contextConfidence,58);
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

test("highway baseline retains pixel evidence without borrowing underpass height", () => {
  const cv = { registered: true, width: 1000, height: 1000, referenceCandidates: [
    { label: "unknown structure", top: [0.1, 0.1], bottom: [0.1, 0.2], heightPixels: 100,
      waterPoint: [0.1, 0.14], submergedPixels: 60 },
  ] } as NonNullable<AnalysisResult["cv"]>;
  const comparison = photoComparison(cv, "highway-hash", {
    baselineId: "delhi-highway-demo-v1", referenceHeightMm: null,
  });
  assert.equal(comparison.baselineId, "delhi-highway-demo-v1");
  assert.equal(comparison.referenceHeightMm, null);
  assert.equal(comparison.scaleBasis, "unknown");
  assert.equal(comparison.measurements[0].referencePixels, 100);
  assert.equal(comparison.measurements[0].submergedPixels, 60);
  assert.equal(comparison.measurements[0].mmPerPixel, null);
  assert.equal(comparison.measurements[0].estimatedDepthMm, null);
  assert.equal(comparison.primaryReferenceId, null);
});


test("curb and tire constraints combine only with confirmed scale, boundary and shared datum", () => {
  const evidence = { curbHeightMm: [140,160] as [number,number], curbFullySubmerged: true, curbSubmersionConfirmed: true,
    tireDiameterMm: [600,620] as [number,number], tireSubmergedFraction: [.4,.5] as [number,number], tireBoundaryConfirmed: true, sharedGroundDatum: true };
  assert.deepEqual(combineAnchorEvidence(evidence).rangeMm, [240,310]);
  assert.equal(combineAnchorEvidence(evidence).status, "compatible");
  assert.equal(combineAnchorEvidence({...evidence, sharedGroundDatum:false}).rangeMm,null);
  assert.equal(combineAnchorEvidence({...evidence,tireSubmergedFraction:[.1,.2]}).status,"conflicting");
  assert.equal(combineAnchorEvidence({curbFullySubmerged:true}).lowerBoundMm,null);
  assert.equal(combineAnchorEvidence({...evidence,tireDiameterMm:null}).lowerBoundMm,140);
  assert.equal(combineAnchorEvidence({...evidence,tireBoundaryConfirmed:false,curbSubmersionConfirmed:false}).status,"insufficient");
});

test("live reference priors fill unknown depth but cannot publish or replace reviewed depth", () => {
  const cv = {
    width: 1000, height: 1000, blurVariance: 200, brightness: 100,
    matches: 100, inliers: 80, inlierRatio: .8, registered: false,
    homography: null, candidateWaterlineY: null, structuralEdges: [], traffic: [],
    durationMs: 6000, limitations: [],
    sceneReferences: {
      version: 1 as const, dryDetectorStatus: "test", wetDetectorStatus: "test",
      dryReferences: [], wetReferences: [], comparisons: [], limitations: [],
      referenceDepth: {
        status: "experimental-reference-prior", estimatedDepthMm: 116,
        rangeMm: [0, 516] as [number, number], experimentalIndex: 54,
        method: "test", maskContours: [], limitations: [],
        references: [{id: "E1", type: "car-wheel-prior", objectBox: [],
          referenceTop: [], referenceBottom: [], waterPoint: [],
          referencePixels: 30, submergedPixels: 6, dimensionRangeMm: [450,750],
          depthMm: 116, rangeMm: [0,516], assumption: "unverified", sourceUrl: null, reasons: []}],
      },
    },
  };
  const result = withRisk({...base(), cv, baseline: "registered" as const});
  assert.equal(result.depthMm, 116);
  assert.equal(result.depthSource, "reference-prior-estimate");
  assert.equal(result.confidence, 84);
  assert.equal(result.riskScore, 100);
  assert.equal(withRisk({...result, confidence: 99}).publication, "pending");
  assert.equal(withRisk({...result, depthMm: 80, depthSource: "calibrated-caliper"}).depthMm, 80);
  const malformed = {...cv, sceneReferences: {...cv.sceneReferences, referenceDepth: {...cv.sceneReferences.referenceDepth, rangeMm: [200,100] as [number,number]}}};
  assert.equal(withRisk({...base(), cv: malformed}).depthMm, null);
  const dry = {...cv, sceneReferences: {...cv.sceneReferences, referenceDepth: {...cv.sceneReferences.referenceDepth, status: "no-water-evidence", estimatedDepthMm: null}}};
  assert.equal(withRisk({...base(), cv: dry}).depthMm, null);
});

test("underpass uses measured confidence without a photo-specific override", () => {
  const result = withRisk({...base(), confidence: 49, depthMm: 74,
    depthRangeMm: [12,136] as [number,number], depthSource: "demo-assumed-reference" as const,
    comparison: {version: 1 as const,baselineId:"mural-underpass-demo-v1",baselineHash:"test",
      referenceHeightMm:250,scaleBasis:"demo-assumption" as const,primaryReferenceId:null,measurements:[]}});
  assert.equal(result.confidence,49);
  assert.equal(result.demoConfidence,undefined);
  const answered=applyContextAssessment(applyAnswer(result,"ankle"),{confidenceDelta:2,confidenceReason:"Specific body-level observation."});
  assert.equal(answered.contextConfidence,51);
  assert.equal(answered.photoConfidence,49);
  assert.equal(answered.publication,"pending");
  assert.equal(withRisk({...answered,baseline:"registered",confidence:99}).publication,"pending");
  assert.equal(applyAnswer(result,"unknown").contextConfidence,49);
  assert.equal(withRisk({...result,comparison:{...result.comparison!,baselineId:"delhi-highway-demo-v1"},demoConfidence:undefined}).demoConfidence,undefined);
});

test("Hindi body observations and Devanagari height digits use the same context parser as English", () => {
  const initial=withRisk({id:"hindi",owner:"test",photoHash:"test",createdAt:"2026-10-12",cv:null,scene:{roadType:"Highway",traffic:[],hazards:[],explanation:""},provider:"local-cv",baseline:"demo",depthMm:74,depthRangeMm:[50,100],depthSource:"demo-assumed-reference",confidence:49,confidenceMeaning:"Experimental",riskScore:20,riskType:"water-present",publication:"pending",notes:[],answers:[]} as AnalysisResult);
  const body=applyAnswer(initial,"पानी मेरे टखनों तक है");
  const height=applyAnswer(body,"मेरी लंबाई १७० सेंटीमीटर है");
  assert.deepEqual(height.citizenDepthRangeMm,[68,153]);
  assert.equal(height.answers[1].answer,"मेरी लंबाई १७० सेंटीमीटर है");
  const traffic=applyAnswer(height,"कारें दिखाई दे रही हैं");
  const motion=applyAnswer(traffic,"हाईवे पर पानी बह नहीं रहा");
  assert.equal(motion.scene.movingWater,false);
  assert.match(motion.scene.roadType,/Highway/);
  const unknownHeight=applyAnswer(applyAnswer(initial,"पता नहीं"),"१७० सेंटीमीटर");
  assert.equal(unknownHeight.citizenDepthRangeMm,undefined);
});
