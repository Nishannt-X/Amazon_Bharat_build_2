import { readReports } from "../../../../lib/report-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const report = (await readReports()).find((item) => item.id === id);
    return report ? Response.json({ report }, { headers: { "Cache-Control": "no-store" } }) : Response.json({ error: "Report not found." }, { status: 404 });
  } catch { return Response.json({ error: "Report storage is unavailable." }, { status: 503 }); }
}
