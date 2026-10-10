import { readReportPhoto } from "../../../../../lib/report-store";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const photo = await readReportPhoto((await params).id);
    if (!photo) return new Response("Photo not found", { status: 404 });
    return new Response(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.report.photoMimeType, "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff", "Cache-Control": "public, max-age=86400, immutable", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch { return new Response("Photo unavailable", { status: 503 }); }
}
