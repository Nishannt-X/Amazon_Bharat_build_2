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
- "movingWater": boolean or null (true if observer mentions flow, current, waves, rushing water)
- "roadSurfaceVisible": boolean or null (false if observer states road is completely hidden/murky)
- "hazardsToAdd": array of strings (e.g. ["open drain", "stalled vehicle", "submerged pothole", "fast current"])
- "confidenceDelta": integer between -10 and +10 (positive if observer provides clear, specific visual landmarks; 0 if unknown or vague; negative if contradictory)
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

export interface McqOption {
  id: string;
  label: string;
  depthMm?: number | null;
  confidenceBonus: number;
  movingWater?: boolean | null;
  hazard?: string | null;
}

export interface QuantitativeQuestion {
  question: string;
  category: 'depth_landmark' | 'water_flow' | 'road_hazards';
  options: McqOption[];
  turnIndex: number;
}

/**
 * Generates structured quantitative MCQs with physical values and confidence contributions.
 */
export async function generateQuantitativeMcqQuestion(
  analysis: {
    scene: { roadType: string; traffic: string[]; hazards: string[]; movingWater?: boolean | null; roadSurfaceVisible?: boolean | null };
    depthMm: number | null;
    depthRangeMm: [number, number] | null;
    confidence: number;
    answers: Array<{ question: string; answer: string }>;
  }
): Promise<QuantitativeQuestion | null> {
  const turnIndex = analysis.answers ? analysis.answers.length : 0;
  if (turnIndex >= 3) return null;

  const fallbackPresets: Record<number, QuantitativeQuestion> = {
    0: {
      question: "From where you are safely standing, where does the water reach relative to physical markers?",
      category: "depth_landmark",
      turnIndex: 0,
      options: [
        { id: "ankle", label: "Ankle level (~75 mm / 3 in)", depthMm: 75, confidenceBonus: 6 },
        { id: "shin", label: "Mid-shin or curb level (~180 mm / 7 in)", depthMm: 180, confidenceBonus: 8 },
        { id: "knee", label: "Knee or wheel hub level (~450 mm / 18 in)", depthMm: 450, confidenceBonus: 10, hazard: "deep water" },
        { id: "waist", label: "Above waist or headlight level (>800 mm)", depthMm: 850, confidenceBonus: 10, hazard: "extreme flood depth" },
        { id: "unknown", label: "Cannot judge safely from my position", depthMm: null, confidenceBonus: 0 }
      ]
    },
    1: {
      question: "How is the floodwater moving across this roadway?",
      category: "water_flow",
      turnIndex: 1,
      options: [
        { id: "still", label: "Stagnant standing pool / no movement", movingWater: false, confidenceBonus: 5 },
        { id: "slow", label: "Slow gentle drift / light ripples", movingWater: false, confidenceBonus: 5 },
        { id: "fast", label: "Fast current / visible rushing flow", movingWater: true, hazard: "strong current", confidenceBonus: 8 },
        { id: "unknown", label: "Cannot observe water motion", movingWater: null, confidenceBonus: 0 }
      ]
    },
    2: {
      question: "Can you observe the road surface, curbs, or open storm drains?",
      category: "road_hazards",
      turnIndex: 2,
      options: [
        { id: "visible", label: "Road markings and curbs clearly visible through water", confidenceBonus: 5 },
        { id: "murky", label: "Murky brown water; road surface is completely hidden", hazard: "concealed road damage", confidenceBonus: 6 },
        { id: "drain", label: "Open storm drain, missing manhole, or swirling whirlpool", hazard: "open drain whirlpool", confidenceBonus: 9 },
        { id: "stalled", label: "Stalled vehicle ahead stranded in water", hazard: "stalled vehicle obstruction", confidenceBonus: 8 },
        { id: "unknown", label: "Cannot see road surface safely", confidenceBonus: 0 }
      ]
    }
  };

  const client = getBedrockClient();
  const defaultMcq = fallbackPresets[turnIndex] ?? null;
  if (!client) return defaultMcq;

  const modelId = process.env.BEDROCK_RECOMMENDATION_MODEL_ID || 'amazon.nova-lite-v1:0';

  const systemPrompt = `You are FloodFlow's quantitative flood evidence collector.
Given scene analysis and previous Q&A turns, generate ONE tailored multiple choice question (MCQ) for a citizen observer standing safely nearby.
Category progression:
- Turn 0: Water level landmarks (curbs, ankles, wheel hubs)
- Turn 1: Flow velocity and water movement
- Turn 2: Submerged hazards (open drains, potholes, stalled cars)
Each option MUST have:
- "id": short slug
- "label": descriptive text with quantitative physical reference in parentheses
- "depthMm": estimated depth in mm if applicable, or null
- "confidenceBonus": integer 0-10 representing evidentiary value
- "movingWater": boolean or null
- "hazard": string or null
Return raw JSON matching schema:
{
  "question": string,
  "category": "depth_landmark" | "water_flow" | "road_hazards",
  "options": [ { "id": string, "label": string, "depthMm": number|null, "confidenceBonus": number, "movingWater": boolean|null, "hazard": string|null } ]
}
Return raw JSON only, no markdown.`;

  const userContext = JSON.stringify({
    turnIndex,
    roadType: analysis.scene.roadType,
    estimatedDepthMm: analysis.depthMm,
    depthRange: analysis.depthRangeMm,
    movingWater: analysis.scene.movingWater,
    hazards: analysis.scene.hazards,
    previousTurns: analysis.answers,
  });

  try {
    const raw = await invokeBedrockText(client, modelId, systemPrompt, userContext, 350);
    if (!raw) return defaultMcq;
    const clean = raw.replace(/^\`\`\`json\s*|^\`\`\`\s*|\`\`\`$/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed && typeof parsed.question === 'string' && Array.isArray(parsed.options) && parsed.options.length >= 3) {
      return {
        question: parsed.question.trim(),
        category: parsed.category || defaultMcq?.category || 'depth_landmark',
        options: parsed.options,
        turnIndex
      };
    }
    return defaultMcq;
  } catch (_err) {
    void _err;
    return defaultMcq;
  }
}
