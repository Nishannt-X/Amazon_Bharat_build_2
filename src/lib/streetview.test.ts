/**
 * Offline Street View search tests. A simulated panorama answers metadata and
 * image requests: directions facing the Connaught Place facade (heading 55°-145°)
 * return the matching crop of the stored dry screenshot for that heading/pitch/FOV;
 * every other direction returns unrelated imagery. Ranking uses the real Python CV.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cachedViewFile, findPanorama, locationRoadView, searchStreetView, type RankedView } from "./streetview";

const KEY = "TEST_KEY_must_never_leak_123";
const PYTHON = process.env.CV_PYTHON || "python3";
const PANO = "TESTPANO_connaught_place_01";
const LOCATION = { lat: 28.63470286, lng: 77.22210794 };
const GENERATE = `
import sys, cv2, numpy as np
h, p, f = float(sys.argv[1]), float(sys.argv[2]), float(sys.argv[3])
gap = abs((h - 100 + 180) % 360 - 180)
if gap <= 45:
    src = cv2.imread("public/demo/dry-highway-delhi.png")
    H, W = src.shape[:2]
    px = W / 90.0                       # the screenshot spans headings 55..145 at fov 90
    size = int(round(f * px))
    ix0 = int(round((h - f / 2 - 55) * px))
    iy0 = int(round((H - size) / 2 - p * px))   # square view, pitch shifts vertically
    canvas = np.full((size, size, 3), 128, np.uint8)
    a, b = max(0, ix0), min(W, ix0 + size)
    c, d = max(0, iy0), min(H, iy0 + size)
    if b > a and d > c:
        canvas[c - iy0:d - iy0, a - ix0:b - ix0] = src[c:d, a:b]
    view = canvas
else:
    pool = ["public/demo/dry-underpass.png", "public/map-bg.jpg", "public/landing/rain-road.jpg",
            "public/manipal-actual.jpg", "public/landing/waterlogged-road.jpg", "public/flood-demo.jpg"]
    view = cv2.imread(pool[int(h // 45) % len(pool)])
view = cv2.resize(view, (640, 640))
sys.stdout.buffer.write(cv2.imencode(".jpg", view, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tobytes())
`;

function simulatedPanorama(metadataStatus = "OK") {
  const calls = { metadata: 0, images: 0, urls: [] as string[] };
  const fetcher = (async (input: string | URL) => {
    const url = new URL(String(input));
    calls.urls.push(url.toString());
    assert.equal(url.searchParams.get("key"), KEY);
    if (url.pathname.endsWith("/metadata")) {
      calls.metadata++;
      return Response.json(metadataStatus === "OK"
        ? { status: "OK", pano_id: PANO, location: { lat: 28.634702, lng: 77.222108 }, date: "2025-11", copyright: "© Google" }
        : { status: metadataStatus, error_message: `bad key ${KEY}` });
    }
    calls.images++;
    assert.equal(url.searchParams.get("pano"), PANO);
    const image = execFileSync(PYTHON, ["-c", GENERATE, url.searchParams.get("heading")!,
      url.searchParams.get("pitch")!, url.searchParams.get("fov")!], { maxBuffer: 8 * 1024 * 1024 });
    return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/jpeg" } });
  }) as typeof fetch;
  return { fetcher, calls };
}
const photo = (file: string) => readFileSync(path.join("public", file));

test("finds the facade direction for the Connaught Place waterlog photo, then serves it from cache", async () => {
  const cacheDir = mkdtempSync(path.join(tmpdir(), "ff-sv-cache-"));
  const { fetcher, calls } = simulatedPanorama();
  const search = await searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, { key: KEY, fetcher, python: PYTHON, cacheDir });
  console.log("best view:", JSON.stringify({ status: search.status, heading: search.best?.heading, pitch: search.best?.pitch,
    fov: search.best?.fov, similarity: search.best?.similarity, inliers: search.best?.inliers, requests: search.imageRequests }));
  console.log("ranking:", search.candidates.slice(0, 6).map((c) => `h${c.heading}/p${c.pitch}/f${c.fov}=${c.similarity}${c.sceneMatched ? "✓" : ""}`).join("  "));
  assert.equal(search.status, "matched");
  assert.ok(search.best && search.best.sceneMatched);
  assert.ok(Math.abs(search.best.heading - 100) <= 45, "best view must face the facade");
  const coarseBest = Math.max(...search.candidates.filter((c) => c.round === 1).map((c) => c.similarity));
  assert.ok(search.best.similarity >= coarseBest, "refinement never makes the choice worse");
  assert.ok(search.imageRequests > 8 && search.imageRequests <= 20, `bounded requests (${search.imageRequests})`);
  assert.equal(calls.images, search.imageRequests);
  assert.ok(!JSON.stringify(search).includes(KEY), "key must not appear in results");
  assert.equal(cachedViewFile(search.best.id, cacheDir), search.best.file);

  const again = simulatedPanorama();
  const repeat = await searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, { key: KEY, fetcher: again.fetcher, python: PYTHON, cacheDir });
  assert.equal(again.calls.images, 0, "a repeated search must not re-request cached views");
  assert.equal(repeat.best?.id, search.best.id);
});

test("an unrelated photo shows the most similar road-visible location view, never claiming a match", async () => {
  const cacheDir = mkdtempSync(path.join(tmpdir(), "ff-sv-cache-"));
  const { fetcher } = simulatedPanorama();
  const search = await searchStreetView(photo("manipal-actual.jpg"), LOCATION, { key: KEY, fetcher, python: PYTHON, cacheDir });
  assert.notEqual(search.status, "matched");
  assert.equal(search.status, "road-fallback");
  assert.ok(search.best, "a fallback view is still returned so Street View fetching is visible");
  assert.equal(search.best.id, locationRoadView(search.candidates)?.id);
});

test("road visibility filters out facade views before fallback similarity ranking", () => {
  const views = [
    {id: "facade", roadScore: 0, similarity: 100},
    {id: "most-road", roadScore: 0.6, similarity: 2},
    {id: "similar-road", roadScore: 0.2, similarity: 20},
  ] as RankedView[];
  assert.equal(locationRoadView(views)?.id, "similar-road");
  assert.equal(locationRoadView(views.map(view => ({...view, roadScore: view.roadScore / 100})))?.id, "most-road");
});

test("location imagery is retained when the local matcher is unavailable", async () => {
  const {fetcher} = simulatedPanorama();
  const search = await searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, {key: KEY, fetcher,
    python: "/missing/cv-python", maxImageRequests: 1, cacheDir: mkdtempSync(path.join(tmpdir(), "ff-sv-cache-"))});
  assert.equal(search.status, "road-fallback");
  assert.ok(search.best);
  assert.equal(search.best.sceneMatched, false);
  assert.ok(search.notes.some(note => note.includes("matching is unavailable")));
});

test("one failed image does not discard location imagery and failed attempts respect the budget", async () => {
  const simulated = simulatedPanorama();
  let imageCalls = 0;
  const fetcher = (async (input: string | URL) => {
    if (!new URL(String(input)).pathname.endsWith("/metadata") && ++imageCalls === 1)
      return new Response("temporarily unavailable", {status: 503});
    return simulated.fetcher(input);
  }) as typeof fetch;
  const search = await searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, {key: KEY, fetcher,
    python: "/missing/cv-python", maxImageRequests: 2, cacheDir: mkdtempSync(path.join(tmpdir(), "ff-sv-cache-"))});
  assert.equal(imageCalls, 2);
  assert.equal(search.imageRequests, 2);
  assert.equal(search.candidates.length, 1);
  assert.equal(search.status, "road-fallback");
  assert.ok(search.best);
});

test("no panorama means no image requests; API errors never echo the key", async () => {
  const empty = simulatedPanorama("ZERO_RESULTS");
  const search = await searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, { key: KEY, fetcher: empty.fetcher, python: PYTHON,
    cacheDir: mkdtempSync(path.join(tmpdir(), "ff-sv-cache-")) });
  assert.equal(search.status, "no-panorama");
  assert.equal(empty.calls.images, 0);
  assert.equal(empty.calls.metadata, 2, "retries once with a wider radius");
  const denied = simulatedPanorama("REQUEST_DENIED");
  await assert.rejects(searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, { key: KEY, fetcher: denied.fetcher, python: PYTHON }),
    (error: Error) => !error.message.includes(KEY) && /REQUEST_DENIED/.test(error.message));
  await assert.rejects(searchStreetView(photo("demo/wet-cp.jpg"), LOCATION, { key: "", fetcher: denied.fetcher }), /not configured/);
});

test("cached view ids cannot escape the cache directory", () => {
  for (const id of ["../../etc/passwd", "..%2F..%2Fx_h1_p0_f90", ".........._h1_p0_f90", "short_h1_p0_f90", `${PANO}_h400_p0_f90`, `${PANO}_h10_p0_f9`])
    assert.equal(cachedViewFile(id, "/cache"), null, id);
  assert.equal(cachedViewFile(`${PANO}_h100_p-8_f75`, "/cache"), path.join("/cache", PANO, `${PANO}_h100_p-8_f75.jpg`));
});

test("accepts live Google panorama IDs containing dots through metadata and cached image lookup", async () => {
  const panoId = "CAoSFkNJSE0wb2dLRUlDQWdJQ3FtS2V4UFE.";
  const fetcher = (async () => Response.json({status: "OK", pano_id: panoId,
    location: {lat: 13.35724771403546, lng: 74.7836383128858}})) as typeof fetch;
  const panorama = await findPanorama(LOCATION, 50, KEY, fetcher);
  assert.equal(panorama?.panoId, panoId);
  assert.equal(panorama?.date, null, "capture date is optional");
  const id = `${panoId}_h90_p0_f90`;
  assert.equal(cachedViewFile(id, "/cache"), path.join("/cache", panoId, `${id}.jpg`));
});

test("rejects unsafe IDs and incomplete coordinates with specific, key-free diagnostics", async () => {
  for (const [metadata, expected] of [
    [{location: LOCATION}, /missing a panorama ID/],
    [{pano_id: "../../bad-panorama", location: LOCATION}, /unsupported panorama ID format/],
    [{pano_id: PANO, location: {lat: null, lng: 77}}, /missing valid panorama coordinates/],
    [{pano_id: PANO, location: {lat: 91, lng: 77}}, /missing valid panorama coordinates/],
    [{pano_id: PANO}, /missing valid panorama coordinates/],
  ] as const) {
    const fetcher = (async () => Response.json({status: "OK", ...metadata})) as typeof fetch;
    await assert.rejects(findPanorama(LOCATION, 50, KEY, fetcher), expected);
  }
});
