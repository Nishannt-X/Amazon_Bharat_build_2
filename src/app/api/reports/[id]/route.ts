import { accessDenied } from "../../../../lib/demo-access";
import { analysisOwner } from "../../../../lib/analysis-http";
import { readPublicReportById, readReports } from "../../../../lib/report-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    const { id } = await params;
    let item = (await readReports()).find((item) => item.id === id);
    if (!item) {
      item = (await readPublicReportById(id)) ?? undefined;
    }
    const allowed =
      item &&
      (item.publicationStatus !== "pending" ||
        ("evidenceOwner" in item && item.evidenceOwner === analysisOwner(request)));
    const report = allowed
      ? (({ evidenceOwner: _owner, ...safe }) => {
          void _owner;
          return safe;
        })(item as unknown as Record<string, unknown>)
      : null;
    return report
      ? Response.json({ report }, { headers: { "Cache-Control": "no-store" } })
      : Response.json({ error: "Report not found." }, { status: 404 });
  } catch {
    return Response.json(
      { error: "Report storage is unavailable." },
      { status: 503 },
    );
  }
}
