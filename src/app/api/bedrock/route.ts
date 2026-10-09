import { NextResponse } from 'next/server';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';

// Initialize the AWS Bedrock client
// Note: In production, ensure AWS_REGION, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY are in .env
const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function POST(request: Request) {
  try {
    const { vehicleName, groundClearance, intakeHeight, depthMm } = await request.json();

    if (!vehicleName || depthMm === undefined) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Determine basic risk context to guide the prompt
    const clearanceMargin = intakeHeight - depthMm;
    const isCritical = clearanceMargin < 20;
    
    // Construct the prompt for Claude on Bedrock
    const prompt = `Human: You are the AI risk assessment engine for FloodFlow, an app that gives drivers personalized advice on navigating flooded roads.
    
Vehicle: ${vehicleName}
Ground Clearance: ${groundClearance}mm
Air Intake Height: ${intakeHeight}mm
Current Water Depth: ${depthMm}mm
Clearance Margin to Intake: ${clearanceMargin}mm

Write a concise, 2-sentence actionable advisory for the driver.
If the clearance margin is less than 20mm, tell them it's critical and to reroute immediately.
If it's safe but above ground clearance, advise caution.
Keep it direct and professional. No pleasantries.

Assistant:`;

    // Try to call AWS Bedrock (if credentials exist)
    try {
      const command = new InvokeModelCommand({
        modelId: 'anthropic.claude-v2', // or claude-3-haiku-20240307-v1:0
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          prompt: prompt,
          max_tokens_to_sample: 100,
          temperature: 0.1,
        }),
      });

      const response = await client.send(command);
      const responseBody = JSON.parse(new TextDecoder().decode(response.body));
      
      return NextResponse.json({ 
        advisory: responseBody.completion.trim(),
        source: 'AWS Bedrock'
      });
      
    } catch (awsError) {
      // Fallback for hackathon demo if AWS credentials aren't set up yet locally
      console.warn("AWS Bedrock Error (falling back to local engine):", awsError);
      
      let fallbackText = '';
      if (isCritical) {
        fallbackText = `Water level (${depthMm}mm) critically exceeds the safe wading depth for your ${vehicleName}. Exhaust submersion and engine hydrolock imminent. Reroute immediately.`;
      } else if (depthMm > groundClearance) {
        fallbackText = `Water level (${depthMm}mm) is approaching the ${intakeHeight}mm intake of your ${vehicleName}. Proceed at a slow, steady pace to avoid creating a bow wave.`;
      } else {
        fallbackText = `Clear to pass. Water level (${depthMm}mm) is safely below the critical components of your ${vehicleName}.`;
      }
      
      return NextResponse.json({ 
        advisory: fallbackText,
        source: 'Local Risk Engine (AWS Pending Config)'
      });
    }
  } catch (error) {
    console.error('Error generating advisory:', error);
    return NextResponse.json({ error: 'Failed to generate risk advisory' }, { status: 500 });
  }
}
