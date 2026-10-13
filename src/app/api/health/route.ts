// Public liveness probes must not scan DynamoDB on every visitor/probe.
export async function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
