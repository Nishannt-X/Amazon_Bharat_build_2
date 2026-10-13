/**
 * Google Street View Static API reference search (server-only).
 *
 * Given where a photo was taken, find the nearest outdoor panorama, request a
 * bounded set of viewing directions from that one camera position, and rank
 * each view against the photo with the same registration the CV pipeline uses.
 * A coarse 8-heading sweep is refined twice around the best direction.
 *
 * The API key is read from GOOGLE_STREETVIEW_API_KEY and never returned, logged
 * or included in error messages. Views are cached on disk under .data/ (git-ignored)
 * so repeated local runs do not repeat paid requests. Check Google Maps Platform
 * terms before caching or deriving content from Street View imagery in production.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { StreetViewProvenance } from "./photo-analysis";

const exec = promisify(execFile);
const API = "https://maps.googleapis.com/maps/api/streetview";
const IMAGE_SIZE = "640x640";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
// Google also returns opaque panorama IDs ending in '.' (observed in live
// outdoor metadata). Keep one safe filename segment, rather than assuming base64url.
const PANO_ID = /^[A-Za-z0-9_-][A-Za-z0-9_.-]{9,119}$/;
export const VIEW_ID = /^([A-Za-z0-9_-][A-Za-z0-9_.-]{9,119})_h(\d{1,3})_p(-?\d{1,2})_f(\d{2,3})$/;

export interface StreetViewPanorama {
  panoId: string;
  lat: number;
  lng: number;
  date: string | null;
  copyright: string | null;
}
export interface ViewParams { heading: number; pitch: number; fov: number }
export interface RankedView extends ViewParams {
  id: string;
  file: string;
  round: number;
  matches: number;
  inliers: number;
  inlierRatio: number;
  supportArea: number;
  reprojectionErrorPx: number | null;
  sceneMatched: boolean;
  registered: boolean;
  similarity: number;
  /** 0..1 heuristic: share of the view that is open road. Only used for the fallback. */
  roadScore: number;
}
/** road-fallback: scene match is unverified; show a road-visible location view without alignment. */
export type StreetViewStatus = "matched" | "road-fallback" | "ambiguous" | "no-match" | "no-panorama";
export interface StreetViewSearch {
  status: StreetViewStatus;
  panorama: StreetViewPanorama | null;
  best: RankedView | null;
  candidates: RankedView[];
  imageRequests: number;
  cachedViews: number;
  durationMs: number;
  notes: string[];
}
export interface SearchOptions {
  key?: string;
  fetcher?: typeof fetch;
  python?: string;
  cacheDir?: string;
  /** Hard cap on image requests per search (cached views are free). */
  maxImageRequests?: number;
}

export const streetViewKey = () => process.env.GOOGLE_STREETVIEW_API_KEY?.trim() ?? "";
/** Enabled only where a key exists; STREETVIEW_REFERENCES=false switches it off. */
export const streetViewEnabled = () =>
  streetViewKey() !== "" && process.env.STREETVIEW_REFERENCES !== "false";
export const streetViewCacheDir = () =>
  process.env.STREETVIEW_CACHE_DIR?.trim() || path.join(process.cwd(), ".data", "streetview");

export function normalizeView(view: ViewParams): ViewParams {
  return {
    heading: ((Math.round(view.heading) % 360) + 360) % 360,
    pitch: Math.max(-45, Math.min(45, Math.round(view.pitch))),
    fov: Math.max(20, Math.min(120, Math.round(view.fov))),
  };
}
export const viewId = (panoId: string, v: ViewParams) =>
  `${panoId}_h${v.heading}_p${v.pitch}_f${v.fov}`;
export const viewFile = (cacheDir: string, panoId: string, v: ViewParams) =>
  path.join(cacheDir, panoId, `${viewId(panoId, v)}.jpg`);
/** Resolve a view id from a URL to its cached file, rejecting anything else. */
export function cachedViewFile(id: string, cacheDir = streetViewCacheDir()) {
  const m = VIEW_ID.exec(id);
  if (!m) return null;
  const v = { heading: Number(m[2]), pitch: Number(m[3]), fov: Number(m[4]) };
  const n = normalizeView(v);
  if (n.heading !== v.heading || n.pitch !== v.pitch || n.fov !== v.fov) return null;
  return viewFile(cacheDir, m[1], v);
}
const angleGap = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

export async function findPanorama(
  location: { lat: number; lng: number },
  radius: number,
  key: string,
  fetcher: typeof fetch = fetch,
): Promise<StreetViewPanorama | null> {
  const url = new URL(`${API}/metadata`);
  url.searchParams.set("location", `${location.lat},${location.lng}`);
  url.searchParams.set("radius", String(radius));
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", key);
  const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Street View metadata returned HTTP ${response.status}`);
  const data = (await response.json()) as {
    status?: string; pano_id?: string; date?: string; copyright?: string;
    location?: { lat?: number; lng?: number };
  };
  if (data.status === "ZERO_RESULTS" || data.status === "NOT_FOUND") return null;
  if (data.status !== "OK") throw new Error(`Street View metadata status ${String(data.status).slice(0, 40)}`);
  if (typeof data.pano_id !== "string" || !data.pano_id)
    throw new Error("Street View metadata is missing a panorama ID");
  if (!PANO_ID.test(data.pano_id))
    throw new Error("Street View metadata contains an unsupported panorama ID format");
  const lat = data.location?.lat, lng = data.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) ||
      !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    throw new Error("Street View metadata is missing valid panorama coordinates");
  return {
    panoId: data.pano_id, lat, lng,
    date: typeof data.date === "string" ? data.date.slice(0, 20) : null,
    copyright: typeof data.copyright === "string" ? data.copyright.slice(0, 100) : null,
  };
}

async function exists(file: string) {
  try { return (await stat(file)).size > 0; } catch { return false; }
}

async function fetchView(
  panoId: string, view: ViewParams, key: string, fetcher: typeof fetch, cacheDir: string,
): Promise<{ file: string; requested: boolean }> {
  const file = viewFile(cacheDir, panoId, view);
  if (await exists(file)) return { file, requested: false };
  const url = new URL(API);
  url.searchParams.set("size", IMAGE_SIZE);
  url.searchParams.set("pano", panoId);
  url.searchParams.set("heading", String(view.heading));
  url.searchParams.set("pitch", String(view.pitch));
  url.searchParams.set("fov", String(view.fov));
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", key);
  const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Street View image returned HTTP ${response.status}`);
  if (!response.headers.get("content-type")?.startsWith("image/"))
    throw new Error("Street View image response was not an image");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error("Street View image size invalid");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
  return { file, requested: true };
}

async function rank(photoFile: string, files: string[], python: string) {
  const { stdout } = await exec(
    python,
    [path.join(process.cwd(), "scripts/cv/rank_views.py"), photoFile, ...files],
    { timeout: 120000, maxBuffer: 1024 * 1024 },
  );
  const rows = JSON.parse(stdout) as Partial<RankedView>[];
  if (!Array.isArray(rows) || rows.length !== files.length) throw new Error("Invalid ranking output");
  return rows;
}

/** Prefer similarity among views with visible road; use road coverage if none qualify.
 * The 5% coverage threshold is a heuristic, not a verified road classifier.
 */
export function locationRoadView(views: RankedView[]) {
  const roadViews = views.filter((view) => view.roadScore >= 0.05);
  return roadViews.length
    ? [...roadViews].sort((a, b) => b.similarity - a.similarity || b.roadScore - a.roadScore)[0]
    : [...views].sort((a, b) => b.roadScore - a.roadScore || b.similarity - a.similarity)[0] ?? null;
}

const better = (a: RankedView, b: RankedView) =>
  Number(b.sceneMatched) - Number(a.sceneMatched) || b.similarity - a.similarity;

/** Refinement grids around the current best direction (deduplicated against what is known). */
function refinements(round: number, best: ViewParams): ViewParams[] {
  const { heading: h, pitch: p, fov: f } = best;
  if (round === 2)
    return [
      { heading: h - 20, pitch: p, fov: f }, { heading: h - 10, pitch: p, fov: f },
      { heading: h + 10, pitch: p, fov: f }, { heading: h + 20, pitch: p, fov: f },
      { heading: h, pitch: p, fov: f - 30 }, { heading: h, pitch: p, fov: f + 20 },
    ];
  return [
    { heading: h - 5, pitch: p, fov: f }, { heading: h + 5, pitch: p, fov: f },
    { heading: h, pitch: p + 8, fov: f }, { heading: h, pitch: p - 8, fov: f },
    { heading: h, pitch: p, fov: f - 15 }, { heading: h, pitch: p, fov: f + 15 },
  ];
}

export async function searchStreetView(
  photo: Buffer,
  location: { lat: number; lng: number },
  options: SearchOptions = {},
): Promise<StreetViewSearch> {
  const started = Date.now();
  const key = options.key ?? streetViewKey();
  if (!key) throw new Error("Street View is not configured");
  const fetcher = options.fetcher ?? fetch;
  const python = options.python || process.env.CV_PYTHON || "python3";
  const cacheDir = options.cacheDir ?? streetViewCacheDir();
  const maxRequests = options.maxImageRequests ?? 20;
  const notes: string[] = [];
  const result = (status: StreetViewStatus, panorama: StreetViewPanorama | null,
    candidates: RankedView[], best: RankedView | null, imageRequests: number, cachedViews: number): StreetViewSearch =>
    ({ status, panorama, best, candidates, imageRequests, cachedViews, durationMs: Date.now() - started, notes });

  let panorama = await findPanorama(location, 50, key, fetcher);
  if (!panorama) panorama = await findPanorama(location, 150, key, fetcher);
  if (!panorama) {
    notes.push("No outdoor Street View panorama was found within 150 m of the photo location.");
    return result("no-panorama", null, [], null, 0, 0);
  }
  const pano: StreetViewPanorama = panorama;

  const dir = await mkdtemp(path.join(tmpdir(), "ff-streetview-"));
  const known = new Map<string, RankedView>();
  let imageRequests = 0, cachedViews = 0;
  try {
    const photoFile = path.join(dir, "photo.jpg");
    await writeFile(photoFile, photo);
    const evaluate = async (round: number, views: ViewParams[]) => {
      const fresh = views.map(normalizeView)
        .filter((v, i, all) => all.findIndex((w) => viewId("x", w) === viewId("x", v)) === i)
        .filter((v) => !known.has(viewId(pano.panoId, v)));
      const fetched: { view: ViewParams; file: string }[] = [];
      for (const view of fresh) {
        const cachedFile = viewFile(cacheDir, pano.panoId, view);
        const cached = await exists(cachedFile);
        if (!cached && imageRequests >= maxRequests) {
          notes.push(`Stopped at the ${maxRequests}-image request budget.`);
          break;
        }
        // Failed attempts also count toward the request budget.
        if (!cached) imageRequests++;
        try {
          const got = await fetchView(pano.panoId, view, key, fetcher, cacheDir);
          if (!got.requested) cachedViews++;
          fetched.push({ view, file: got.file });
        } catch {
          notes.push("A Street View direction could not load; other available location views were retained.");
        }
      }
      if (!fetched.length) return;
      let rows: Partial<RankedView>[];
      try {
        rows = await rank(photoFile, fetched.map((f) => f.file), python);
      } catch {
        // Image availability does not depend on the optional local matcher.
        notes.push("View matching is unavailable; showing location imagery without a verified scene match or road classification.");
        rows = fetched.map(() => ({}));
      }
      fetched.forEach(({ view, file }, i) => {
        const row = rows[i];
        known.set(viewId(pano.panoId, view), {
          ...view, id: viewId(pano.panoId, view), file, round,
          matches: Number(row.matches) || 0, inliers: Number(row.inliers) || 0,
          inlierRatio: Number(row.inlierRatio) || 0, supportArea: Number(row.supportArea) || 0,
          reprojectionErrorPx: typeof row.reprojectionErrorPx === "number" ? row.reprojectionErrorPx : null,
          sceneMatched: row.sceneMatched === true, registered: row.registered === true,
          similarity: Number(row.similarity) || 0,
          roadScore: Number(row.roadScore) || 0,
        });
      });
    };
    const leader = () => [...known.values()].sort(better)[0] ?? null;

    // Round 1: coarse sweep of the full panorama.
    await evaluate(1, [0, 45, 90, 135, 180, 225, 270, 315].map((heading) => ({ heading, pitch: 0, fov: 90 })));
    let coarse = leader();
    // A bridge or facade can be too small in a wide view to produce any inliers.
    // Try a bounded zoomed sweep around the road direction before giving up.
    if (coarse && coarse.inliers < 8) {
      const seed = locationRoadView([...known.values()])!;
      notes.push("Wide views had too little matching detail; checking tighter views around the visible road.");
      await evaluate(2, [-20, -10, 0, 10, 20].map((offset) => ({
        heading: seed.heading + offset, pitch: seed.pitch, fov: Math.abs(offset) === 20 ? 30 : 45,
      })).concat([{heading: seed.heading, pitch: seed.pitch, fov: 30}]));
      coarse = leader();
    }
    if (!coarse || coarse.inliers < 8) {
      const road = locationRoadView([...known.values()]);
      notes.push("The uploaded incident could not be matched to the current location; showing the most similar road-visible location view where available.");
      return result(road ? "road-fallback" : "no-match", panorama, [...known.values()].sort(better), road, imageRequests, cachedViews);
    }
    // Rounds 2-3: refine heading, zoom and pitch around the leading direction.
    await evaluate(2, refinements(2, coarse));
    await evaluate(3, refinements(3, leader()!));

    const candidates = [...known.values()].sort(better);
    const best = candidates[0];
    if (!best.sceneMatched) {
      notes.push("The uploaded incident could not be matched to the current location; showing location imagery without alignment.");
      return result("road-fallback", panorama, candidates, locationRoadView(candidates), imageRequests, cachedViews);
    }
    // Adjacent headings of one scene may score alike; a strong rival in a different
    // direction means the photo's structure repeats, so the choice is not reliable.
    const rival = candidates.find((c) => c !== best && c.sceneMatched &&
      angleGap(c.heading, best.heading) > 60 && c.similarity >= best.similarity * 0.8);
    if (rival) {
      notes.push(`Two different directions match similarly (${best.heading}° and ${rival.heading}°); showing location imagery without a verified match or alignment.`);
      return result("road-fallback", panorama, candidates, locationRoadView(candidates), imageRequests, cachedViews);
    }
    return result("matched", panorama, candidates, best, imageRequests, cachedViews);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Compact, key-free provenance stored with an analysis. */
export function summarizeStreetView(search: StreetViewSearch | null): StreetViewProvenance {
  const best = search?.best ?? null;
  return {
    status: search ? search.status : "failed",
    panoId: search?.panorama?.panoId ?? null,
    panoramaLocation: search?.panorama ? { lat: search.panorama.lat, lng: search.panorama.lng } : null,
    imageryDate: search?.panorama?.date ?? null,
    copyright: search?.panorama?.copyright ?? null,
    heading: best?.heading ?? null, pitch: best?.pitch ?? null, fov: best?.fov ?? null,
    similarity: best?.similarity ?? null, roadScore: best?.roadScore ?? null, inliers: best?.inliers ?? null,
    viewsCompared: search?.candidates.length ?? 0,
    imageRequests: search?.imageRequests ?? 0,
    durationMs: search?.durationMs ?? 0,
  };
}

/** Bytes of a cached view, for serving and for the reference pipeline. */
export const readCachedView = (file: string) => readFile(file);
