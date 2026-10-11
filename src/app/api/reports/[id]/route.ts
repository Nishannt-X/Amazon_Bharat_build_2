import { analysisOwner } from "../../../../lib/analysis-http";
import { readReports } from "../../../../lib/report-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const item = (await readReports()).find((item) => item.id === id);
    const allowed =
      item &&
      (item.publicationStatus !== "pending" ||
        (item.evidenceOwner && item.evidenceOwner === analysisOwner(request)));
    const report = allowed
      ? (({ evidenceOwner: _owner, ...safe }) => {
          void _owner;
          return safe;
        })(item)
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
