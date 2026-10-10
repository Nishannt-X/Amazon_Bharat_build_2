import { MAX_PHOTO_BYTES } from "../../../lib/report";
import { readReports, ReportInputError, storeReport } from "../../../lib/report-store";

const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const limit = Number(query.get("limit") ?? 200);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return Response.json({ error: "Limit must be between 1 and 500." }, { status: 400, headers });
    let reports = await readReports();
    const bbox = query.get("bbox");
    if (bbox) {
      const bounds = bbox.split(",").map(Number);
      if (bounds.length !== 4 || bounds.some((n) => !Number.isFinite(n)) || bounds[0] < -180 || bounds[2] > 180 || bounds[1] < -90 || bounds[3] > 90 || bounds[0] > bounds[2] || bounds[1] > bounds[3]) return Response.json({ error: "Invalid bbox: use west,south,east,north." }, { status: 400, headers });
      reports = reports.filter((r) => r.lng >= bounds[0] && r.lng <= bounds[2] && r.lat >= bounds[1] && r.lat <= bounds[3]);
    }
    const cursor = query.get("cursor");
    const cursorIndex = cursor ? reports.findIndex((r) => r.id === cursor) : -1;
    if (cursor && cursorIndex < 0) return Response.json({ error: "Invalid cursor." }, { status: 400, headers });
    const start = cursorIndex + 1;
    const page = reports.slice(start, start + limit);
    return Response.json({ reports: page, nextCursor: start + limit < reports.length ? page.at(-1)?.id ?? null : null, total: reports.length, scope: "single-server" }, { headers });
  } catch { return Response.json({ error: "Report storage is unavailable." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Publish from this site's reporting form." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) throw new ReportInputError("Use a photo upload with report metadata.");
    const maxBody = MAX_PHOTO_BYTES + 64 * 1024;
    if (Number(request.headers.get("content-length")) > maxBody) return Response.json({ error: "Photo upload is too large." }, { status: 413, headers });
    const reader = request.body?.getReader();
    if (!reader) throw new ReportInputError("Upload body is required.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > maxBody) { await reader.cancel(); return Response.json({ error: "Photo upload is too large." }, { status: 413, headers }); }
      chunks.push(chunk.value);
    }
    const body = Buffer.concat(chunks);
    const form = await new Response(body, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
    const photo = form.get("photo");
    const metadata = form.get("metadata");
    if (!(photo instanceof File) || typeof metadata !== "string" || metadata.length > 16000) throw new ReportInputError("A photo and report metadata are required.");
    let parsed: unknown;
    try { parsed = JSON.parse(metadata); } catch { throw new ReportInputError("Invalid report metadata."); }
    const report = await storeReport(parsed, new Uint8Array(await photo.arrayBuffer()), photo.type, photo.name);
    return Response.json({ report }, { status: 201, headers });
  } catch (error) {
    if (error instanceof ReportInputError) return Response.json({ error: error.message }, { status: 400, headers });
    return Response.json({ error: "Report could not be saved. Please retry." }, { status: 503, headers });
  }
}
