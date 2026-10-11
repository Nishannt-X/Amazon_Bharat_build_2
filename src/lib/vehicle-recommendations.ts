import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { type PublicAnalysis } from "./photo-analysis";
import type { VehicleDetails } from "./report";
import type { VehicleReferenceStats } from "./vehicle-report-context";
import type { VehiclePhysicalEvidence } from "./vehicle-physical-evidence";
import type { ResearchClearance } from "./vehicle-research";

export interface Recommendation {
  level:"lower"|"caution"|"high";
  heading:string;
  reasons:string[];
  actions:string[];
  provider:"deterministic"|"bedrock"|"deterministic-cloud-failure";
  providerNote:string;
  vehicleKey:string;
  checkedFacts:{depthMm:number|null;depthRangeMm:[number,number]|null;photoConfidence:number;combinedEvidenceIndex:number|null};
}

export interface RecommendationInput {
  analysis:PublicAnalysis;
  vehicle:VehicleDetails;
  reference:VehicleReferenceStats|null;
  research:ResearchClearance|null;
  physical?:VehiclePhysicalEvidence|null;
}


const NON_CAR_MAKES = new Set(["Ather", "Bajaj", "Hero", "KTM", "Ola", "Royal Enfield", "TVS", "Yamaha", "Suzuki", "Triumph"]);
const NON_CAR_HONDA = new Set(["Activa 6G", "Activa 125", "Dio", "Shine", "SP 125", "Unicorn", "Hornet 2.0", "H'ness CB350", "CB350RS"]);
const SCOOTER_MODELS = new Set([
  "Activa 6G", "Activa 125", "Dio", "Jupiter", "NTORQ 125", "XL100", "iQube", "Chetak",
  "Destini 125", "Xoom 125", "Fascino", "RayZR", "Aerox 155", "Rizta", "S1 Pro", "S1 X", "450X"
]);

export function isTwoWheelerVehicle(make: string, model: string): boolean {
  if (NON_CAR_MAKES.has(make)) return true;
  if (make === "Honda" && NON_CAR_HONDA.has(model)) return true;
  return false;
}

export function isScooterVehicle(make: string, model: string): boolean {
  if (make === "Ather" || make === "Ola") return true;
  return SCOOTER_MODELS.has(model);
}

export function deterministicRecommendation(input:RecommendationInput):Recommendation {
  const {analysis:a,vehicle:v,reference:r,research}=input;
  const car=`${v.make} ${v.model} (${v.year}${v.variant?`, ${v.variant}`:""})`;
  const clearance=r?.groundClearanceMm??research?.groundClearanceMm??null;
  const depth=a.depthMm;
  const margin=depth!=null&&clearance!=null ? clearance - depth : null;
  const isTwoWheeler = isTwoWheelerVehicle(v.make, v.model);
  const isScooter = isScooterVehicle(v.make, v.model);

  const reasons=[`${car}: ${a.depthMm==null?"photo depth is unknown":`estimated depth ${a.depthMm} mm${a.depthRangeMm?`, range ${a.depthRangeMm[0]}–${a.depthRangeMm[1]} mm`:""}`} (${a.depthSource}).`,`${a.scene.roadType}; traffic: ${a.scene.traffic.join(", ")||"unknown"}.`];
  if(clearance!=null) {
    if (margin != null && margin >= 40 && !isTwoWheeler) {
      reasons.push(`Sourced model clearance reference ${clearance} mm; estimated depth ${depth} mm is ${margin} mm below that reference; this is not an OEM wading limit.`);
    } else {
      reasons.push(`Model clearance reference ${clearance} mm. Exact year/trim applicability is unconfirmed; clearance is not wading capacity.`);
    }
  } else {
    reasons.push(`No reliable clearance reference is available for ${car}.`);
  }
  if(r?.wadingMm) reasons.push(`OEM publishes ${r.wadingMm} mm wading for ${r.label}. This has not been matched to your car or these road conditions.`);
  if(a.scene.movingWater===true) reasons.push("Moving water was reported or observed; traction and stability can fail regardless of clearance.");
  if(/underpass/i.test(a.scene.roadType)) reasons.push("Underpass conditions can deepen quickly and conceal exits or drains.");
  if(a.scene.roadSurfaceVisible!==true) reasons.push("The road surface is hidden or visibility is unknown; submerged damage cannot be excluded.");
  if(a.scene.hazards.length) reasons.push(`Reported hazards: ${a.scene.hazards.slice(0,4).join("; ")}.`);

  let level: "lower" | "caution" | "high";
  let heading: string;

  // Product screening rules use the displayed estimate, not the uncertainty bound.
  // Thresholds are conservative heuristics, not manufacturer crossing limits.
  const knownLimits = [r?.intakeHeightMm, r?.exhaustHeightMm, r?.wadingMm]
    .filter((value): value is number => value != null && value > 0);
  const exposedComponent = depth != null && knownLimits.some(limit => depth >= limit);
  const seriousHazard = a.scene.hazards.some(hazard =>
    /\b(fast current|strong current|open drain|washed.out|collapsed road|electrical hazard)\b/i.test(hazard));

  if (exposedComponent || seriousHazard) {
    level = "high";
    heading = `${v.model}: High risk — ${exposedComponent ? "estimated water reaches a documented vehicle limit" : "a serious road hazard is reported"}.`;
  } else if (depth == null || clearance == null) {
    level = "caution";
    heading = `${v.model}: Risk uncertain — depth or clearance reference is missing.`;
  } else if (margin! <= 0) {
    level = "high";
    heading = `${v.model}: High risk — estimated ${depth} mm water reaches the ${clearance} mm clearance reference.`;
  } else if (isScooter) {
    // A scooter's low components may be exposed before its chassis is submerged.
    // Do not claim a specific exhaust/CVT height when the catalog has none.
    level = depth >= 70 || margin! <= 40 ? "high" : "caution";
    heading = level === "high"
      ? `${v.model}: High risk for scooter — ${depth} mm water raises low-component and traction concerns.`
      : `${v.model}: Caution — low components and two-wheel traction need checking.`;
    reasons.push("Scooter screening uses a 70 mm depth threshold; exact exhaust and CVT inlet heights are not established unless documented.");
  } else if (isTwoWheeler) {
    level = depth >= 120 || margin! <= 40 ? "high" : "caution";
    heading = level === "high"
      ? `${v.model}: High risk for motorcycle — depth or limited clearance increases exposure and balance concerns.`
      : `${v.model}: Caution — ${depth} mm water is below clearance, but balance, traction and exhaust exposure remain concerns.`;
  } else {
    level = margin! <= 40 ? "caution" : "lower";
    heading = level === "lower"
      ? `${v.model}: Lower depth-related risk — ${depth} mm water is ${margin} mm below the ${clearance} mm clearance reference.`
      : `${v.model}: Caution — only ${margin} mm separates estimated water and the clearance reference.`;
  }
  const primaryAction = level === "high"
    ? "Turn back from a dry, safe position; use an alternative route."
    : level === "lower"
      ? "Depth is below the clearance reference; check current road conditions and documented vehicle limits before deciding."
      : "Pause at a dry, safe position; check vehicle limits, traction and the road ahead or use another route.";

  return {
    level,
    heading,
    reasons,
    actions:[
      primaryAction,
      `Confirm ${v.year}${v.variant?` ${v.variant}`:""} intake, exhaust, electrical exposure and OEM water-use limits from your handbook or dealer.`,
      a.contextEvidence?.contradiction?"Resolve conflicting observations with independent evidence; do not enter water to measure it.":a.depthMm==null?"Request a safely captured current photo and a documented metric reference.":`Check a current ${a.scene.roadType.toLowerCase()} report and changing water motion before travel; passing ${a.scene.traffic.length?"traffic":"vehicles"} does not establish your car's capability.`
    ],
    provider:"deterministic",
    providerNote:process.env.BEDROCK_RECOMMENDATION_MODEL_ID?"Cloud adapter configured; local recommendation available.":"Local metric and vehicle rules; Bedrock recommendation model is not configured.",
    vehicleKey:`${v.make}/${v.model}/${v.year}/${v.variant}`,
    checkedFacts:{depthMm:a.depthMm,depthRangeMm:a.depthRangeMm,photoConfidence:a.photoConfidence??a.confidence,combinedEvidenceIndex:a.contextConfidence??null}
  };
}

/** Cloud may choose from server-owned actions and optionally provide crisp heading and reasons; it never generates unauthorized metrics. */
export function validateCloudSelection(value:unknown,base:Recommendation):number[] {
  if(!value||typeof value!=="object"||Array.isArray(value)) throw new Error("Invalid recommendation output.");
  const data=value as Record<string,unknown>;
  const allowed = new Set(["actionOrder", "crispHeading", "crispReasons"]);
  if(Object.keys(data).some(key=>!allowed.has(key))||!Array.isArray(data.actionOrder)||data.actionOrder.length===0||data.actionOrder.length>base.actions.length) throw new Error("Unexpected recommendation fields.");
  const indices=data.actionOrder;
  if(indices.some(x=>!Number.isInteger(x)||x<0||x>=base.actions.length)||new Set(indices).size!==indices.length||indices[0]!==0) throw new Error("Unsafe action selection.");
  // A model can omit an index; append its server-owned action rather than discard
  // valid wording. Never allow a changed primary action or unauthorized index.
  return [...indices, ...base.actions.map((_,index)=>index).filter(index=>!indices.includes(index))] as number[];
}

export async function recommendVehicle(input:RecommendationInput, cloud?: (input:RecommendationInput,base:Recommendation)=>Promise<unknown>):Promise<Recommendation> {
  const base=deterministicRecommendation(input);
  if(!cloud&&!process.env.BEDROCK_RECOMMENDATION_MODEL_ID) return base;
  try {
    const rawOutput=cloud?await cloud(input,base):await bedrockSelection(input,base);
    const order=validateCloudSelection(rawOutput,base);
    const cloudData=(rawOutput&&typeof rawOutput==="object"?rawOutput:{}) as {crispHeading?:string;crispReasons?:string[]};
    // Keep the server-owned verdict and comparison; AI cannot relabel its risk.
    const heading=base.heading;
    const reasons=Array.isArray(cloudData.crispReasons)&&cloudData.crispReasons.length>0?cloudData.crispReasons.map(r=>String(r).trim()).filter(Boolean):base.reasons;

    return {
      ...base,
      heading,
      reasons,
      actions:order.map(index=>base.actions[index]),
      provider:"bedrock",
      providerNote:"AWS Bedrock explained the server-owned screening result and prioritized actions."
    };
  } catch (error) {
    const validationMessages = ["Invalid recommendation output.", "Unexpected recommendation fields.", "Unsafe action selection."];
    const category = error instanceof Error ? (validationMessages.includes(error.message) ? error.message : error.name) : "UnknownError";
    console.warn("[vehicle-recommendation] Bedrock fallback", {category,model:process.env.BEDROCK_RECOMMENDATION_MODEL_ID,region:process.env.AWS_REGION});
    return {...base,provider:"deterministic-cloud-failure",providerNote:"Bedrock unavailable or invalid output; local metric and vehicle rules used."};
  }
}

async function bedrockSelection(input:RecommendationInput,base:Recommendation) {
  const region=process.env.AWS_REGION||"ap-southeast-2";
  const client=new BedrockRuntimeClient({region,maxAttempts:1});
  const modelId=process.env.BEDROCK_RECOMMENDATION_MODEL_ID||"amazon.nova-lite-v1:0";

  const clearance = input.reference?.groundClearanceMm ?? input.research?.groundClearanceMm ?? null;
  const depth = base.checkedFacts.depthMm;
  const clearanceMargin = depth != null && clearance != null ? clearance - depth : null;

  const isTwoWheeler = isTwoWheelerVehicle(input.vehicle.make, input.vehicle.model);
  const isScooter = isScooterVehicle(input.vehicle.make, input.vehicle.model);

  const systemText=`You explain FloodFlow's server-owned vehicle screening result.
The supplied risk was calculated using measuredDepthMm only. The uncertainty range is disclosure, not a replacement depth.
Preserve that risk and the primary action. Do not upgrade risk because the range exceeds clearance.
Use the supplied clearance margin to explain the comparison. Research clearance is not verified for this exact year/trim.
Ground clearance does not establish safe crossing or exhaust/intake heights. Do not invent vehicle dimensions, current speed, or safe RPM.
Cars with more than 40 mm clearance margin have lower depth-related risk; margins of 0–40 mm need caution; depth at/above clearance is high.
Scooter screening uses a 70 mm depth threshold or a clearance margin of 40 mm or less. Motorcycle screening uses 120 mm or a margin of 40 mm or less. These are product heuristics, not verified component heights or OEM water limits. Two-wheelers retain traction/balance concerns. Explain the supplied screening reasons without applying car rules to a scooter.
Do not repeat actions in reasons. Return raw JSON with actionOrder, crispHeading, and crispReasons (2–3 concise bullets).
Actions are indexed. There are exactly ${base.actions.length} actions. Return every index exactly once, with 0 first. Choose an order from allowedActionOrders; never omit an action.
The heading must preserve the supplied risk. Do not describe a crossing as safe or passable.`;

  const userPayload = {
    vehicle: {
      make: input.vehicle.make,
      model: input.vehicle.model,
      year: input.vehicle.year,
      variant: input.vehicle.variant,
      type: isScooter ? "Scooter (CVT)" : isTwoWheeler ? "Motorcycle" : "Four-Wheeler (Car/SUV)",
      groundClearanceMm: clearance,
      wadingDepthMm: input.reference?.wadingMm ?? null
    },
    physicalEvidence: input.physical ?? null,
    facts: base.checkedFacts,
    comparison: {
      measuredDepthMm: depth,
      groundClearanceMm: clearance,
      clearanceMarginMm: clearanceMargin,
      depthExceedsClearance: depth != null && clearance != null ? depth >= clearance : null,
      comparisonBasis: "displayed-depth-only",
      isTwoWheeler,
      isScooter
    },
    scene: input.analysis.scene,
    evidenceIndex: base.checkedFacts.combinedEvidenceIndex ?? base.checkedFacts.photoConfidence,
    risk: base.level,
    screeningReasons: base.reasons,
    actions: base.actions.map((text,index)=>({index,text})),
    allowedActionOrders: [[0,1,2],[0,2,1]]
  };

  const response=await client.send(new ConverseCommand({
    modelId,
    inferenceConfig:{temperature:0.1,maxTokens:300},
    system:[{text:systemText}],
    messages:[{role:"user",content:[{text:JSON.stringify(userPayload)}]}]
  }),{abortSignal:AbortSignal.timeout(8000)});

  const text=response.output?.message?.content?.map(item=>item.text??"").join("")??"";
  const clean=text.trim().replace(/^```json\s*|^```\s*|```$/g,"").trim();
  return JSON.parse(clean);
}
