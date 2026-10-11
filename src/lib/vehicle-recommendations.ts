import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { waterlogGuidance, type PublicAnalysis } from "./photo-analysis";
import type { VehicleDetails } from "./report";
import type { VehicleReferenceStats } from "./vehicle-report-context";
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
  const guidance=waterlogGuidance(a);
  const upper=a.depthRangeMm?.[1]??a.depthMm;
  const clearance=r?.groundClearanceMm??research?.groundClearanceMm??null;
  const depth=a.depthMm;
  const margin=depth!=null&&clearance!=null ? clearance - depth : null;
  const upperMargin=upper!=null&&clearance!=null ? clearance - upper : null;
  const isTwoWheeler = isTwoWheelerVehicle(v.make, v.model);
  const isScooter = isScooterVehicle(v.make, v.model);

  const reasons=[`${car}: ${a.depthMm==null?"photo depth is unknown":`estimated depth ${a.depthMm} mm${a.depthRangeMm?`, range ${a.depthRangeMm[0]}–${a.depthRangeMm[1]} mm`:""}`} (${a.depthSource}).`,`${a.scene.roadType}; traffic: ${a.scene.traffic.join(", ")||"unknown"}.`];
  if(clearance!=null) {
    if (margin != null && margin >= 40 && !isTwoWheeler) {
      reasons.push(`Sourced model clearance reference ${clearance} mm; estimated depth ${depth} mm leaves an adequate ${margin} mm buffer.`);
    } else {
      reasons.push(`Sourced model clearance reference ${clearance} mm${upper==null?"":`; depth range upper end is ${upper>=clearance?"at or above":"below"} this reference`}. Exact year/trim applicability is unconfirmed; clearance is not wading capacity.`);
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
  let primaryAction: string;

  if (clearance != null && depth != null) {
    if (isScooter) {
      // Scooters (CVT belt box and cooling air inlet at ~100 mm)
      if (depth >= 70 || (upper != null && upper >= 100) || a.scene.movingWater === true) {
        level = "high";
        heading = `${v.model}: High risk for scooter — ${depth} mm water threatens CVT belt slip, stalling, and traction loss.`;
        primaryAction = "Turn back from a dry, safe position; water depth exceeds safe scooter operating limit.";
      } else {
        level = "caution";
        heading = `${v.model}: Caution — shallow water presents slip and low exhaust hazard on scooter.`;
        primaryAction = "Dismount and walk vehicle along high, dry curb if safe; avoid riding through submerged surface.";
      }
    } else if (isTwoWheeler) {
      // Motorcycles
      if (depth >= 120 || (upper != null && upper >= 150) || a.scene.movingWater === true || (margin != null && margin < 40)) {
        level = "high";
        heading = `${v.model}: High risk for motorcycle — depth risks stalling exhaust and loss of balance.`;
        primaryAction = "Turn back from a dry, safe position; do not ride motorcycle through deep water.";
      } else {
        level = "caution";
        heading = `${v.model}: Caution — ${depth} mm water conceals road hazards and risks loss of balance.`;
        primaryAction = "Proceed in 1st gear with steady throttle; avoid submerged potholes and sudden braking.";
      }
    } else {
      // Four-wheelers (Cars & SUVs)
      if (depth >= clearance || (upper != null && upper >= clearance) || (margin != null && margin < 35)) {
        level = "high";
        heading = `Avoid this waterlogged route in your ${v.model}. Water depth approaches or exceeds ${clearance} mm clearance limits.`;
        primaryAction = "Turn back from a dry, safe position; use an alternative route.";
      } else if (a.scene.movingWater === true && depth >= 110) {
        level = "high";
        heading = `Avoid this route in your ${v.model}: moving water current exceeds safe stability limits.`;
        primaryAction = "Turn back from a dry, safe position; use an alternative route.";
      } else if (margin != null && margin >= 40 && depth <= 100 && (!a.scene.movingWater || depth <= 80) && (upperMargin == null || upperMargin >= 25)) {
        level = "lower";
        heading = `${v.model}: Passable with caution — estimated depth ${depth} mm maintains safe ${margin} mm clearance buffer.`;
        primaryAction = "Passable with steady low-gear throttle (1500–2000 RPM); do not stop or change gears in water.";
      } else {
        level = "caution";
        heading = `${v.model}: Proceed with caution — maintain safe margin below ${clearance} mm clearance.`;
        primaryAction = "Proceed with slow, steady momentum; avoid creating bow waves and watch for submerged dips.";
      }
    }
  } else {
    const high = guidance.level === "high" || (upper != null && clearance != null && upper >= clearance);
    level = high ? "high" : guidance.level;
    heading = high ? `Avoid this waterlogged route in your ${v.model}.` : `${v.model}: ${a.depthMm == null ? "establish depth before considering this route" : "choose a dry alternative while evidence is uncertain"}.`;
    primaryAction = high ? "Turn back from a dry, safe position; use an alternative route." : "Wait at a dry, safe position or select a dry route; no crossing clearance is established.";
  }

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
  if(Object.keys(data).some(key=>!allowed.has(key))||!Array.isArray(data.actionOrder)||data.actionOrder.length!==base.actions.length) throw new Error("Unexpected recommendation fields.");
  const indices=data.actionOrder;
  if(indices.some(x=>!Number.isInteger(x)||x<0||x>=base.actions.length)||new Set(indices).size!==indices.length||indices[0]!==0) throw new Error("Unsafe action selection.");
  return indices as number[];
}

export async function recommendVehicle(input:RecommendationInput, cloud?: (input:RecommendationInput,base:Recommendation)=>Promise<unknown>):Promise<Recommendation> {
  const base=deterministicRecommendation(input);
  if(!cloud&&!process.env.BEDROCK_RECOMMENDATION_MODEL_ID) return base;
  try {
    const rawOutput=cloud?await cloud(input,base):await bedrockSelection(input,base);
    const order=validateCloudSelection(rawOutput,base);
    const cloudData=(rawOutput&&typeof rawOutput==="object"?rawOutput:{}) as {crispHeading?:string;crispReasons?:string[]};
    const heading=typeof cloudData.crispHeading==="string"&&cloudData.crispHeading.trim()?cloudData.crispHeading.trim():base.heading;
    const reasons=Array.isArray(cloudData.crispReasons)&&cloudData.crispReasons.length>0?cloudData.crispReasons.map(r=>String(r).trim()).filter(Boolean):base.reasons;

    return {
      ...base,
      heading,
      reasons,
      actions:order.map(index=>base.actions[index]),
      provider:"bedrock",
      providerNote:"AWS Bedrock Nova synthesized contextual safety verdict and prioritized actions."
    };
  } catch {
    return {...base,provider:"deterministic-cloud-failure",providerNote:"Bedrock unavailable or invalid output; local metric and vehicle rules used."};
  }
}

async function bedrockSelection(input:RecommendationInput,base:Recommendation) {
  const region=process.env.AWS_REGION||"ap-southeast-2";
  const client=new BedrockRuntimeClient({region,maxAttempts:1});
  const modelId=process.env.BEDROCK_RECOMMENDATION_MODEL_ID||"amazon.nova-lite-v1:0";

  const clearance = input.reference?.groundClearanceMm ?? input.research?.groundClearanceMm ?? null;
  const depth = base.checkedFacts.depthMm;
  const upper = base.checkedFacts.depthRangeMm?.[1] ?? depth;
  const clearanceMargin = depth != null && clearance != null ? clearance - depth : null;
  const upperExceeds = upper != null && clearance != null ? upper >= clearance : false;

  const isTwoWheeler = isTwoWheelerVehicle(input.vehicle.make, input.vehicle.model);
  const isScooter = isScooterVehicle(input.vehicle.make, input.vehicle.model);

  const systemText=`You are FloodFlow's precise, safety-critical driver advisory copilot for Indian urban monsoons.
You are given verified vehicle specifications, flood depth estimates with uncertainty ranges, and road hazard observations.

CRITICAL PHYSICAL RULES:
1. Four-Wheelers (Cars & SUVs, e.g. Hyundai Creta, Maruti Swift):
   - A water depth under 100 mm (e.g. 74 mm, 76 mm, 85 mm) with a clearance margin of 40 mm+ (e.g. 116 mm on a 190 mm Creta) is PASSABLE with steady low-gear throttle (1500–2000 RPM)!
   - NEVER tell car drivers to turn back for a 74 mm puddle when they have ample ground clearance!
   - State clearly: "Passable with caution: water depth of ${depth ?? '74'} mm is ${clearanceMargin != null ? Math.abs(clearanceMargin) + ' mm below' : 'well below'} your vehicle's ${clearance ?? 'standard'} mm ground clearance, maintaining a safe buffer."
2. Two-Wheelers:
   - Scooters (e.g. Honda Activa 6G, TVS Jupiter, Ather, Ola): Scooters have low CVT belt cases (~100 mm) and low exhaust outlets. Water of 70 mm+ reaches near the belt cooling intake, risking belt slip, loss of propulsion, and stalling! Warn of HIGH RISK of CVT belt slip, stalling, and traction loss!
   - Motorcycles (e.g. Triumph Speed 400, Royal Enfield Classic 350, Himalayan): Submerged road conceals potholes, open drains, and slippery mud. Depth above 70 mm presents balance and stalling hazards.
3. Align Heading with Evaluated Risk Level:
   - If risk is "high": crispHeading MUST declare High Risk or Turn Back (e.g. "High Risk: Avoid in TVS Jupiter — CVT Belt Slip Hazard"). NEVER claim "Safe Passage" when risk is high!
   - If risk is "caution": crispHeading MUST declare Caution (e.g. "Caution Advised for Triumph Speed 400 in 74 mm Water Depth").
   - If risk is "lower": crispHeading should declare Safe Passage with Caution (e.g. "Safe Passage for Hyundai Creta in 74 mm Water Depth").
4. Action Ordering:
   - "actionOrder" MUST always start with 0 (e.g. [0, 1, 2] or [0, 2, 1]). Never put 1 or 2 in the first position.

Output JSON:
{
  "actionOrder": [0, 1, 2],
  "crispHeading": string,
  "crispReasons": string[] (2-3 crisp bullets with accurate physical reasoning)
}
Return raw JSON only, no markdown codeblocks or extra commentary.`;

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
    facts: base.checkedFacts,
    comparison: {
      measuredDepthMm: depth,
      groundClearanceMm: clearance,
      clearanceMarginMm: clearanceMargin,
      depthExceedsClearance: depth != null && clearance != null ? depth >= clearance : null,
      upperRangeExceedsClearance: upperExceeds,
      isTwoWheeler,
      isScooter
    },
    scene: input.analysis.scene,
    evidenceIndex: base.checkedFacts.combinedEvidenceIndex ?? base.checkedFacts.photoConfidence,
    risk: base.level,
    actions: base.actions
  };

  const response=await client.send(new ConverseCommand({
    modelId,
    inferenceConfig:{temperature:0.1,maxTokens:300},
    system:[{text:systemText}],
    messages:[{role:"user",content:[{text:JSON.stringify(userPayload)}]}]
  }),{abortSignal:AbortSignal.timeout(8000)});

  const text=response.output?.message?.content?.map(item=>item.text??"").join("")??"";
  const clean=text.replace(/^```json\s*|^```\s*|```$/g,"").trim();
  return JSON.parse(clean);
}
