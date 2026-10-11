import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import Database from "better-sqlite3";
import {
  saveAnalysis,
  readAnalysis,
  readPhotoAnalysis,
} from "./analysis-store";
import {
  withRisk,
  photoComparison,
  type AnalysisResult,
} from "./photo-analysis";
import { storeReport } from "./report-store";
import { GET as reportPage } from "../app/api/reports/route";
import { GET as reportDetail } from "../app/api/reports/[id]/route";
import { GET as reportBaseline } from "../app/api/reports/[id]/baseline/route";
import { GET as reportPhoto } from "../app/api/reports/[id]/photo/route";

test("persistent analysis binds exact photo and session; pending details/photos are private", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ff-evidence-test-"));
  const previous = process.env.REPORT_STORE_DIR;
  process.env.REPORT_STORE_DIR = dir;
  try {
    const owner = randomUUID();
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "#f0a000" },
    })
      .png()
      .toBuffer();
    const result: AnalysisResult = withRisk({
      id: randomUUID(),
      owner,
      photoHash: createHash("sha256").update(image).digest("hex"),
      createdAt: new Date().toISOString(),
      cv: null,
      scene: { roadType: "Unknown", traffic: [], hazards: [], explanation: "" },
      provider: "local-cv",
      baseline: "demo",
      depthMm: 150,
      depthRangeMm: [120, 190],
      depthSource: "calibrated-caliper",
      confidence: 60,
      confidenceMeaning: "experimental",
      riskScore: null,
      riskType: "unknown",
      publication: "pending",
      notes: [],
      answers: [],
    });
    result.comparison = photoComparison(null, "frozen-reference-hash");
    const baseline = await sharp(image).jpeg().toBuffer();
    saveAnalysis(result, image, baseline);
    assert.equal(readAnalysis(result.id, owner)?.depthMm, 150);
    assert.equal(readAnalysis(result.id, "wrong-owner"), null);
    const metadata = {
      gps: {
        lat: 28.6,
        lng: 77.2,
        accuracyMeters: 8,
        capturedAt: new Date().toISOString(),
      },
      reportLat: 28.6,
      reportLng: 77.2,
      vehicle: { make: "Test", model: "Test", year: "2025", variant: "" },
      locationLabel: "Evidence test",
      photoSource: "upload",
      analysisId: result.id,
      observedDepthCm: 999,
    };
    // Caller cannot use an invalid depth to bypass metadata validation.
    await assert.rejects(
      storeReport(metadata, image, "image/png", "test.png", owner),
    );
    const input = { ...metadata, observedDepthCm: null };
    await assert.rejects(
      storeReport(input, image, "image/png", "test.png", "wrong-owner"),
      /session/,
    );
    const other = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    await assert.rejects(
      storeReport(input, other, "image/png", "test.png", owner),
      /exact photo/,
    );
    const saved = await storeReport(
      input,
      image,
      "image/png",
      "test.png",
      owner,
    );
    assert.equal(saved.observedDepthCm, 15);
    assert.equal(
      saved.photoAnalysis?.comparison?.baselineHash,
      "frozen-reference-hash",
    );
    assert.equal(saved.baselineUrl, `/api/reports/${saved.id}/baseline`);
    saveAnalysis({
      ...result,
      depthMm: 300,
      answers: [{ question: "Water height?", answer: "knee" }],
    });
    assert.equal(readPhotoAnalysis(result.id, owner)?.depthMm, 150);
    assert.equal(readAnalysis(result.id, owner)?.depthMm, 300);
    assert.equal(saved.publicationStatus, "pending");
    assert.equal(
      (
        await (
          await reportPage(new Request("https://example.test/api/reports"))
        ).json()
      ).total,
      0,
    );
    const params = { params: Promise.resolve({ id: saved.id }) };
    assert.equal(
      (await reportDetail(new Request("https://example.test/a"), params))
        .status,
      404,
    );
    assert.equal(
      (await reportPhoto(new Request("https://example.test/a"), params)).status,
      404,
    );
    const own = new Request("https://example.test/a", {
      headers: { Cookie: `ff_evidence=${owner}` },
    });
    const detail = await reportDetail(own, params);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).report.evidenceOwner, undefined);
    assert.equal(
      (await reportBaseline(new Request("https://example.test/a"), params))
        .status,
      404,
    );
    const mutableAnalysisDb = new Database(path.join(dir, "analyses.sqlite"));
    mutableAnalysisDb
      .prepare("UPDATE analyses SET baseline=? WHERE id=?")
      .run(Buffer.from("changed analysis baseline"), result.id);
    mutableAnalysisDb.close();
    const dry = await reportBaseline(own, params);
    assert.equal(dry.status, 200);
    assert.equal(dry.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(Buffer.from(await dry.arrayBuffer()), baseline);
    const photo = await reportPhoto(own, params);
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get("cache-control"), "private, no-store");
  } finally {
    if (previous === undefined) delete process.env.REPORT_STORE_DIR;
    else process.env.REPORT_STORE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test("agreeing distinct real-reference evidence publishes; duplicate sessions/photos and demo evidence do not", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ff-corroboration-test-"));
  const previous = process.env.REPORT_STORE_DIR;
  process.env.REPORT_STORE_DIR = dir;
  try {
    const sameOwner = randomUUID();
    async function observation(
      owner: string,
      colour: string,
      baseline: "demo" | "registered",
      lat = 28.6,
    ) {
      const image = await sharp({
        create: { width: 10, height: 10, channels: 3, background: colour },
      })
        .png()
        .toBuffer();
      const result: AnalysisResult = withRisk({
        id: randomUUID(),
        owner,
        photoHash: createHash("sha256").update(image).digest("hex"),
        createdAt: new Date().toISOString(),
        cv: null,
        scene: {
          roadType: "Underpass",
          traffic: [],
          hazards: [],
          explanation: "",
        },
        provider: "local-cv",
        baseline,
        depthMm: 150,
        depthRangeMm: [120, 190],
        depthSource: "calibrated-caliper",
        confidence: 60,
        confidenceMeaning: "experimental",
        riskScore: null,
        riskType: "unknown",
        publication: "pending",
        notes: [],
        answers: [],
      });
      saveAnalysis(result, image);
      return storeReport(
        {
          gps: {
            lat,
            lng: 77.2,
            accuracyMeters: 8,
            capturedAt: new Date().toISOString(),
          },
          reportLat: lat,
          reportLng: 77.2,
          vehicle: { make: "Test", model: "Test", year: "2025", variant: "" },
          locationLabel: "Test",
          photoSource: "upload",
          analysisId: result.id,
        },
        image,
        "image/png",
        "test.png",
        owner,
      );
    }
    for (const colour of ["red", "blue", "green"])
      await observation(randomUUID(), colour, "demo", 28.61);
    assert.equal(
      (
        await (
          await reportPage(new Request("https://example.test/api/reports"))
        ).json()
      ).total,
      0,
    );
    for (const colour of ["red", "blue", "green"])
      await observation(sameOwner, colour, "registered");
    assert.equal(
      (
        await (
          await reportPage(new Request("https://example.test/api/reports"))
        ).json()
      ).total,
      0,
    );
    await observation(randomUUID(), "red", "registered");
    assert.equal(
      (
        await (
          await reportPage(new Request("https://example.test/api/reports"))
        ).json()
      ).total,
      0,
      "same photo is not independent evidence",
    );
    await observation(randomUUID(), "yellow", "registered");
    const last = await observation(randomUUID(), "purple", "registered");
    assert.equal(last.publicationStatus, "public");
    const page = await (
      await reportPage(new Request("https://example.test/api/reports"))
    ).json();
    assert.equal(page.total, 3);
    assert.ok(
      page.reports.every(
        (r: { analysis: { confidence: number } }) =>
          r.analysis.confidence >= 75,
      ),
    );
  } finally {
    if (previous === undefined) delete process.env.REPORT_STORE_DIR;
    else process.env.REPORT_STORE_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
