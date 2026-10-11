/** Evidence quality is a conservative demo index, not a calibrated probability. */
export type DepthSource =
  | "unknown"
  | "demo-assumed-reference"
  | "calibrated-caliper"
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
  referenceHeightMm: number;
  scaleBasis: "demo-assumption";
  primaryReferenceId: string | null;
  measurements: {
    id: string;
    top: number[];
    bottom: number[];
    waterPoint: number[] | null;
    referencePixels: number;
    submergedPixels: number | null;
    mmPerPixel: number;
    estimatedDepthMm: number | null;
  }[];
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
  baseline: "demo" | "street-imagery" | "unavailable" | "registered";
  streetReference?: {
    id: string;
    distanceMeters: number;
    heading: number;
    capturedAt: string | null;
    attribution: string;
  };
  comparison?: PhotoComparison;
  depthMm: number | null;
  depthRangeMm: [number, number] | null;
  citizenDepthRangeMm?: [number, number] | null;
  depthSource: DepthSource;
  confidence: number;
  confidenceMeaning: string;
  confidenceFactors?: Record<string, number>;
  riskScore: number | null;
  riskType: "unknown" | "water-present" | "elevated" | "severe";
  publication: "pending" | "eligible";
  notes: string[];
  answers: { question: string; answer: string }[];
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
    sceneRegistration: cv?.registered ? 10 : 0,
    geometricInliers: cv?.registered
      ? Math.round(Math.min(10, cv.inlierRatio * 10))
      : 0,
    assumedDemoReference: source === "demo-assumed-reference" ? 10 : 0,
    reviewedMetricReference: source === "calibrated-caliper" ? 20 : 0,
    citizenBodyReference: source === "citizen-body-reference" ? 10 : 0,
  };
  return {
    confidence: Math.min(
      74,
      Object.values(factors).reduce((sum, n) => sum + n, 0),
    ),
    confidenceFactors: factors,
  };
}
export function withRisk<T extends AnalysisResult>(result: T): T {
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
      result.baseline === "registered"
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
  let depthMm = result.depthMm,
    range = result.depthRangeMm,
    source = result.depthSource;
  let citizenRange = result.citizenDepthRangeMm;
  const notes = [...result.notes];
  let conflict = notes.some((note) =>
    note.startsWith("Conflicting depth references"),
  );
  if (answers.length === 2) {
    const body = answers[0].answer.toLowerCase();
    const height = answer.match(/\b(1[2-9]\d|2[01]\d)\s*(?:cm|centimet|$)/i);
    const ratio = /ankle/.test(body)
      ? [0.04, 0.09]
      : /shin/.test(body)
        ? [0.09, 0.22]
        : /knee/.test(body)
          ? [0.22, 0.32]
          : /waist/.test(body)
            ? [0.48, 0.62]
            : null;
    if (height && ratio) {
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
  if (answers.length === 3) scene.traffic = [answer];
  if (answers.length === 4) {
    scene.roadType = /underpass/i.test(answer)
      ? "Underpass (citizen observation)"
      : /highway/i.test(answer)
        ? "Highway (citizen observation)"
        : /street|road/i.test(answer)
          ? "Street (citizen observation)"
          : "Unknown";
    scene.hazards = [...scene.hazards, answer];
    scene.movingWater = /not moving|not flowing|still water|stationary/i.test(
      answer,
    )
      ? false
      : /water (?:is )?(?:moving|flowing)|flowing water|fast current/i.test(
            answer,
          )
        ? true
        : null;
    scene.roadSurfaceVisible =
      /(?:cannot|can.t|not|isn.t) (?:see |visible|visible road)|road (?:is )?(?:hidden|not visible)|surface (?:is )?not visible/i.test(
        answer,
      )
        ? false
        : /(?:can see|visible) (?:the )?(?:road|surface)/i.test(answer)
          ? true
          : null;
  }
  // More answers are not independent validation. Never inflate confidence to publish.
  return withRisk({
    ...result,
    answers,
    depthMm,
    depthRangeMm: range,
    depthSource: source,
    scene,
    ...evidenceQuality(result.cv, source),
    citizenDepthRangeMm: citizenRange,
    notes,
    ...(conflict
      ? {
          confidence: Math.min(
            25,
            evidenceQuality(result.cv, source).confidence,
          ),
        }
      : {}),
  });
}

/** Persist the actual local spans and the assumption used for the demo projection. */
export function photoComparison(
  cv: CvEvidence | null,
  baselineHash: string,
  baselineId = "mural-underpass-demo-v1",
): PhotoComparison {
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
    if (reference.waterPoint)
      try {
        depth = caliperDepth(
          250,
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
          depth == null ? null : Math.round(((pixels * depth) / 250) * 10) / 10,
        mmPerPixel: Math.round((250 / pixels) * 1000) / 1000,
        estimatedDepthMm: depth,
      },
    ];
  });
  return {
    version: 1,
    baselineId,
    baselineHash,
    referenceHeightMm: 250,
    scaleBasis: "demo-assumption",
    primaryReferenceId:
      primary && measurements[0]?.estimatedDepthMm != null
        ? measurements[0].id
        : null,
    measurements,
  };
}
