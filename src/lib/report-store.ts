import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { distanceMeters, isAcceptedPhotoType, MAX_PHOTO_BYTES, type SharedWaterlogReport, type VehicleDetails } from "./report";

export class ReportInputError extends Error {}
const MAX_REPORTS = 50000;
const storeRoot = () => process.env.REPORT_STORE_DIR ?? path.join(process.cwd(), ".data", "reports");
const globals = globalThis as typeof globalThis & { floodReportWriteQueue?: Promise<unknown> };

function numberIn(value: unknown, min: number, max: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new ReportInputError(`Invalid ${label}.`);
  return value;
}
function text(value: unknown, max: number, label: string, required = false): string {
  if (typeof value !== "string" || value.length > max || (required && !value.trim())) throw new ReportInputError(`Invalid ${label}.`);
  return value.trim();
}
export function validateReportMetadata(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object") throw new ReportInputError("Report metadata is required.");
  const data = value as Record<string, unknown>;
  if (!data.gps || typeof data.gps !== "object") throw new ReportInputError("A fresh GPS fix is required.");
  const fix = data.gps as Record<string, unknown>;
  const lat = numberIn(fix.lat, -90, 90, "GPS latitude");
  const lng = numberIn(fix.lng, -180, 180, "GPS longitude");
  const accuracyMeters = numberIn(fix.accuracyMeters, 0, 100, "GPS accuracy (must be within 100 m)");
  const capturedAt = text(fix.capturedAt, 40, "GPS timestamp", true);
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(captured) || captured > now + 30000 || now - captured > 10 * 60000) throw new ReportInputError("GPS fix expired. Take the photo again to get a fresh location.");
  const reportLat = numberIn(data.reportLat, -90, 90, "report latitude");
  const reportLng = numberIn(data.reportLng, -180, 180, "report longitude");
  if (distanceMeters({ lat, lng }, { lat: reportLat, lng: reportLng }) > 1) throw new ReportInputError("Report location must match the photo's GPS fix.");
  if (!data.vehicle || typeof data.vehicle !== "object") throw new ReportInputError("Vehicle details are required.");
  const rawVehicle = data.vehicle as Record<string, unknown>;
  const vehicle: VehicleDetails = { make: text(rawVehicle.make, 100, "vehicle make", true), model: text(rawVehicle.model, 100, "vehicle model", true), year: text(rawVehicle.year, 10, "vehicle year", true), variant: text(rawVehicle.variant, 150, "vehicle variant") };
  if (data.photoSource !== "camera") throw new ReportInputError("Use the camera reporting flow to attach a photo.");
  const observedDepthCm = data.observedDepthCm == null ? null : numberIn(data.observedDepthCm, 0, 300, "observed depth");
  return { lat, lng, gps: { lat, lng, accuracyMeters, capturedAt: new Date(captured).toISOString() }, vehicle, locationLabel: text(data.locationLabel, 250, "location label", true), photoSource: data.photoSource, observedDepthCm } as const;
}
export function validatePhoto(bytes: Uint8Array, mimeType: string): void {
  if (!isAcceptedPhotoType(mimeType) || !bytes.length || bytes.length > MAX_PHOTO_BYTES) throw new ReportInputError("Use a JPEG, PNG or WebP photo up to 10 MB.");
  const starts = (sequence: number[]) => sequence.every((v, i) => bytes[i] === v);
  const valid = mimeType === "image/jpeg" ? starts([255, 216, 255]) : mimeType === "image/png" ? starts([137, 80, 78, 71, 13, 10, 26, 10]) : starts([82, 73, 70, 70]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid) throw new ReportInputError("Photo contents do not match its image type.");
}
export async function readReports(): Promise<SharedWaterlogReport[]> {
  try { return JSON.parse(await readFile(path.join(storeRoot(), "reports.json"), "utf8")); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; }
}
export async function storeReport(metadata: unknown, bytes: Uint8Array, mimeType: string, photoName: string): Promise<SharedWaterlogReport> {
  const valid = validateReportMetadata(metadata);
  validatePhoto(bytes, mimeType);
  // Decode rather than trusting MIME/signature alone. Re-encoding removes
  // embedded GPS/EXIF metadata and prevents serving arbitrary uploaded bytes.
  let sanitized: Buffer;
  try {
    sanitized = await sharp(bytes, { limitInputPixels: 40000000, failOn: "error" })
      .rotate().resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85 }).toBuffer();
  } catch { throw new ReportInputError("Photo could not be decoded. Use a readable JPEG, PNG or WebP image."); }
  const name = text(photoName, 250, "photo name", true);
  const execute = async () => {
    const directory = storeRoot();
    await mkdir(path.join(directory, "photos"), { recursive: true });
    const reports = await readReports();
    if (reports.length >= MAX_REPORTS) throw new ReportInputError("Report storage is full. Please contact the server operator.");
    const id = randomUUID();
    const report: SharedWaterlogReport = { ...valid, id, reportCount: 1, reportedAt: new Date().toISOString(), photoName: name, photoUrl: `/api/reports/${id}/photo`, photoMimeType: "image/jpeg", photoSizeBytes: sanitized.length, provenance: "community-gps" };
    const photoPath = path.join(directory, "photos", id);
    const temporary = path.join(directory, `reports-${id}.tmp`);
    try {
      await writeFile(photoPath, sanitized, { flag: "wx", mode: 0o600 });
      await writeFile(temporary, JSON.stringify([...reports, report]), { flag: "wx", mode: 0o600 });
      await rename(temporary, path.join(directory, "reports.json"));
    } catch (error) {
      await Promise.allSettled([unlink(photoPath), unlink(temporary)]);
      throw error;
    }
    return report;
  };
  const result = (globals.floodReportWriteQueue ?? Promise.resolve()).then(execute);
  globals.floodReportWriteQueue = result.catch(() => undefined);
  return result;
}
export async function readReportPhoto(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const report = (await readReports()).find((item) => item.id === id);
  if (!report) return null;
  return { report, bytes: await readFile(path.join(storeRoot(), "photos", id)) };
}
