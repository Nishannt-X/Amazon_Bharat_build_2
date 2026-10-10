import type { SharedWaterlogReport } from "./report";

/** Illustrative fixtures, never live incidents or routing evidence. Stable IDs
 * make repeated seeding idempotent and keep real community reports untouched.
 */
export function createSampleReports(photoSizeBytes: number): SharedWaterlogReport[] {
  const locations = [
    { name: "Minto Bridge, Delhi", lat: 28.6333, lng: 77.2224, depth: 45 },
    { name: "Kashmere Gate, Delhi", lat: 28.6678, lng: 77.2289, depth: 18 },
    { name: "Pul Prahladpur, Delhi", lat: 28.4975, lng: 77.2945, depth: 28 },
    { name: "Hindmata, Mumbai", lat: 19.0062, lng: 72.8425, depth: 35 },
    { name: "Silk Board, Bengaluru", lat: 12.9177, lng: 77.6238, depth: 12 },
    { name: "Velachery, Chennai", lat: 12.9757, lng: 80.2205, depth: null },
  ];
  const reportedAt = new Date().toISOString();
  return locations.map((location, index) => {
    const id = `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
    return {
      id, lat: location.lat, lng: location.lng, reportedAt, reportCount: 1,
      observedDepthCm: location.depth, locationLabel: location.name,
      photoUrl: `/api/reports/${id}/photo`, photoName: "illustrative-waterlogging.jpg",
      photoMimeType: "image/jpeg", photoSizeBytes, photoSource: "upload", provenance: "sample",
      vehicle: { make: "", model: "", year: "", variant: "" },
      gps: { lat: location.lat, lng: location.lng, accuracyMeters: 0, capturedAt: reportedAt },
    };
  });
}
