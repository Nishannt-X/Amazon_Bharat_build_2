import sharp from "sharp";
import { distanceMeters } from "./report";

export interface StreetReference {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  distanceMeters: number;
  capturedAt: string | null;
  attribution: string;
  image: Buffer;
}

const STREETVIEW_METADATA_URL =
  "https://maps.googleapis.com/maps/api/streetview/metadata";
const STREETVIEW_IMAGE_URL =
  "https://maps.googleapis.com/maps/api/streetview";

/** Maximum distance from the report pin to accept a street view panorama. */
const MAX_DISTANCE_METERS = 150;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/** Four cardinal headings to sample per panorama. */
const HEADINGS: { label: string; heading: number }[] = [
  { label: "N", heading: 0 },
  { label: "E", heading: 90 },
  { label: "S", heading: 180 },
  { label: "W", heading: 270 },
];

interface StreetViewMetadata {
  status: "OK" | "ZERO_RESULTS" | "NOT_FOUND" | "REQUEST_DENIED" | "UNKNOWN_ERROR";
  pano_id?: string;
  date?: string;
  location?: { lat: number; lng: number };
  copyright?: string;
}

/**
 * Downloads one Street View Static image and resizes it for CV matching.
 * Throws if the request fails or the response is not a JPEG image.
 */
async function fetchStreetViewImage(
  lat: number,
  lng: number,
  heading: number,
  apiKey: string,
): Promise<Buffer> {
  const url = new URL(STREETVIEW_IMAGE_URL);
  url.searchParams.set("location", `${lat},${lng}`);
  url.searchParams.set("size", "640x640");
  url.searchParams.set("fov", "90");
  url.searchParams.set("pitch", "0");
  url.searchParams.set("heading", String(heading));
  url.searchParams.set("key", apiKey);

  const response = await fetch(url, {
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Street View image request failed: ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("image")) {
    throw new Error("Street View response was not an image (API key may be invalid or quota exceeded).");
  }

  const size = Number(response.headers.get("content-length"));
  if (Number.isFinite(size) && size > MAX_IMAGE_BYTES) throw new Error("Street View image too large");

  const reader = response.body!.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > MAX_IMAGE_BYTES) throw new Error("Street View image too large");
      parts.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return sharp(Buffer.concat(parts), { limitInputPixels: 20000000, failOn: "error" })
    .rotate()
    .resize({ width: 1000, height: 1000, fit: "inside" })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Fetches Google Street View imagery for the four cardinal directions
 * at the closest snapped panorama to `location`.
 *
 * Requires GOOGLE_MAPS_API_KEY to be set in the environment.
 * Returns an empty array if the key is absent, the location has no
 * Street View coverage, or the panorama is more than MAX_DISTANCE_METERS away.
 */
export async function nearbyStreetReferences(
  location: { lat: number; lng: number },
): Promise<StreetReference[]> {
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng) ||
    Math.abs(location.lat) > 90 ||
    Math.abs(location.lng) > 180
  ) return [];

  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return [];

  // Step 1: Check metadata to confirm coverage and get the snapped location.
  const metaUrl = new URL(STREETVIEW_METADATA_URL);
  metaUrl.searchParams.set("location", `${location.lat},${location.lng}`);
  metaUrl.searchParams.set("radius", String(MAX_DISTANCE_METERS));
  metaUrl.searchParams.set("source", "outdoor");
  metaUrl.searchParams.set("key", apiKey);

  const metaResponse = await fetch(metaUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!metaResponse.ok) throw new Error("Street View metadata request failed");

  const meta = (await metaResponse.json()) as StreetViewMetadata;
  if (meta.status !== "OK" || !meta.location || !meta.pano_id) return [];

  const snapped = meta.location;
  const distance = distanceMeters(location, snapped);
  if (distance > MAX_DISTANCE_METERS) return [];

  const capturedAt = meta.date ?? null;
  const attribution = meta.copyright ?? "© Google Street View";

  // Step 2: Download all 4 cardinal views in parallel; silently drop any that fail.
  const downloads = await Promise.allSettled(
    HEADINGS.map(async ({ heading }) => {
      const image = await fetchStreetViewImage(
        snapped.lat,
        snapped.lng,
        heading,
        apiKey,
      );
      return {
        id: `${meta.pano_id}-${heading}`,
        lat: snapped.lat,
        lng: snapped.lng,
        heading,
        distanceMeters: Math.round(distance),
        capturedAt,
        attribution,
        image,
      } satisfies StreetReference;
    }),
  );

  return downloads.flatMap((entry) =>
    entry.status === "fulfilled" ? [entry.value] : [],
  );
}
