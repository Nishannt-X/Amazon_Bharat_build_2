/** Small server-side reverse lookup for saved report pins (Photon / OSM). */
const ENDPOINT = "https://photon.komoot.io/reverse";

type PhotonFeature = {
  properties?: Record<string, unknown>;
};

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Return the closest useful road/place name, or null when the provider fails. */
export async function reverseGeocodeLabel(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return null;
  const query = new URLSearchParams({ lat: String(lat), lon: String(lng), lang: "en" });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(`${ENDPOINT}?${query}`, {
      headers: { Accept: "application/geo+json" },
      signal: controller.signal,
      cache: "force-cache",
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { features?: PhotonFeature[] };
    const props = body.features?.[0]?.properties;
    if (!props) return null;

    const primary =
      text(props.street) ??
      text(props.name) ??
      text(props.locality) ??
      text(props.district) ??
      text(props.city);
    if (!primary) return null;
    const area = text(props.locality) ?? text(props.district) ?? text(props.city);
    const city = text(props.city) ?? text(props.state);
    const parts = [primary];
    for (const part of [area, city]) {
      if (part && !parts.some((existing) => existing.toLowerCase() === part.toLowerCase()))
        parts.push(part);
    }
    return parts.join(", ").slice(0, 180);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
