import { analysisBaseline } from "../../../../../lib/analysis-store";
import { analysisOwner } from "../../../../../lib/analysis-http";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const owner = analysisOwner(request);
  const { id } = await params;
  const photo = owner ? analysisBaseline(id, owner) : null;
  return photo
    ? new Response(new Uint8Array(photo), {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      })
    : new Response("Baseline unavailable", { status: 404 });
}
