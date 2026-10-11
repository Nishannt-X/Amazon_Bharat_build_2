import { connection } from "next/server";
import { readReports } from "../../../lib/report-store";
import { isDynamoConfigured } from "../../../lib/aws/dynamodb";
export async function GET() {
  await connection();
  try {
    const reports = await readReports();
    return Response.json({
      status: "ok",
      database: isDynamoConfigured() ? "aws-dynamodb+s3" : "sqlite",
      reports: reports.filter((r) => r.provenance !== "sample").length,
      samples: reports.filter((r) => r.provenance === "sample").length
    }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ status: "unavailable" }, { status: 503 }); }
}
