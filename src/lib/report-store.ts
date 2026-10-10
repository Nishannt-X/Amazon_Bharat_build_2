import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import { inIndiaMapArea } from "./map-region";
import path from "node:path";
import sharp from "sharp";
import { distanceMeters, isAcceptedPhotoType, MAX_PHOTO_BYTES, type SharedWaterlogReport, type VehicleDetails } from "./report";

export class ReportInputError extends Error {}
const MAX_REPORTS = 50000;
const storeRoot = () => process.env.REPORT_STORE_DIR?.trim() || path.join(process.cwd(), ".data", "reports");
const globals = globalThis as typeof globalThis & { waterlogDatabases?: Map<string, Database.Database> };

/** Database transactions keep the report and sanitized photo together. */
function database() {
  const directory = storeRoot();
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "waterlogs.sqlite");
  globals.waterlogDatabases ??= new Map();
  const cached = globals.waterlogDatabases.get(filename);
  if (cached) return cached;
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`CREATE TABLE IF NOT EXISTS reports (
    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    reported_at TEXT NOT NULL,
    is_sample INTEGER NOT NULL DEFAULT 0,
    metadata TEXT NOT NULL,
    photo BLOB NOT NULL
  );
  CREATE INDEX IF NOT EXISTS reports_location ON reports(lat, lng);
  CREATE INDEX IF NOT EXISTS reports_time ON reports(reported_at);
  CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY);`);
  // Preserve reports from the earlier file-backed prototype exactly once.
  const legacy = path.join(directory, "reports.json");
  if (existsSync(legacy) && !db.prepare("SELECT name FROM migrations WHERE name = ?").get("legacy-json")) {
    const reports: SharedWaterlogReport[] = JSON.parse(readFileSync(legacy, "utf8"));
    db.transaction(() => {
      for (const report of reports) {
        const photo = readFileSync(path.join(directory, "photos", report.id));
        insertRow(db, report, photo);
      }
      db.prepare("INSERT INTO migrations(name) VALUES (?)").run("legacy-json");
    })();
  }
  globals.waterlogDatabases.set(filename, db);
  return db;
}
function insertRow(db: Database.Database, report: SharedWaterlogReport, photo: Uint8Array) {
  db.prepare("INSERT OR IGNORE INTO reports(id,lat,lng,reported_at,is_sample,metadata,photo) VALUES (?,?,?,?,?,?,?)")
    .run(report.id, report.lat, report.lng, report.reportedAt, report.provenance === "sample" ? 1 : 0, JSON.stringify(report), photo);
}
export async function seedSampleReports(reports: SharedWaterlogReport[], photo: Uint8Array) {
  const db = database();
  db.transaction(() => { for (const report of reports) insertRow(db, report, photo); })();
  return reports.length;
}

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
  if (!inIndiaMapArea({ lat, lng })) throw new ReportInputError("Reporting is currently available within the India prototype area.");
  const accuracyMeters = numberIn(fix.accuracyMeters, 0, 100, "GPS accuracy (must be within 100 m)");
  const capturedAt = text(fix.capturedAt, 40, "GPS timestamp", true);
  const captured = Date.parse(capturedAt);
  if (!Number.isFinite(captured) || captured > now + 30000 || now - captured > 10 * 60000) throw new ReportInputError("GPS fix expired. Take the photo again to get a fresh location.");
  const reportLat = numberIn(data.reportLat, -90, 90, "report latitude");
  const reportLng = numberIn(data.reportLng, -180, 180, "report longitude");
  if (distanceMeters({ lat, lng }, { lat: reportLat, lng: reportLng }) > 1) throw new ReportInputError("Report location must match the photo's GPS fix.");
  if (!data.vehicle || typeof data.vehicle !== "object") throw new ReportInputError("Vehicle details are required.");
  const rawVehicle = data.vehicle as Record<string, unknown>;
  const vehicle: VehicleDetails = { make: text(rawVehicle.make, 100, "vehicle make"), model: text(rawVehicle.model, 100, "vehicle model"), year: text(rawVehicle.year, 10, "vehicle year"), variant: text(rawVehicle.variant, 150, "vehicle variant") };
  if (vehicle.year && (!/^\d{4}$/.test(vehicle.year) || Number(vehicle.year) < 1980 || Number(vehicle.year) > new Date(now).getFullYear() + 1)) throw new ReportInputError("Invalid vehicle year.");
  if (data.photoSource !== "camera" && data.photoSource !== "upload") throw new ReportInputError("Attach a camera photo or uploaded picture.");
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
  const rows = database().prepare("SELECT metadata FROM reports ORDER BY sequence").all() as { metadata: string }[];
  return rows.map((row) => JSON.parse(row.metadata));
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
  const db = database();
  const id = randomUUID();
  const report: SharedWaterlogReport = { ...valid, id, reportCount: 1, reportedAt: new Date().toISOString(), photoName: name, photoUrl: `/api/reports/${id}/photo`, photoMimeType: "image/jpeg", photoSizeBytes: sanitized.length, provenance: "community-gps" };
  db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) AS count FROM reports").get() as { count: number };
    if (count.count >= MAX_REPORTS) throw new ReportInputError("Report storage is full. Please contact the server operator.");
    insertRow(db, report, sanitized);
  })();
  return report;
}
export async function readReportPhoto(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = database().prepare("SELECT metadata, photo FROM reports WHERE id = ?").get(id) as { metadata: string; photo: Buffer } | undefined;
  return row ? { report: JSON.parse(row.metadata) as SharedWaterlogReport, bytes: row.photo } : null;
}
