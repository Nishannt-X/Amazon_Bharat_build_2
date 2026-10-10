import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { readReports, readReportPhoto, storeReport, validatePhoto, validateReportMetadata } from "./report-store";

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
test("concurrent reports survive serialized atomic writes and photos stay independently retrievable", async () => {
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
