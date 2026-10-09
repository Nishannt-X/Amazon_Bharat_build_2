/** Frontend-only data boundary for this milestone.
 *  Everything here lives on the device. Nothing is uploaded or shared.
 *  A future backend can accept ReportDraft as the request body.
 */

export interface PhotoState {
  file: File;
  objectUrl: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
}

export interface GpsFix {
  lat: number;
  lng: number;
  accuracyMeters: number;
}

export interface ReportPin {
  lat: number;
  lng: number;
}

export interface VehicleDetails {
  make: string;
  model: string;
  year: string;
  variant: string;
}

export interface ReportDraft {
  photo: PhotoState;
  /** Where the photo was taken. Starts at the GPS fix when granted, then freely adjustable. */
  reportLat: number;
  reportLng: number;
  /** Actual device position. Null until the user grants permission. Never fabricated. */
  gps: GpsFix | null;
  vehicle: VehicleDetails;
}

/** Shared flood report from a future backend data source.
 *  Backend remains deferred: the live array is empty until a source connects.
 *  This interface is the rendering boundary only — no sample reports are
 *  seeded as real data.
 */
export interface FloodReport {
  id: string;
  lat: number;
  lng: number;
  /** ISO timestamp of the report. Display-only. */
  reportedAt: string;
  /** Number of overlapping reports at this hotspot. Drives heat density. */
  reportCount: number;
}

/** Place-search boundary. The Photon free prototype lookup is enabled
 *  (see `src/lib/place-search.ts` + `src/hooks/usePlaceSearch.ts`): the
 *  canonical result shape lives on `LocationSearchBar` as
 *  `PlaceSearchResult` (id/label/detail/lat/lng) and a pick moves the
 *  report pin; manual pin stays working. No backend is involved.
 */

export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type AcceptedPhotoType = (typeof ACCEPTED_PHOTO_TYPES)[number];

export function isAcceptedPhotoType(type: string): type is AcceptedPhotoType {
  return (ACCEPTED_PHOTO_TYPES as readonly string[]).includes(type);
}
