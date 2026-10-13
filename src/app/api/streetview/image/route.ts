import { cachedViewFile, readCachedView } from "../../../../lib/streetview";

/** Serves an already-cached Street View view by strict id. Never calls Google. */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const file = cachedViewFile(id);
  if (!file) return new Response("Invalid view id", { status: 400 });
  try {
    const bytes = await readCachedView(file);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("View not cached", { status: 404 });
  }
}
