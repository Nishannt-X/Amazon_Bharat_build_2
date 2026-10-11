import type { VoiceLanguage } from "../voice-language";
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

export interface BedrockAdvisoryParams {
  make: string;
  model: string;
  groundClearanceMm?: number | null;
  wadingDepthMm?: number | null;
  intakeHeightMm?: number | null;
  exhaustHeightMm?: number | null;
  measuredDepthCm: number;
  locationLabel?: string;
}

export interface BedrockChatReportExtraction {
  locationHint?: string;
  vehicleObserved?: string;
  referenceObject?: string;
  estimatedWaterLevel?: string;
  confidenceScore: number;
}

export interface VisibleVehicleCandidate {
  make: string;
  model: string;
  generation?: string;
  bodyType?: string;
  nominalTireDiameterMm?: number;
  nominalWheelBaseMm?: number;
  confidence: number;
  reasoning: string;
}

export interface VehicleCandidateResult {
  candidates: VisibleVehicleCandidate[];
  source: 'aws-bedrock-nova' | 'aws-bedrock-claude' | 'heuristic';
}

export interface AnswerContextExtraction {
  movingWater?: boolean;
  roadSurfaceVisible?: boolean;
  hazardsToAdd?: string[];
  referenceClues?: string;
  confidenceDelta: number;
}

function getBedrockClient(): BedrockRuntimeClient | null {
  const region = process.env.AWS_REGION || 'ap-southeast-2';
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    return null;
  }

  return new BedrockRuntimeClient({
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

/**
 * Universal Bedrock invocation supporting Amazon Nova and Anthropic Claude models.
 */
async function invokeBedrockText(
  client: BedrockRuntimeClient,
  modelId: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number = 200
): Promise<string | null> {
  const isNova = modelId.startsWith('amazon.nova');

  let bodyPayload: Record<string, unknown>;
  if (isNova) {
    bodyPayload = {
      system: [{ text: systemPrompt }],
      messages: [
        {
          role: 'user',
          content: [{ text: userPrompt }],
        },
      ],
      inferenceConfig: {
        maxTokens,
        temperature: 0.2,
      },
    };
  } else {
    // Anthropic Claude
    bodyPayload = {
      anthropic_version: 'bedrock-2023-05-31',
      max_tokens: maxTokens,
      temperature: 0.2,
      system: systemPrompt,
      messages: [
        {
          role: 'user',
          content: userPrompt,
        },
      ],
    };
  }

  const response = await client.send(
    new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(JSON.stringify(bodyPayload)),
    })
  );

  const raw = JSON.parse(Buffer.from(response.body).toString('utf8'));
  if (isNova) {
    return raw.output?.message?.content?.[0]?.text?.trim() ?? null;
  } else {
    return raw.content?.[0]?.text?.trim() ?? null;
  }
}

/**
 * Generates personalized driver advisory text comparing vehicle ground clearance
 * and exhaust/intake limits against the measured flood depth using AWS Bedrock.
 */
export async function generateVehicleFloodAdvisory(params: BedrockAdvisoryParams): Promise<string | null> {
  const client = getBedrockClient();
  if (!client) return null;

  const modelId = process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0';

  const systemPrompt = `You are FloodFlow's concise, safety-critical driver advisory copilot for Indian urban monsoons.
Given a vehicle's specifications and measured flood depth, produce an urgent 2-sentence driving assessment.
State clearly:
1. Ground clearance / exhaust safety comparison with the measured water depth.
2. A direct action (e.g. "Do not cross: engine hydrolock danger" or "Caution: clearance is narrow" or "Passable with slow momentum").
Never invent missing vehicle specifications; if a metric is unknown, state that conservatively.`;

  const userPrompt = `Vehicle: ${params.make} ${params.model}
Ground clearance: ${params.groundClearanceMm ? `${params.groundClearanceMm} mm` : 'Unknown'}
Exhaust outlet height: ${params.exhaustHeightMm ? `${params.exhaustHeightMm} mm` : 'Estimated standard'}
Water depth measured: ${params.measuredDepthCm} cm (${params.measuredDepthCm * 10} mm)
Location: ${params.locationLabel || 'Waterlogged roadway'}`;

  try {
    return await invokeBedrockText(client, modelId, systemPrompt, userPrompt, 150);
  } catch (err) {
    console.warn('[AWS Bedrock] Advisory call fallback:', (err as Error).message);
    return null;
  }
}

/**
 * Extracts structured flood parameters from informal citizen chat or voice transcript.
 */
export async function parseConversationalFloodReport(message: string): Promise<BedrockChatReportExtraction | null> {
  const client = getBedrockClient();
  if (!client || !message.trim()) return null;

  const modelId = process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0';

  const systemPrompt = `Extract flood observations from this citizen report into a clean JSON object with keys:
"locationHint" (string or null),
"vehicleObserved" (string or null),
"referenceObject" (e.g. "wheels", "door handles", "headlights", or null),
"estimatedWaterLevel" (e.g. "submerged tires", "half-wheel", or null),
"confidenceScore" (0.0 to 1.0).
Output raw JSON only with NO markdown fences, no surrounding commentary.`;

  const userPrompt = `Report: "${message}"`;

  try {
    const rawText = await invokeBedrockText(client, modelId, systemPrompt, userPrompt, 150);
    if (!rawText) return null;
    const clean = rawText.replace(/^```json\s*|^```\s*|```$/g, '').trim();
    return JSON.parse(clean) as BedrockChatReportExtraction;
  } catch (err) {
    console.warn('[AWS Bedrock] Chat parsing fallback:', (err as Error).message);
    return null;
  }
}

/**
 * Identifies likely visible vehicle candidates (make, model, generation) from flood scene
 * to supply nominal tire priors for Codex's reference-prior CV pipeline.
 */
export async function identifyVisibleVehicleCandidates(sceneDescription: string): Promise<VehicleCandidateResult | null> {
  const client = getBedrockClient();
  if (!client || !sceneDescription.trim()) return null;

  const modelId = process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0';

  const systemPrompt = `You are an automotive reference vision classifier for flood analysis in India.
Analyze the scene description/detected labels and return a JSON object with a "candidates" list:
Each candidate has:
- make (string)
- model (string)
- generation (string, e.g. "2020-2024 Facelift" or "Unknown")
- bodyType (e.g. "compact-suv", "hatchback", "sedan", "scooter", "bus")
- nominalTireDiameterMm (number or null, e.g. 660 for Creta 215/60R17)
- confidence (0.0 to 1.0, conservative)
- reasoning (brief sentence)
Output raw JSON only, no markdown formatting.`;

  const userPrompt = `Scene context / labels: "${sceneDescription}"`;

  try {
    const rawText = await invokeBedrockText(client, modelId, systemPrompt, userPrompt, 250);
    if (!rawText) return null;
    const clean = rawText.replace(/^```json\s*|^```\s*|```$/g, '').trim();
    const parsed = JSON.parse(clean);
    return {
      candidates: parsed.candidates || [],
      source: modelId.startsWith('amazon.nova') ? 'aws-bedrock-nova' : 'aws-bedrock-claude'
    };
  } catch (err) {
    console.warn('[AWS Bedrock] Vehicle candidate fallback:', (err as Error).message);
    return null;
  }
}

/**
 * Generates dynamic, context-aware RAG clarifying questions based on observed scene gaps.
 */
export async function generateDynamicRagQuestion(
  analysis: {

    scene: { roadType: string; traffic: string[]; hazards: string[]; movingWater?: boolean | null; roadSurfaceVisible?: boolean | null };
    depthMm: number | null;
    depthRangeMm: [number, number] | null;
    confidence: number;
    answers: Array<{ question: string; answer: string }>;
  }
): Promise<string | null> {
  const client = getBedrockClient();
  if (!client) return null;
  const modelId = process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0';

  const systemPrompt = `You are FloodFlow's safety observation interviewer for Indian monsoon floods.
Given the current flood scene analysis and previous Q&A turns, generate ONE dynamic, highly-relevant clarifying question to ask an observer standing safely nearby.
Guidelines:
1. Fill critical gaps: water motion, submerged hazards, or water level against physical landmarks (curbs, wheel rims, medians).
2. Never ask for arbitrary numerical depth in centimetres or millimetres.
3. Keep the question crisp, under 25 words, and strictly safety-first.
4. If 4 or more turns have already been completed, output "COMPLETE".
Output only the raw question string with no quotes or markdown.`;

  const userContext = JSON.stringify({
    roadType: analysis.scene.roadType,
    estimatedDepthMm: analysis.depthMm,
    depthRange: analysis.depthRangeMm,
    confidence: analysis.confidence,
    movingWater: analysis.scene.movingWater,
    hazards: analysis.scene.hazards,
    previousTurns: analysis.answers,
  });

  try {
    const raw = await invokeBedrockText(client, modelId, systemPrompt, userContext, 80);
    if (!raw || raw.trim().toUpperCase() === 'COMPLETE') return null;
    return raw.trim().replace(/^["']|["']$/g, '');
  } catch (err) {
    console.warn('[AWS Bedrock] Dynamic question fallback:', (err as Error).message);
    return null;
  }
}

/**
 * Evaluates citizen observation answers and extracts factual context and confidence adjustments.
 */
export async function evaluateObservationAnswer(
  question: string,
  answer: string
): Promise<AnswerContextExtraction | null> {
  const client = getBedrockClient();
  if (!client || !answer.trim()) return null;
  const modelId = process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0';

  const systemPrompt = `You are FloodFlow's observational evidence evaluator.
Analyze a citizen's answer to a flood question and extract facts into a JSON object:
- "movingWater": boolean or null (true only for an explicit directional flow/current observation; ripples or vehicle wakes alone do not establish current)
- "roadSurfaceVisible": boolean or null (false if observer states road is completely hidden/murky)
- "hazardsToAdd": array of strings (e.g. ["open drain", "stalled vehicle", "submerged pothole", "fast current"])
- "confidenceDelta": integer between -10 and +10 (positive if observer provides clear, specific visual landmarks; 0 if unknown or vague; negative if contradictory)
Do not infer millimetres from ankles, knees or wheel hubs; body height and documented object geometry are required. Do not invent vehicle dimensions or current speed.
Output raw JSON only with no markdown or formatting.`;

  const userPrompt = `Question: "${question}"\nAnswer: "${answer}"`;

  try {
    const rawText = await invokeBedrockText(client, modelId, systemPrompt, userPrompt, 150);
    if (!rawText) return null;
    const clean = rawText.replace(/^```json\s*|^```\s*|```$/g, '').trim();
    return JSON.parse(clean) as AnswerContextExtraction;
  } catch (_err) {
    void _err;
    return null;
  }
}

export { type McqOption, type QuantitativeQuestion } from "../context-questions";
import { contextQuestion, validateContextQuestion, type QuantitativeQuestion } from "../context-questions";

/** Bedrock personalizes wording; server-owned qualitative choices carry no invented metric depths. */
export async function generateQuantitativeMcqQuestion(
  analysis: {
    scene: { roadType: string; traffic: string[]; hazards: string[]; movingWater?: boolean | null; roadSurfaceVisible?: boolean | null };
    depthMm: number | null;
    depthRangeMm: [number, number] | null;
    confidence: number;
    answers: Array<{ question: string; answer: string }>;
  },
  language: VoiceLanguage = "en-IN"
): Promise<QuantitativeQuestion | null> {
  const canonical = contextQuestion(analysis.answers.length, language);
  if (!canonical || canonical.category === "body_height") return canonical;
  const client = getBedrockClient();
  if (!client) return canonical;
  const systemPrompt = `You personalize a FloodFlow citizen-observation question, not its measurement logic.
Write in ${language === "hi-IN" ? "Hindi using Devanagari script" : "English"}.
Keep the supplied category and meaning. The observer must remain at a safe location; never ask them to enter water.
Ankles, knees, curbs, bus wheels and wheel hubs have no universal height. Never assign millimetres, inches or numerical depths to them.
Ask for qualitative observations only. Body-level evidence needs the person's actual height; wheel evidence needs the identified vehicle and documented tire dimensions.
Ankle/knee observation is not a measured depth. Ripples or traffic wakes do not establish a fast current.
Return JSON with question:string and category:string only. Do not generate options, depthMm, confidenceBonus or other metrics.`;
  const userContext = JSON.stringify({canonicalQuestion:canonical.question,category:canonical.category,scene:analysis.scene,previousTurns:analysis.answers});
  try {
    const raw = await invokeBedrockText(client, process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0', systemPrompt, userContext, 250);
    if (!raw) return canonical;
    const clean = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();
    return validateContextQuestion(JSON.parse(clean), canonical);
  } catch { return canonical; }
}
