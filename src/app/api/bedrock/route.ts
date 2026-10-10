import { NextResponse } from "next/server";

/**
 * Risk assessment is deliberately deferred. This route stays unwired from
 * the UI and returns an honest unavailable state instead of any advisory.
 */
export async function POST() {
  return NextResponse.json(
    {
      code: "ASSESSMENT_UNAVAILABLE",
      error: "Risk assessment is not available yet.",
    },
    { status: 503 },
  );
}

export async function GET() {
  return NextResponse.json(
    {
      code: "ASSESSMENT_UNAVAILABLE",
      error: "Risk assessment is not available yet.",
    },
    { status: 503 },
  );
}
