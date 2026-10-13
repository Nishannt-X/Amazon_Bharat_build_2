import { accessDenied } from "../../../lib/demo-access";
import { NextResponse } from "next/server";
import { generateVehicleFloodAdvisory, parseConversationalFloodReport } from "../../../lib/aws/bedrock";

export async function POST(request: Request) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    const body = await request.json();

    // 1. If payload is a conversational citizen report
    if (body.message && typeof body.message === 'string') {
      const extracted = await parseConversationalFloodReport(body.message);
      return NextResponse.json({
        provider: "aws-bedrock",
        model: process.env.BEDROCK_RECOMMENDATION_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
        extracted: extracted ?? { confidenceScore: 0.0, fallback: true },
      });
    }

    // 2. If payload is vehicle specifications + measured water depth
    if (body.make && body.model && typeof body.measuredDepthCm === 'number') {
      const advisory = await generateVehicleFloodAdvisory({
        make: body.make,
        model: body.model,
        groundClearanceMm: body.groundClearanceMm,
        exhaustHeightMm: body.exhaustHeightMm,
        measuredDepthCm: body.measuredDepthCm,
        locationLabel: body.locationLabel,
      });

      if (advisory) {
        return NextResponse.json({
          provider: "aws-bedrock",
          model: process.env.BEDROCK_RECOMMENDATION_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
          advisory,
        });
      }
    }

    // Default fallback assessment
    return NextResponse.json({
      provider: "deterministic-rules",
      advisory: "Proceed with caution. Never enter unknown floodwaters if water reaches above your vehicle's wheel hub or exhaust level.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        provider: "deterministic-rules",
        error: (error as Error).message,
        advisory: "Water depth evaluation unavailable. Avoid driving through water of unknown depth.",
      },
      { status: 200 }
    );
  }
}

export async function GET() {
  const isConfigured = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
  return NextResponse.json({
    status: isConfigured ? "configured" : "unconfigured",
    provider: "aws-bedrock",
    region: process.env.AWS_REGION || "us-east-1",
    model: process.env.BEDROCK_RECOMMENDATION_MODEL_ID || "anthropic.claude-3-haiku-20240307-v1:0",
  });
}
