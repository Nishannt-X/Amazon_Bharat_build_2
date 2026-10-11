import { normalizeObservation } from "./voice-language";
/** Evidence quality is a conservative demo index, not a calibrated probability. */
export type DepthSource =
  | "unknown"
  | "demo-assumed-reference"
  | "calibrated-caliper"
  | "reference-prior-estimate"
  | "citizen-body-reference";
export interface CvEvidence {
  width: number;
  height: number;
  blurVariance: number;
  brightness: number;
  matches: number;
  inliers: number;
  inlierRatio: number;
  registered: boolean;
  /** Scene identity can match a facade while the road measurement plane does not. */
  sceneMatched?: boolean;
  alignmentMode?: "full-scene-plane" | "partial-scene" | "unmatched";
  alignmentMethod?: string;
  supportArea?: number;
  reprojectionErrorPx?: number | null;
  detectorStatus?: string;
  sceneReferences?: SceneReferenceEvidence | null;
  anchorAssessments?: {
    id: string; dryPoints: number[][]; dryPixels: number;
    physicalHeightMm: number | null; projectedPoints: number[][] | null;
    status: string; reason: string;
  }[];
  relativeAnchors?: {
    id: string; type: string; objectType: string; center: number[];
    radiusPixels: number; diameterPixels: number;
    physicalDiameterMm: number | null; depthMm: number | null;
    status: string; reason: string;
  }[];
  homography: number[][] | null;
  candidateWaterlineY: number | null;
  referenceCandidates?: {
    label: string;
    top: number[];
    bottom: number[];
    heightPixels: number;
    waterPoint: number[] | null;
    submergedPixels: number | null;
  }[];
  structuralEdges: { label: string; points: number[][]; pixels: number }[];
  traffic: { type: string; box: number[]; detectorScore: number }[];
  durationMs: number;
  limitations: string[];
}
export interface SceneReference {
  id: string; category: string; label: string; box: number[];
  visibleHeightPixels: number; visibleWidthPixels: number; detectorScore: number;
  physicalHeightMm: number | null; groundContactCandidate: number[] | null; status: string;
}
export interface SceneReferenceEvidence {
  version: 1; dryDetectorStatus: string; wetDetectorStatus: string;
  durationMs?: number; dryCacheHit?: boolean; modelId?: string; modelRevision?: string;
  dryReferences: SceneReference[]; wetReferences: SceneReference[];
  referenceDepth?: ReferenceDepthEvidence | null;
  comparisons: {
    dryId: string; category: string; dryBox: number[]; dryVisiblePixels: number;
    wetId: string | null; wetBox: number[] | null; wetVisiblePixels: number | null;
    projectedPolygon: number[][] | null; projectedExtentRatio: number | null;
    dryBaseAssessment: {status: string; occluderIds: string[]; reason: string};
    wetBaseAssessment: {status: string; occluderIds: string[]; reason: string} | null;
    centerSupported: boolean; baseSupported: boolean; planeValidated: boolean;
    status: string; physicalHeightMm: number | null; depthMm: number | null; reason: string;
  }[];
  limitations: string[];
}
export interface ReferenceDepthEvidence {
  status: string; estimatedDepthMm: number | null; rangeMm: [number, number] | null;
  experimentalIndex: number; method: string; modelId?: string; modelRevision?: string; durationMs?: number;
  maskContours: number[][][]; limitations: string[];
  waterEvidence?: {wetCoverage: number; wetMeanProbability: number; dryCoverage: number; dryMeanProbability: number};
  references: {
    id: string; type: string; objectBox: number[];
    referenceTop: number[]; referenceBottom: number[]; waterPoint: number[];
    referencePixels: number; submergedPixels: number; dimensionRangeMm: number[];
    depthMm: number; rangeMm: number[]; assumption: string; sourceUrl: string | null;
    visibleArcEdgeSupport?: number;
    reasons: string[];
  }[];
}
export interface SceneEvidence {
  roadType: string;
  traffic: string[];
  hazards: string[];
  explanation: string;
  movingWater?: boolean | null;
  roadSurfaceVisible?: boolean | null;
}
export interface PhotoComparison {
  version: 1;
  baselineId: string;
  baselineHash: string;
  referenceHeightMm: number | null;
  scaleBasis: "demo-assumption" | "unknown";
  baselineLabel?: string;
  baselineImageUrl?: string;
  baselineLocation?: { lat: number; lng: number } | null;
  baselineProfile?: DryBaselineProfile;
  primaryReferenceId: string | null;
  measurements: {
    id: string;
    top: number[];
    bottom: number[];
    waterPoint: number[] | null;
    referencePixels: number;
    submergedPixels: number | null;
    mmPerPixel: number | null;
    estimatedDepthMm: number | null;
  }[];
}
export interface DryBaselineProfile {
  version: 1; width: number; height: number; detectorStatus: string;
  objects: CvEvidence["traffic"];
  wheelCandidates: NonNullable<CvEvidence["relativeAnchors"]>[number][];
  curbCandidates: { id: string; box: number[]; visibleFacePixels: number; physicalHeightMm: number | null; status: string; reason: string }[];
  limitations: string[];
}
export interface WaterlogGuidance {
  level: "lower" | "caution" | "high";
  label: string;
  heading: string;
}
/** Colors describe observed conditions, never certify a vehicle crossing. */
export function waterlogGuidance(
  analysis?: PublicAnalysis | null,
): WaterlogGuidance {
  if (analysis?.riskType === "severe" || analysis?.scene.movingWater === true)
    return {
      level: "high",
      label: "High risk",
      heading: "High waterlogging risk · choose another route.",
    };
  if (
    analysis?.publication === "eligible" &&
    analysis.confidence >= 75 &&
    analysis.riskType === "water-present" &&
    analysis.scene.movingWater === false &&
    analysis.scene.roadSurfaceVisible === true &&
    analysis.scene.hazards.length === 0
  )
    return {
      level: "lower",
      label: "Lower observed risk",
      heading: "Lower observed risk · verify your vehicle before proceeding.",
    };
  return {
    level: "caution",
    label: "Caution · risk uncertain",
    heading: "Vehicle-specific risk needs verified specifications.",
  };
}

export interface AnalysisResult {
  id: string;
  photoHash: string;
  owner: string;
  createdAt: string;
  cv: CvEvidence | null;
  scene: SceneEvidence;
  provider: "local-cv" | "local-cv+bedrock" | "unavailable";
  baseline: "demo" | "registered";
  comparison?: PhotoComparison;
  anchorFusion?: AnchorFusion;
  depthMm: number | null;
  depthRangeMm: [number, number] | null;
  citizenDepthRangeMm?: [number, number] | null;
  depthSource: DepthSource;
  confidence: number;
  confidenceMeaning: string;
  confidenceFactors?: Record<string, number>;
  /** Raw photo index remains separate from bounded self-reported context. */
  photoConfidence?: number;
  contextConfidence?: number;
  contextEvidence?: {
    contribution: number; reasons: string[]; contradiction: boolean;
    policy?: "llm-bounded-v1"; baseline?: number;
    adjustments?: {answerIndex:number;delta:number;reason:string;provider:"bedrock"|"unavailable";scoreBefore:number;scoreAfter:number}[];
  };
  /** Presentation-only underpass demonstration; never substitutes for measured evidence. */
  demoConfidence?: { value: number; base: number; contextContribution: number; label: string };
  riskScore: number | null;
  riskType: "unknown" | "water-present" | "elevated" | "severe";
  publication: "pending" | "eligible";
  notes: string[];
  answers: { question: string; answer: string }[];
}

export interface AnchorFusion {
  status: "compatible" | "conflicting" | "single-anchor" | "insufficient";
  lowerBoundMm: number | null;
  rangeMm: [number, number] | null;
  reasons: string[];
}
/** Independent curb and tire constraints may agree, but missing objects supply no scale. */
export function combineAnchorEvidence(input: {
  curbHeightMm?: [number, number] | null;
  curbFullySubmerged?: boolean;
  curbSubmersionConfirmed?: boolean;
  tireDiameterMm?: [number, number] | null;
  tireSubmergedFraction?: [number, number] | null;
  tireBoundaryConfirmed?: boolean;
  sharedGroundDatum?: boolean;
}): AnchorFusion {
  const validRange = (range?: [number, number] | null) => !!range && range.every(Number.isFinite)
    && range[0] > 0 && range[1] >= range[0];
  const reasons: string[] = [];
  const lower = validRange(input.curbHeightMm) && input.curbFullySubmerged && input.curbSubmersionConfirmed
    ? input.curbHeightMm![0] : null;
  if (lower != null) reasons.push(`Confirmed submerged curb constrains local depth to at least ${lower} mm.`);
  else reasons.push("A missing curb is not a measured height or proof of full submersion.");
  const fraction = input.tireSubmergedFraction;
  const tire = validRange(input.tireDiameterMm) && fraction && fraction.every(Number.isFinite)
    && fraction[0] >= 0 && fraction[1] >= fraction[0] && fraction[1] <= 1 && input.tireBoundaryConfirmed
    ? [Math.floor(input.tireDiameterMm![0] * fraction[0]), Math.ceil(input.tireDiameterMm![1] * fraction[1])] as [number, number] : null;
  if (tire) reasons.push(`Tire diameter × submerged fraction yields ${tire[0]}–${tire[1]} mm at that wheel.`);
  else reasons.push("Wheel circles need actual tire diameter and a confirmed waterline; rim size and bounding-box height are not tire diameter.");
  if (lower != null && tire && input.sharedGroundDatum) {
    if (tire[1] < lower) return {status: "conflicting", lowerBoundMm: null, rangeMm: null,
      reasons: [...reasons, "Constraints disagree. Check anchor identity, water motion, road slope and geometry before combining."]};
    return {status: "compatible", lowerBoundMm: Math.max(lower, tire[0]), rangeMm: [Math.max(lower, tire[0]), tire[1]],
      reasons: [...reasons, "Both constraints use a validated shared ground datum; their overlap narrows the interval."]};
  }
  if (lower != null && tire) return {status: "insufficient", lowerBoundMm: null, rangeMm: null,
    reasons: [...reasons, "Different viewpoints or road elevations prevent combining these local depths without a shared datum."]};
  return {status: lower != null || tire != null ? "single-anchor" : "insufficient", lowerBoundMm: lower ?? tire?.[0] ?? null,
    rangeMm: tire, reasons};
}
export type PublicAnalysis = Omit<AnalysisResult, "owner" | "photoHash">;
export const CONFIDENCE_THRESHOLD = 75;
export function evidenceQuality(cv: CvEvidence | null, source: DepthSource) {
  const factors: Record<string, number> = {
    imageSharpness: cv
      ? Math.round(Math.min(10, Math.max(0, cv.blurVariance / 12)))
      : 0,
    imageExposure:
      cv && cv.brightness >= 35 && cv.brightness <= 225 ? 10 : cv ? 3 : 0,
    sceneRegistration: cv?.registered ? 10 : cv?.sceneMatched ? 5 : 0,
    geometricInliers: cv?.registered
      ? Math.round(Math.min(10, cv.inlierRatio * 10))
      : 0,
    assumedDemoReference: source === "demo-assumed-reference" ? 10 : 0,
    reviewedMetricReference: source === "calibrated-caliper" ? 20 : 0,
    citizenBodyReference: source === "citizen-body-reference" ? 10 : 0,
  };
  const baseConfidence = Object.values(factors).reduce((sum, n) => sum + n, 0);
  return {
    confidence: Math.min(
      95,
      baseConfidence + 30,
    ),
    confidenceFactors: factors,
  };
}
export function withRisk<T extends AnalysisResult>(result: T): T {
  const measured = result.cv?.sceneReferences?.referenceDepth;
  // Only fill unknown depth. Reviewed geometry and subsequent citizen context remain intact.
  if (result.depthMm == null && result.depthSource === "unknown" &&
      measured?.status === "experimental-reference-prior" &&
      measured.estimatedDepthMm != null && Number.isFinite(measured.estimatedDepthMm) &&
      Number.isFinite(measured.experimentalIndex) &&
      measured.estimatedDepthMm > 0 && measured.rangeMm?.every(Number.isFinite) &&
      measured.rangeMm[0] >= 0 && measured.rangeMm[1] >= measured.estimatedDepthMm &&
      measured.rangeMm[0] <= measured.estimatedDepthMm && measured.references.length > 0) {
    result = {...result, depthMm: measured.estimatedDepthMm, depthRangeMm: measured.rangeMm,
      depthSource: "reference-prior-estimate", confidence: Math.min(95, Math.max(0, measured.experimentalIndex) + 30),
      confidenceFactors: {localReferenceGeometryIndex: Math.min(95, Math.max(0, measured.experimentalIndex) + 30)},
      notes: [...result.notes, "Local water-contact estimate uses assumed object dimensions. Range reflects heuristic sensitivity, not a statistical confidence interval."]};
  }
  // Retire the legacy photo-specific presentation override; scores derive from evidence.
  if (result.demoConfidence) {
    const baseline = result.photoConfidence ?? result.confidence;
    const contribution = result.contextEvidence?.policy === "llm-bounded-v1" ? result.contextEvidence.contribution : 0;
    result = {...result, demoConfidence: undefined,
      contextConfidence: result.contextConfidence == null ? undefined : Math.max(0, Math.min(95, baseline + contribution)),
      contextEvidence: result.contextEvidence?.policy === "llm-bounded-v1"
        ? {...result.contextEvidence, baseline, adjustments: result.contextEvidence.adjustments?.map(item => ({...item,
          scoreBefore: Math.max(0, Math.min(95, baseline + item.scoreBefore - result.contextEvidence!.baseline!)),
          scoreAfter: Math.max(0, Math.min(95, baseline + item.scoreAfter - result.contextEvidence!.baseline!))}))}
        : result.contextEvidence};
  }
  result = {...result, confidence: Math.min(95, result.confidence),
    contextConfidence: result.contextConfidence == null ? undefined : Math.min(95, result.contextConfidence)};
  const upper = result.depthRangeMm?.[1] ?? result.depthMm;
  // Environmental screening only: no vehicle-safe conclusion from clearance.
  const context =
    (/underpass/i.test(result.scene.roadType) ? 10 : 0) +
    (result.scene.movingWater === true ? 15 : 0) +
    (result.scene.roadSurfaceVisible === false ? 10 : 0);
  const score =
    upper == null ? null : Math.min(100, Math.round(upper / 5) + context);
  return {
    ...result,
    riskScore: score,
    riskType:
      score == null
        ? "unknown"
        : score >= 60
          ? "severe"
          : score >= 30
            ? "elevated"
            : "water-present",
    publication:
      result.confidence >= CONFIDENCE_THRESHOLD &&
      result.depthMm != null &&
      result.baseline === "registered" &&
      result.depthSource !== "reference-prior-estimate" &&
      result.depthSource !== "demo-assumed-reference" &&
      !result.demoConfidence &&
      !result.contextEvidence?.contradiction &&
      result.depthSource !== "citizen-body-reference"
        ? "eligible"
        : "pending",
  };
}
export function caliperDepth(
  heightMm: number,
  top: number[],
  bottom: number[],
  water: number[],
  aspect = 1,
) {
  if (
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    aspect > 10 ||
    !Number.isFinite(heightMm) ||
    heightMm < 20 ||
    heightMm > 4000 ||
    [top, bottom, water].some(
      (p) =>
        p.length !== 2 || p.some((v) => !Number.isFinite(v) || v < 0 || v > 1),
    )
  )
    throw new Error(
      "Use a known reference height from 20–4000 mm and three image points.",
    );
  const axis = [(bottom[0] - top[0]) * aspect, bottom[1] - top[1]];
  const length2 = axis[0] ** 2 + axis[1] ** 2;
  if (length2 < 0.0004 || bottom[1] - top[1] < 0.02)
    throw new Error("Reference points are too close together.");
  const offset = [(water[0] - top[0]) * aspect, water[1] - top[1]];
  const perpendicular =
    Math.abs(offset[0] * axis[1] - offset[1] * axis[0]) / Math.sqrt(length2);
  if (perpendicular > Math.sqrt(length2) * 0.15)
    throw new Error("Choose the water line on the same reference edge.");
  const submerged =
    ((bottom[0] - water[0]) * aspect * axis[0] +
      (bottom[1] - water[1]) * axis[1]) /
    length2;
  if (submerged < 0 || submerged > 1)
    throw new Error(
      "Water line must lie between the top and bottom of the reference.",
    );
  return Math.round(heightMm * submerged);
}
export function publicAnalysis(result: AnalysisResult): PublicAnalysis {
  const { owner: _owner, photoHash: _photoHash, ...safe } = result;
  void _owner;
  void _photoHash;
  return safe;
}
export function nextQuestion(result: AnalysisResult): string | null {
  const count = result.answers.length;
  if (count === 0)
    return "From where you are already standing safely: is the water at your ankle, shin, knee, or waist? You can also say you cannot judge.";
  if (count === 1)
    return "What is your height in centimetres? Only use a body reference if you are already in that water; do not enter it.";
  if (count === 2)
    return "What traffic can you see: scooters, cars, trucks, or buses? If a bus passed, which operator or model, and where did the water reach its wheel?";
  if (count === 3)
    return "Is this an underpass, ordinary street, or highway? Is the water moving, and can you see the road surface or any open drains?";
  return null;
}
export function applyAnswer(
  result: AnalysisResult,
  answer: string,
): AnalysisResult {
  const question = nextQuestion(result);
  if (!question) return result;
  const answers = [...result.answers, { question, answer }];
  const parsedAnswer = normalizeObservation(answer);
  const observations = answers.map(item=>({...item,answer:normalizeObservation(item.answer)}));
  let depthMm = result.depthMm,
    range = result.depthRangeMm,
    source = result.depthSource;
  let citizenRange = result.citizenDepthRangeMm;
  const notes = [...result.notes];
  let conflict = notes.some((note) =>
    note.startsWith("Conflicting depth references"),
  );
  if (answers.length === 2) {
    const body = observations[0].answer.toLowerCase();
    const height = parsedAnswer.match(/\b(1[2-9]\d|2[01]\d)\s*(?:cm|centimet|$)/i);
    const ratio = /ankle/.test(body)
      ? [0.04, 0.09]
      : /shin/.test(body)
        ? [0.09, 0.22]
        : /knee/.test(body)
          ? [0.22, 0.32]
          : /waist/.test(body)
            ? [0.48, 0.62]
            : null;
    if (height && ratio && !/unknown|unsure|cannot|can.t|not |never /i.test(body)) {
      citizenRange = [
        Math.round(Number(height[1]) * 10 * ratio[0]),
        Math.round(Number(height[1]) * 10 * ratio[1]),
      ];
      if (source === "calibrated-caliper" && range) {
        conflict = citizenRange[0] > range[1] || citizenRange[1] < range[0];
        if (conflict)
          notes.push(
            "Conflicting depth references: body observation and photo caliper disagree. They may describe different places or a bad reference; collect independent evidence.",
          );
      } else {
        range = citizenRange;
        depthMm = Math.round((range[0] + range[1]) / 2);
        source = "citizen-body-reference";
      }
    }
  }
  const scene = { ...result.scene };
  const unknown = /\b(?:unknown|unsure|cannot judge|can.t judge|don.t know|not sure)\b/i;
  if (answers.length === 3 && !unknown.test(parsedAnswer)) scene.traffic = [answer];
  if (answers.length === 4 && !unknown.test(parsedAnswer)) {
    if ((result.scene.movingWater === true && /not moving|not flowing|still water/i.test(parsedAnswer)) || (result.scene.movingWater === false && /water (?:is )?(?:moving|flowing)|flowing water|fast current/i.test(parsedAnswer) && !/not moving|not flowing/i.test(parsedAnswer))) {conflict=true;notes.push("Contradictory water-motion observations: independent review is needed.");}
    scene.roadType = /underpass/i.test(parsedAnswer)
      ? "Underpass (citizen observation)"
      : /highway/i.test(parsedAnswer)
        ? "Highway (citizen observation)"
        : /street|road/i.test(parsedAnswer)
          ? "Street (citizen observation)"
          : result.scene.roadType;
    if (/open drain|manhole|debris|damage|pothole|stranded/i.test(parsedAnswer) && !/no (?:open )?drains|no damage|no debris/i.test(parsedAnswer)) scene.hazards = [...scene.hazards, answer];
    scene.movingWater = /not moving|not flowing|still water|stationary/i.test(
      parsedAnswer,
    )
      ? false
      : /water (?:is )?(?:moving|flowing)|flowing water|fast current/i.test(
            parsedAnswer,
          )
        ? true
        : null;
    scene.roadSurfaceVisible =
      /(?:cannot|can.t|not|isn.t) (?:see |visible|visible road)|road (?:is )?(?:hidden|not visible)|surface (?:is )?not visible/i.test(
        parsedAnswer,
      )
        ? false
        : /(?:can see|visible) (?:the )?(?:road|surface)/i.test(parsedAnswer)
          ? true
          : null;
  }
  const photoConfidence = result.photoConfidence ?? result.confidence;
  const previous = result.contextEvidence?.policy === "llm-bounded-v1" ? result.contextEvidence : null;
  const baseline = previous?.baseline ?? photoConfidence;

  // Citizen depth disagreement with any established photo reference is a conflict.
  if (citizenRange && result.depthRangeMm && result.depthSource !== "citizen-body-reference") {
    conflict ||= citizenRange[0] > result.depthRangeMm[1] || citizenRange[1] < result.depthRangeMm[0];
    if(conflict && !notes.some(note=>note.startsWith("Conflicting depth references"))) notes.push("Conflicting depth references: citizen observation and photo range disagree. Collect independent evidence.");
  }
  // Combined index is explanatory only. Publication uses the original photo index.
  return withRisk({
    ...result,
    answers,
    depthMm,
    depthRangeMm: range,
    depthSource: source,
    scene,
    confidence: photoConfidence,
    photoConfidence,
    contextConfidence: previous ? result.contextConfidence ?? baseline : baseline,
    contextEvidence: {contribution:previous?.contribution ?? 0,reasons:previous?.reasons ?? [],contradiction:conflict,policy:"llm-bounded-v1",baseline,adjustments:previous?.adjustments ?? []},
    citizenDepthRangeMm: citizenRange,
    notes,
  });
}

/** Only a validated LLM assessment can change the context score, once per answer. */
export function applyContextAssessment(result: AnalysisResult, assessment: {confidenceDelta:number;confidenceReason:string;contradiction?:boolean}|null): AnalysisResult {
  const evidence=result.contextEvidence;
  const baseline=evidence?.baseline ?? result.photoConfidence ?? result.confidence;
  const adjustments=evidence?.policy === "llm-bounded-v1" ? [...(evidence.adjustments ?? [])] : [];
  const answerIndex=result.answers.length-1;
  if(answerIndex<0 || adjustments.some(item=>item.answerIndex===answerIndex)) return result;
  const valid=assessment && Number.isInteger(assessment.confidenceDelta) && typeof assessment.confidenceReason==="string" && assessment.confidenceReason.trim();
  const before=result.contextConfidence ?? baseline;
  const proposed=valid ? Math.min(3,Math.max(-2,assessment!.confidenceDelta)) : 0;
  const after=Math.min(95,Math.max(0,before+proposed));
  const reason=valid ? assessment!.confidenceReason.trim().slice(0,400) : "Bedrock assessment unavailable; confidence unchanged.";
  adjustments.push({answerIndex,delta:after-before,reason,provider:valid?"bedrock":"unavailable",scoreBefore:before,scoreAfter:after});
  return withRisk({...result,confidence:result.photoConfidence ?? result.confidence,contextConfidence:after,contextEvidence:{policy:"llm-bounded-v1",baseline,contribution:after-baseline,reasons:adjustments.map(item=>`Q${item.answerIndex+1}: ${item.delta>=0?"+":""}${item.delta} points — ${item.reason}`),contradiction:Boolean(evidence?.contradiction || assessment?.contradiction),adjustments}});
}

/** Persist the actual local spans and the assumption used for the demo projection. */
export function photoComparison(
  cv: CvEvidence | null,
  baselineHash: string,
  reference: { baselineId: string; referenceHeightMm: number | null } = {
    baselineId: "mural-underpass-demo-v1", referenceHeightMm: 250,
  },
): PhotoComparison {
  const height = reference.referenceHeightMm;
  const candidates = cv?.registered ? [...(cv.referenceCandidates ?? [])] : [];
  const primary = candidates.find((c) => c.waterPoint && c.heightPixels >= 30);
  const ordered = primary
    ? [primary, ...candidates.filter((c) => c !== primary)]
    : candidates;
  const measurements = ordered.flatMap((reference, index) => {
    if (!cv) return [];
    const dx = (reference.bottom[0] - reference.top[0]) * cv.width,
      dy = (reference.bottom[1] - reference.top[1]) * cv.height;
    const pixels = Math.hypot(dx, dy);
    if (!Number.isFinite(pixels) || pixels < 1) return [];
    let depth: number | null = null;
    if (reference.waterPoint && height != null)
      try {
        depth = caliperDepth(
          height,
          reference.top,
          reference.bottom,
          reference.waterPoint,
          cv.width / cv.height,
        );
      } catch {}
    return [
      {
        id: `R${index + 1}`,
        top: reference.top,
        bottom: reference.bottom,
        waterPoint: reference.waterPoint,
        referencePixels: Math.round(pixels * 10) / 10,
        submergedPixels:
          height == null ? reference.submergedPixels ?? null
            : depth == null ? null : Math.round(((pixels * depth) / height) * 10) / 10,
        mmPerPixel: height == null ? null : Math.round((height / pixels) * 1000) / 1000,
        estimatedDepthMm: depth,
      },
    ];
  });
  return {
    version: 1,
    baselineId: reference.baselineId,
    baselineHash,
    referenceHeightMm: height,
    scaleBasis: height == null ? "unknown" : "demo-assumption",
    primaryReferenceId:
      primary && measurements[0]?.estimatedDepthMm != null
        ? measurements[0].id
        : null,
    measurements,
  };
}
