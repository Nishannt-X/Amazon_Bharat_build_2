import { judgeRequest } from "./judge-access-fixture";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { readReports, seedSampleReports } from "./report-store";
import { createSampleReports } from "./sample-reports";
import { GET, POST } from "../app/api/reports/route";

const metadata = () => ({ gps: { lat: 12, lng: 77, accuracyMeters: 8, capturedAt: new Date().toISOString() }, reportLat: 12, reportLng: 77, vehicle: { make: "Test", model: "Test", year: "2025", variant: "" }, locationLabel: "API test road", photoSource: "upload" });
test("API persists actual uploads, paginates every retained report, validates bbox and rejects unsafe requests", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ff-api-test-"));
  const previous = process.env.REPORT_STORE_DIR;
  process.env.REPORT_STORE_DIR = directory;
  try {
    const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#2080aa" } }).png().toBuffer();
    const upload = () => {
      const form = new FormData();
      form.set("photo", new File([image], "camera.png", { type: "image/png" }));
      form.set("metadata", JSON.stringify(metadata()));
      return form;
    };
    for (let i = 0; i < 3; i++) {
      const response = await POST(judgeRequest("https://example.test/api/reports", { method: "POST", body: upload(), headers: { Origin: "https://example.test" } }));
      assert.equal(response.status, 201);
      assert.equal((await response.json()).report.observedDepthCm, null);
    }
    assert.equal((await readReports()).length, 3);
    assert.equal((await (await GET(judgeRequest("https://example.test/api/reports"))).json()).reports.length, 0, "Low-confidence uploads are not public");
    await seedSampleReports(createSampleReports(image.length), image);
    const page1 = await (await GET(judgeRequest("https://example.test/api/reports?limit=2"))).json();
    assert.equal(page1.reports.length, 2);
    assert.equal(page1.total, 6);
    assert.equal(page1.scope, "single-server");
    const page2 = await (await GET(judgeRequest(`https://example.test/api/reports?limit=2&cursor=${page1.nextCursor}`))).json();
    assert.equal(page2.reports.length, 2);
    assert.ok(page2.nextCursor);
    assert.equal(new Set([...page1.reports, ...page2.reports].map((r) => r.id)).size, 4);
    assert.equal((await (await GET(judgeRequest("https://example.test/api/reports?bbox=0,0,1,1"))).json()).reports.length, 0);
    assert.equal((await GET(judgeRequest("https://example.test/api/reports?bbox=77,13,77,12"))).status, 400);
    assert.equal((await GET(judgeRequest("https://example.test/api/reports?cursor=missing"))).status, 400);
    assert.equal((await GET(judgeRequest("https://example.test/api/reports?limit=99999"))).status, 400);
    assert.equal((await POST(judgeRequest("https://example.test/api/reports", { method: "POST", body: upload(), headers: { Origin: "https://evil.test" } }))).status, 403);
    assert.equal((await POST(judgeRequest("https://example.test/api/reports", { method: "POST", body: "", headers: { "Content-Type": "multipart/form-data", "Content-Length": "99999999" } }))).status, 413);
    assert.equal((await POST(judgeRequest("https://example.test/api/reports", { method: "POST", body: JSON.stringify({ photoUrl: "https://evil.test/a.svg" }), headers: { "Content-Type": "application/json" } }))).status, 400);
  } finally {
    if (previous === undefined) delete process.env.REPORT_STORE_DIR; else process.env.REPORT_STORE_DIR = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
