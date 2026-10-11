import { analysisOwner } from "../../../../../lib/analysis-http";
import { readReportBaseline } from "../../../../../lib/report-store";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const photo = await readReportBaseline((await params).id);
    if (
      !photo ||
      (photo.report.publicationStatus === "pending" &&
        (!photo.report.evidenceOwner ||
          photo.report.evidenceOwner !== analysisOwner(request)))
    )
      return new Response("Baseline not found", { status: 404 });
    return new Response(new Uint8Array(photo.bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control":
          photo.report.publicationStatus === "pending"
            ? "private, no-store"
            : "public, max-age=86400, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch {
    return new Response("Baseline unavailable", { status: 503 });
  }
}
