import { readReportsFromCloud, saveReportToCloud, getReportPhotoFromCloud, getReportFromCloudById, readArchivedReportsFromCloud, isReportTtlActive } from "./aws/cloud-store";
import { isDynamoConfigured } from "./aws/dynamodb";
import {
  readAnalysis,
  readPhotoAnalysis,
  analysisBaseline,
} from "./analysis-store";

import { publicAnalysis, waterlogGuidance } from "./photo-analysis";
import { randomUUID, createHash } from "node:crypto";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import Database from "better-sqlite3";
import { inIndiaMapArea } from "./map-region";
import path from "node:path";
import sharp from "sharp";
import {
  distanceMeters,
  isAcceptedPhotoType,
  MAX_PHOTO_BYTES,
  type SharedWaterlogReport,
  type VehicleDetails,
} from "./report";

export class ReportInputError extends Error {}
const MAX_REPORTS = 50000;
const storeRoot = () =>
  process.env.REPORT_STORE_DIR?.trim() ||
  path.join(process.cwd(), ".data", "reports");
const globals = globalThis as typeof globalThis & {
  waterlogDatabases?: Map<string, Database.Database>;
};

/** Database transactions keep the report and sanitized photo together. */
function database() {
  const directory = storeRoot();
  mkdirSync(directory, { recursive: true });
  const filename = path.join(directory, "waterlogs.sqlite");
  globals.waterlogDatabases ??= new Map();
  const cached = globals.waterlogDatabases.get(filename);
  if (cached) {
    ensureBaselineColumn(cached);
    return cached;
  }
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
  ensureBaselineColumn(db);
  // Preserve reports from the earlier file-backed prototype exactly once.
  const legacy = path.join(directory, "reports.json");
  if (
    existsSync(legacy) &&
    !db.prepare("SELECT name FROM migrations WHERE name = ?").get("legacy-json")
  ) {
    const reports: SharedWaterlogReport[] = JSON.parse(
      readFileSync(legacy, "utf8"),
    );
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
function insertRow(
  db: Database.Database,
  report: SharedWaterlogReport,
  photo: Uint8Array,
  baseline: Uint8Array | null = null,
) {
  db.prepare(
    "INSERT OR IGNORE INTO reports(id,lat,lng,reported_at,is_sample,metadata,photo,baseline) VALUES (?,?,?,?,?,?,?,?)",
  ).run(
    report.id,
    report.lat,
    report.lng,
    report.reportedAt,
    report.provenance === "sample" ? 1 : 0,
    JSON.stringify(report),
    photo,
    baseline,
  );
}

export function claimGuestReports(guest: string, owner: string) {
  const db = database();
  db.transaction(() => {
    const rows = db.prepare("SELECT id,metadata FROM reports WHERE json_extract(metadata,'$.evidenceOwner')=?").all(guest) as {id:string;metadata:string}[];
    for (const row of rows) db.prepare("UPDATE reports SET metadata=? WHERE id=?").run(JSON.stringify({...JSON.parse(row.metadata),evidenceOwner:owner}),row.id);
  })();
}
export async function seedSampleReports(
  reports: SharedWaterlogReport[],
  photo: Uint8Array,
) {
  const db = database();
  db.transaction(() => {
    for (const report of reports) insertRow(db, report, photo);
  })();
  return reports.length;
}

function numberIn(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  )
    throw new ReportInputError(`Invalid ${label}.`);
  return value;
}
function text(
  value: unknown,
  max: number,
  label: string,
  required = false,
): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw new ReportInputError(`Invalid ${label}.`);
  return value.trim();
}
export function validateReportMetadata(value: unknown, now = Date.now()) {
  if (!value || typeof value !== "object")
    throw new ReportInputError("Report metadata is required.");
  const data = value as Record<string, unknown>;
  if (!data.gps || typeof data.gps !== "object")
    throw new ReportInputError("A fresh GPS fix is required.");
  const fix = data.gps as Record<string, unknown>;
  const lat = numberIn(fix.lat, -90, 90, "GPS latitude");
  const lng = numberIn(fix.lng, -180, 180, "GPS longitude");
  if (!inIndiaMapArea({ lat, lng }))
    throw new ReportInputError(
      "Reporting is currently available within the India prototype area.",
    );
  const accuracyMeters = numberIn(
    fix.accuracyMeters,
    0,
    100,
    "GPS accuracy (must be within 100 m)",
  );
  const capturedAt = text(fix.capturedAt, 40, "GPS timestamp", true);
  const captured = Date.parse(capturedAt);
  if (
    !Number.isFinite(captured) ||
    captured > now + 30000 ||
    now - captured > 10 * 60000
  )
    throw new ReportInputError(
      "GPS fix expired. Take the photo again to get a fresh location.",
    );
  const reportLat = numberIn(data.reportLat, -90, 90, "report latitude");
  const reportLng = numberIn(data.reportLng, -180, 180, "report longitude");
  if (distanceMeters({ lat, lng }, { lat: reportLat, lng: reportLng }) > 1)
    throw new ReportInputError(
      "Report location must match the photo's GPS fix.",
    );
  if (!data.vehicle || typeof data.vehicle !== "object")
    throw new ReportInputError("Vehicle details are required.");
  const rawVehicle = data.vehicle as Record<string, unknown>;
  const vehicle: VehicleDetails = {
    make: text(rawVehicle.make, 100, "vehicle make"),
    model: text(rawVehicle.model, 100, "vehicle model"),
    year: text(rawVehicle.year, 10, "vehicle year"),
    variant: text(rawVehicle.variant, 150, "vehicle variant"),
  };
  if (
    vehicle.year &&
    (!/^\d{4}$/.test(vehicle.year) ||
      Number(vehicle.year) < 1980 ||
      Number(vehicle.year) > new Date(now).getFullYear() + 1)
  )
    throw new ReportInputError("Invalid vehicle year.");
  if (data.photoSource !== "camera" && data.photoSource !== "upload")
    throw new ReportInputError("Attach a camera photo or uploaded picture.");
  const observedDepthCm =
    data.observedDepthCm == null
      ? null
      : numberIn(data.observedDepthCm, 0, 300, "observed depth");
  return {
    lat,
    lng,
    gps: {
      lat,
      lng,
      accuracyMeters,
      capturedAt: new Date(captured).toISOString(),
    },
    vehicle,
    locationLabel: text(data.locationLabel, 250, "location label", true),
    photoSource: data.photoSource,
    observedDepthCm,
  } as const;
}
export function validatePhoto(bytes: Uint8Array, mimeType: string): void {
  if (
    !isAcceptedPhotoType(mimeType) ||
    !bytes.length ||
    bytes.length > MAX_PHOTO_BYTES
  )
    throw new ReportInputError("Use a JPEG, PNG or WebP photo up to 10 MB.");
  const starts = (sequence: number[]) =>
    sequence.every((v, i) => bytes[i] === v);
  const valid =
    mimeType === "image/jpeg"
      ? starts([255, 216, 255])
      : mimeType === "image/png"
        ? starts([137, 80, 78, 71, 13, 10, 26, 10])
        : starts([82, 73, 70, 70]) &&
          String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!valid)
    throw new ReportInputError("Photo contents do not match its image type.");
}
/** Promote only fresh, agreeing real-reference evidence from distinct browser
 * sessions and distinct photos. Demo assumptions never enter this cohort. */
function corroborate(db: Database.Database, anchor: SharedWaterlogReport) {
  const now = Date.now();
  const rows = db
    .prepare(
      "SELECT metadata FROM reports WHERE is_sample=0 AND reported_at>=? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?",
    )
    .all(
      new Date(now - 60 * 60000).toISOString(),
      anchor.lat - 0.001,
      anchor.lat + 0.001,
      anchor.lng - 0.001,
      anchor.lng + 0.001,
    ) as { metadata: string }[];
  const candidates = rows
    .map((row) => JSON.parse(row.metadata) as SharedWaterlogReport)
    .filter(
      (report) =>
        report.analysis?.baseline === "registered" &&
        report.analysis.depthSource === "calibrated-caliper" &&
        report.analysis.confidence >= 50 &&
        report.analysis.depthMm != null &&
        report.analysis.depthRangeMm != null &&
        report.gps.accuracyMeters <= 20 &&
        distanceMeters(anchor, report) <= 25,
    );
  const owners = new Set<string>();
  const hashes = new Set<string>();
  const cohort: SharedWaterlogReport[] = [];
  for (const candidate of candidates) {
    const source =
      candidate.evidenceOwner && candidate.analysis
        ? readAnalysis(candidate.analysis.id, candidate.evidenceOwner)
        : null;
    if (!source || owners.has(source.owner) || hashes.has(source.photoHash))
      continue;
    owners.add(source.owner);
    hashes.add(source.photoHash);
    cohort.push(candidate);
  }
  if (cohort.length < 3) return;
  const centres = cohort.map((report) => report.analysis!.depthMm!);
  const low = Math.max(
    ...cohort.map((report) => report.analysis!.depthRangeMm![0]),
  );
  const high = Math.min(
    ...cohort.map((report) => report.analysis!.depthRangeMm![1]),
  );
  if (
    low > high ||
    Math.max(...centres) - Math.min(...centres) >
      Math.max(20, Math.min(...centres) * 0.3)
  )
    return;
  const update = db.prepare("UPDATE reports SET metadata=? WHERE id=?");
  for (const report of cohort) {
    report.publicationStatus = "public";
    report.analysis = {
      ...report.analysis!,
      confidence: Math.max(75, report.analysis!.confidence),
      publication: "eligible",
      notes: [
        ...report.analysis!.notes,
        `Corroborated by ${cohort.length} distinct browser sessions/photos within 25 m and one hour. This is evidence agreement, not verified identities or model accuracy.`,
      ],
    };
    report.riskGuidance = waterlogGuidance(report.analysis);
    update.run(JSON.stringify(report), report.id);
  }
}
export async function readReports(): Promise<SharedWaterlogReport[]> {
  if (isDynamoConfigured()) {
    try {
      const cloudReports = await readReportsFromCloud();
      if (cloudReports !== null) return cloudReports;
    } catch {}
  }
  const rows = database()
    .prepare("SELECT metadata FROM reports ORDER BY sequence")
    .all() as { metadata: string }[];
  const localReports = rows.map((row) => JSON.parse(row.metadata) as SharedWaterlogReport);
  return localReports;
}


export interface HotspotObservation extends SharedWaterlogReport {
  isActive: boolean;
}

export interface HotspotIncident {
  primaryReport: SharedWaterlogReport;
  reports: HotspotObservation[];
  reportCount: number;
  activeReportsCount: number;
  pastReportsCount: number;
  peakDepthCm: number | null;
}

/**
 * Loads the consolidated hotspot incident associated with a report ID or pinger.
 * Aggregates all active and past/archived reports within the 40m proximity cluster.
 */
export async function readHotspotIncidentById(id: string): Promise<HotspotIncident | null> {
  const report = await readPublicReportById(id);
  if (!report) return null;

  let activeList: SharedWaterlogReport[] = [];
  let archivedList: SharedWaterlogReport[] = [];

  if (isDynamoConfigured()) {
    try {
      const [cloudActive, cloudArchived] = await Promise.all([
        readReportsFromCloud(),
        readArchivedReportsFromCloud(),
      ]);
      activeList = cloudActive ?? [];
      archivedList = cloudArchived ?? [];
    } catch {}
  } else {
    activeList = await readReports();
  }

  const nowEpoch = Math.floor(Date.now() / 1000);
  const clusterRadius = Number(process.env.CLUSTER_RADIUS_METERS) || 40;
  const pool = [report, ...activeList, ...archivedList];
  const spotReportsMap = new Map<string, HotspotObservation>();

  for (const candidate of pool) {
    if (spotReportsMap.has(candidate.id)) continue;
    if (distanceMeters(report, candidate) <= clusterRadius) {
      const isActive = isReportTtlActive(candidate, nowEpoch);
      spotReportsMap.set(candidate.id, {
        ...candidate,
        isActive,
        publicationStatus: "public",
      });
    }
  }

  const spotReports = Array.from(spotReportsMap.values()).sort(
    (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime()
  );

  const activeCount = spotReports.filter((r) => r.isActive).length;
  const pastCount = spotReports.filter((r) => !r.isActive).length;
  const depths = spotReports
    .map((r) => r.observedDepthCm)
    .filter((d): d is number => typeof d === "number" && d > 0);
  const peakDepth = depths.length > 0 ? Math.max(...depths) : report.observedDepthCm;

  return {
    primaryReport: spotReports[0] || report,
    reports: spotReports,
    reportCount: spotReports.length,
    activeReportsCount: activeCount,
    pastReportsCount: pastCount,
    peakDepthCm: peakDepth,
  };
}

export async function readPublicReportById(id: string): Promise<SharedWaterlogReport | null> {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  if (isDynamoConfigured()) {
    try {
      const cloudReport = await getReportFromCloudById(id);
      if (cloudReport) {
        const { evidenceOwner: _owner, ...publicReport } = cloudReport;
        void _owner;
        return {
          ...publicReport,
          publicationStatus: "public",
        } as SharedWaterlogReport;
      }
    } catch {}
  }
  const row = database().prepare("SELECT metadata FROM reports WHERE id = ?").get(id) as { metadata: string } | undefined;
  if (!row) return null;
  const report = JSON.parse(row.metadata) as SharedWaterlogReport;
  const { evidenceOwner: _owner, ...publicReport } = report;
  void _owner;
  return { ...publicReport, publicationStatus: "public" };
}
export async function storeReport(
  metadata: unknown,
  bytes: Uint8Array,
  mimeType: string,
  photoName: string,
  owner?: string,
): Promise<SharedWaterlogReport> {
  const valid = validateReportMetadata(metadata);
  const analysisId = (metadata as Record<string, unknown>).analysisId;
  const evidence =
    typeof analysisId === "string" && owner
      ? readAnalysis(analysisId, owner)
      : null;
  if (
    analysisId &&
    (!evidence ||
      evidence.photoHash !== createHash("sha256").update(bytes).digest("hex"))
  )
    throw new ReportInputError(
      "Analysis must belong to this session and this exact photo.",
    );
  validatePhoto(bytes, mimeType);
  // Decode rather than trusting MIME/signature alone. Re-encoding removes
  // embedded GPS/EXIF metadata and prevents serving arbitrary uploaded bytes.
  let sanitized: Buffer;
  try {
    sanitized = await sharp(bytes, {
      limitInputPixels: 40000000,
      failOn: "error",
    })
      .rotate()
      .resize({
        width: 2048,
        height: 2048,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch {
    throw new ReportInputError(
      "Photo could not be decoded. Use a readable JPEG, PNG or WebP image.",
    );
  }
  const name = text(photoName, 250, "photo name", true);
  const db = database();
  const id = randomUUID();
  const report: SharedWaterlogReport = {
    ...valid,
    id,
    reportCount: 1,
    reportedAt: new Date().toISOString(),
    photoName: name,
    photoUrl: `/api/reports/${id}/photo`,
    photoMimeType: "image/jpeg",
    photoSizeBytes: sanitized.length,
    provenance: "community-gps",
    observedDepthCm:
      evidence?.depthMm == null ? valid.observedDepthCm : evidence.depthMm / 10,
    publicationStatus:
      evidence?.publication === "eligible" ? "public" : "pending",
    analysis: evidence ? publicAnalysis(evidence) : undefined,
    photoAnalysis:
      evidence && owner
        ? (() => {
            const raw = readPhotoAnalysis(evidence.id, owner);
            return raw ? publicAnalysis(raw) : undefined;
          })()
        : undefined,
    riskGuidance: waterlogGuidance(evidence),
    baselineUrl:
      evidence && owner && analysisBaseline(evidence.id, owner)
        ? `/api/reports/${id}/baseline`
        : undefined,
    evidenceOwner: owner,
  };
  db.transaction(() => {
    const count = db.prepare("SELECT COUNT(*) AS count FROM reports").get() as {
      count: number;
    };
    if (count.count >= MAX_REPORTS)
      throw new ReportInputError(
        "Report storage is full. Please contact the server operator.",
      );
    insertRow(
      db,
      report,
      sanitized,
      evidence && owner ? analysisBaseline(evidence.id, owner) : null,
    );
    if (report.analysis?.baseline === "registered") corroborate(db, report);
  })();
  const saved = db
    .prepare("SELECT metadata FROM reports WHERE id=?")
    .get(report.id) as { metadata: string };
  if (isDynamoConfigured()) {
    void saveReportToCloud(report, sanitized, evidence && owner ? analysisBaseline(evidence.id, owner) : null);
  }
  return JSON.parse(saved.metadata) as SharedWaterlogReport;
}
export async function readReportPhoto(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  if (isDynamoConfigured()) {
    try {
      const cloudPhoto = await getReportPhotoFromCloud(id);
      if (cloudPhoto) {
        const publicReport = await readPublicReportById(id);
        if (publicReport) {
          return {
            report: publicReport,
            bytes: Buffer.from(cloudPhoto),
          };
        }
      }
    } catch {}
  }
  const row = database()
    .prepare("SELECT metadata, photo FROM reports WHERE id = ?")
    .get(id) as { metadata: string; photo: Buffer } | undefined;
  return row
    ? {
        report: JSON.parse(row.metadata) as SharedWaterlogReport,
        bytes: row.photo,
      }
    : null;
}

const migratedBaselines = new WeakSet<Database.Database>();
function ensureBaselineColumn(db: Database.Database) {
  if (migratedBaselines.has(db)) return;
  if (
    !(
      db.prepare("PRAGMA table_info(reports)").all() as { name: string }[]
    ).some((c) => c.name === "baseline")
  )
    db.exec("ALTER TABLE reports ADD COLUMN baseline BLOB");
  migratedBaselines.add(db);
}
/** The incident owns a frozen dry comparison image, independent of later analysis edits. */
export async function readReportBaseline(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  const row = database()
    .prepare("SELECT metadata,baseline FROM reports WHERE id=?")
    .get(id) as { metadata: string; baseline: Buffer | null } | undefined;
  if (!row) return null;
  const report: SharedWaterlogReport = JSON.parse(row.metadata);
  const bytes =
    row.baseline ??
    (report.analysis && report.evidenceOwner
      ? analysisBaseline(report.analysis.id, report.evidenceOwner)
      : null);
  return bytes ? { report, bytes } : null;
}
