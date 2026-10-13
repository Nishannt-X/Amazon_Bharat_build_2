import { accessDenied } from "../../../../../lib/demo-access";
import { analysisOwner } from "../../../../../lib/analysis-http";
import { readReportPhoto } from "../../../../../lib/report-store";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = accessDenied(request);
  if (denied) return denied;
  try {
    const photo = await readReportPhoto((await params).id);
    if (
      !photo ||
      (photo.report.publicationStatus === "pending" &&
        (!photo.report.evidenceOwner ||
          photo.report.evidenceOwner !== analysisOwner(request)))
    )
      return new Response("Photo not found", { status: 404 });
    return new Response(new Uint8Array(photo.bytes), {
      headers: {
        "Content-Type": photo.report.photoMimeType,
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        "Cache-Control":
          photo.report.publicationStatus === "pending"
            ? "private, no-store"
            : "public, max-age=86400, immutable",
        "Content-Security-Policy": "default-src none; sandbox",
      },
    });
  } catch {
    return new Response("Photo unavailable", { status: 503 });
  }
}
