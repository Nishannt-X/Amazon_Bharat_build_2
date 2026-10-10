/** Report models shared by the reporting flow, public map and API. */

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
  /** Photo-bound GPS latitude; never a manually selected destination. */
  reportLat: number;
  reportLng: number;
  /** Actual device position. Null until the user grants permission. Never fabricated. */
  gps: GpsFix | null;
  vehicle: VehicleDetails;
}

/** Minimal map/navigation evidence boundary. Sample reports are explicitly labelled and excluded from live routing. */
export interface FloodReport {
  id: string;
  lat: number;
  lng: number;
  /** ISO timestamp of the report. Display-only. */
  reportedAt: string;
  /** Number of overlapping reports at this hotspot. Drives heat density. */
  reportCount: number;
  /** Explicit user observation, unverified; absent means unknown depth. */
  observedDepthCm?: number | null;
}

/** A report saved in this tab only. Its photo URL has its own lifetime,
 * independent of the editable draft. Never sent to a server or persisted. */
export interface LocalFloodReport extends FloodReport {
  locationLabel: string;
  photoUrl: string;
  photoName: string;
  vehicle: VehicleDetails;
}

/** Place search selects map and navigation destinations, never report GPS. */

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

/** Group only local evidence within 25m of a stable anchor. All members are
 * retained; anchor matching avoids chaining distant spots through neighbors. */
export const LOCAL_GROUP_RADIUS_METERS = 25;

export interface LocalReportGroup {
  id: string;
  anchor: LocalFloodReport;
  reports: LocalFloodReport[];
}

export function distanceMeters(a: ReportPin, b: ReportPin): number {
  const rad = Math.PI / 180;
  const lat = (b.lat - a.lat) * rad;
  const lng = (b.lng - a.lng) * rad;
  const h = Math.sin(lat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(lng / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

export function groupLocalReports(reports: readonly LocalFloodReport[]): LocalReportGroup[] {
  const groups: LocalReportGroup[] = [];
  // Oldest evidence anchors the group even as new reports are appended.
  for (const report of [...reports].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt) || a.id.localeCompare(b.id))) {
    const group = groups.find((candidate) => distanceMeters(candidate.anchor, report) <= LOCAL_GROUP_RADIUS_METERS);
    if (group) group.reports.unshift(report);
    else groups.push({ id: report.id, anchor: report, reports: [report] });
  }
  return groups.sort((a, b) => b.reports[0].reportedAt.localeCompare(a.reports[0].reportedAt));
}

/** Age describes evidence recency, never current flood conditions. */
export function reportAgeLabel(reportedAt: string, now: number): string {
  const time = Date.parse(reportedAt);
  if (!Number.isFinite(time)) return "Time unavailable";
  if (time > now) return "Time is ahead of this device";
  const minutes = Math.floor((now - time) / 60000);
  if (minutes < 1) return "Saved just now";
  if (minutes < 60) return `Saved ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Saved ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `Saved ${days} day${days === 1 ? "" : "s"} ago`;
}

/** Published community evidence. GPS is device-provided, not independently verified. */
export interface SharedWaterlogReport extends LocalFloodReport {
  gps: GpsFix & { capturedAt: string };
  photoSource: "camera" | "upload";
  photoMimeType: string;
  photoSizeBytes: number;
  provenance: "community-gps" | "sample";
  observedDepthCm: number | null;
}
export type SharedFloodReport = SharedWaterlogReport;
