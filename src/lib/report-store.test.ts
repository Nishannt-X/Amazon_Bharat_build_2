import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import Database from "better-sqlite3";
import { createSampleReports } from "./sample-reports";
import { readReports, readReportPhoto, seedSampleReports, storeReport, validatePhoto, validateReportMetadata } from "./report-store";

const metadata = () => ({ gps: { lat: 12, lng: 77, accuracyMeters: 8, capturedAt: new Date().toISOString() }, reportLat: 12, reportLng: 77, vehicle: { make: "Test", model: "Test", year: "2025", variant: "" }, locationLabel: "Test road", photoSource: "camera", observedDepthCm: null });
const png = Uint8Array.from([137,80,78,71,13,10,26,10]);

test("rejects displaced reports, stale GPS, invented depths, and gallery source", () => {
  assert.throws(() => validateReportMetadata({ ...metadata(), reportLat: 13 }), /must match/);
  assert.throws(() => validateReportMetadata({ ...metadata(), gps: { ...metadata().gps, capturedAt: "2000-01-01T00:00:00Z" } }), /expired/);
  assert.throws(() => validateReportMetadata({ ...metadata(), observedDepthCm: 301 }), /depth/);
  assert.throws(() => validateReportMetadata({ ...metadata(), photoSource: "upload" }), /camera/);
  assert.throws(() => validateReportMetadata({ ...metadata(), gps: { ...metadata().gps, accuracyMeters: 101 } }), /accuracy/);
  assert.equal(validateReportMetadata(metadata()).observedDepthCm, null);
});
test("rejects external or active image contents disguised as a photo", () => {
  assert.throws(() => validatePhoto(new TextEncoder().encode('<svg onload="alert(1)"/>'), "image/png"), /contents/);
  assert.throws(() => validatePhoto(png, "image/svg+xml"), /JPEG/);
});
test("concurrent reports survive atomic SQLite transactions and photos stay independently retrievable", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ff-store-test-"));
  const previous = process.env.REPORT_STORE_DIR;
  process.env.REPORT_STORE_DIR = directory;
  try {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#2080aa" } }).png().toBuffer();
    const reports = await Promise.all(Array.from({ length: 12 }, (_, i) => storeReport({ ...metadata(), locationLabel: `Road ${i}` }, image, "image/png", `photo-${i}.png`)));
    assert.equal(new Set(reports.map((r) => r.id)).size, 12);
    const saved = await readReports();
    assert.equal(saved.length, 12);
    assert.equal(saved[0].provenance, "community-gps");
    assert.equal(saved[0].observedDepthCm, null);
    const photo = await readReportPhoto(reports[0].id);
    assert.equal(photo?.report.photoMimeType, "image/jpeg");
    assert.equal((await sharp(photo!.bytes).metadata()).format, "jpeg");
    assert.equal((await sharp(photo!.bytes).metadata()).exif, undefined);
    assert.equal(await readReportPhoto("../../secret"), null);
    assert.equal(await readReportPhoto("00000000-0000-0000-0000-000000000000"), null);
    await assert.rejects(storeReport(metadata(), png, "image/png", "corrupt.png"), /decoded/);
    await assert.rejects(storeReport({ ...metadata(), reportLng: 78 }, png, "image/png", "bad.png"));
    assert.equal((await readReports()).length, 12);
  } finally {
    if (previous === undefined) delete process.env.REPORT_STORE_DIR; else process.env.REPORT_STORE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});

test("sample seeding is idempotent, photos live in SQLite, and optional vehicle context is supported", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ff-sqlite-seed-"));
  const previous = process.env.REPORT_STORE_DIR;
  process.env.REPORT_STORE_DIR = directory;
  try {
    const photo = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#aa8822" } }).jpeg().toBuffer();
    const samples = createSampleReports(photo.length);
    await seedSampleReports(samples, photo);
    await seedSampleReports(samples, photo);
    const saved = await storeReport({ ...metadata(), vehicle: { make: "", model: "", year: "", variant: "" } }, photo, "image/jpeg", "camera.jpg");
    const connection = new Database(path.join(directory, "waterlogs.sqlite"), { readonly: true });
    assert.equal((connection.prepare("SELECT COUNT(*) AS count FROM reports").get() as { count: number }).count, 7);
    assert.equal((connection.prepare("SELECT COUNT(*) AS count FROM reports WHERE is_sample = 1").get() as { count: number }).count, 6);
    connection.close();
    assert.equal((await readReports()).filter((r) => r.provenance === "sample").length, 6);
    assert.equal((await readReportPhoto(saved.id))?.report.vehicle.make, "");
    assert.deepEqual((await readReportPhoto(samples[0].id))?.bytes, photo);
  } finally {
    if (previous === undefined) delete process.env.REPORT_STORE_DIR; else process.env.REPORT_STORE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
test("migrates legacy JSON reports and photo files once without duplicating records", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ff-sqlite-migration-"));
  const previous = process.env.REPORT_STORE_DIR;
  process.env.REPORT_STORE_DIR = directory;
  try {
    const photo = Buffer.from("legacy-photo-fixture");
    const report = createSampleReports(photo.length)[0];
    await mkdir(path.join(directory, "photos"));
    await writeFile(path.join(directory, "photos", report.id), photo);
    await writeFile(path.join(directory, "reports.json"), JSON.stringify([report]));
    assert.equal((await readReports()).length, 1);
    assert.equal((await readReports()).length, 1);
    assert.deepEqual((await readReportPhoto(report.id))?.bytes, photo);
  } finally {
    if (previous === undefined) delete process.env.REPORT_STORE_DIR; else process.env.REPORT_STORE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
