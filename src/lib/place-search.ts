/**
 * Photon place-search adapter (FloodFlow frontend milestone).
 *
 * Real prototype lookup against the public Photon demo service backed by
 * OpenStreetMap data. No API key, no custom backend, no server proxy.
 *
 * Verified against the primary Photon docs (komoot/photon README +
 * docs/api-v1.md):
 * - Endpoint `GET /api` with mandatory `q`, plus `limit`, `lang`,
 *   repeatable `countrycode` (ISO 3166-1 alpha-2), `bbox`, `lat`/`lon` +
 *   `zoom`/`location_bias_scale` location bias, `layer`, `dedupe`.
 * - Response is a GeoJSON FeatureCollection; geometry coordinates are
 *   `[lng, lat]` (GeoJSON order). Properties follow GeocodeJson with
 *   `name`, `street`, `housenumber`, `locality`, `district`, `city`,
 *   `county`, `state`, `country`, `countrycode`, `osm_type`/`osm_id`, etc.
 * - Demo-service terms: reasonable request volume only, extensive usage is
 *   throttled/banned, no availability guarantee, changes without notice.
 *
 * Deliberate non-goals (do not "guess" parameters):
 * - No `bbox` / `lat`+`lon` location bias: that would need invented user GPS
 *   and ReportScreen must never auto-prompt geolocation for search.
 * - No default `countrycode` restriction: results stay honest worldwide and
 *   the detail labels let the user distinguish ambiguous names. The parent
 *   may pass `countryCodes: ["IN"]` explicitly if India-only is wanted.
 *
 * Call contract: EXPLICIT search submit only. Nothing here fires per
 * keystroke — the hook exposes a `search()` the parent calls from the
 * form submit handler. A small request-spacing guard plus a bounded TTL
 * cache keeps the demo service from being flooded by repeated submits.
 */

import type { PlaceSearchResult } from "../components/LocationSearchBar";

/** Public Photon demo endpoint. Switchable: pass `endpoint` to point at a
 *  self-hosted Photon instance instead. */
export const PHOTON_SEARCH_ENDPOINT_DEFAULT =
  "https://photon.komoot.io/api/";

/** Attribution contract for the UI (parent renders this near results). */
export const PHOTON_ATTRIBUTION_TEXT =
  "Search by Photon · © OpenStreetMap contributors";
export const PHOTON_ATTRIBUTION_URL = "https://photon.komoot.io/";
export const OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright";

/** Demo-service caveat (komoot/photon README): reasonable use, throttling
 *  possible, no uptime guarantee. User accepted this for the prototype. */
export const PHOTON_DEMO_SERVICE_NOTE =
  "Photon demo service: reasonable use only, may throttle, no uptime guarantee.";

export const PLACE_SEARCH_DEFAULT_LIMIT = 5;
export const PLACE_SEARCH_MAX_LIMIT = 10;
export const PLACE_SEARCH_DEFAULT_LANG = "en";
export const PLACE_SEARCH_TIMEOUT_MS = 10_000;
export const PLACE_SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
export const PLACE_SEARCH_CACHE_MAX_ENTRIES = 25;
/** Minimum gap between demo-service requests. Explicit submits are never
 *  dropped, only briefly delayed, so one user cannot hammer the demo. This
 *  is app politeness, not a per-browser rate-limit guarantee. */
export const PLACE_SEARCH_MIN_REQUEST_SPACING_MS = 1200;

export type PlaceSearchErrorKind =
  | "throttled"
  | "timeout"
  | "offline"
  | "http"
  | "invalid-response"
  | "aborted";

/**
 * Typed search failure. The hook maps `kind` to UI status/copy; "aborted"
 * is never an error (reset / new query / unmount).
 */
export class PlaceSearchError extends Error {
  readonly kind: PlaceSearchErrorKind;
  readonly status?: number;

  constructor(kind: PlaceSearchErrorKind, message: string, status?: number) {
    super(message);
    this.name = "PlaceSearchError";
    this.kind = kind;
    this.status = status;
  }
}

/** User-facing copy per failure kind. 429 / timeout / offline / empty each
 *  read distinctly so the user knows what actually happened. */
export function placeSearchErrorMessage(
  kind: PlaceSearchErrorKind,
  status?: number,
): string {
  switch (kind) {
    case "throttled":
      return "Search is busy right now (Photon demo limit). Wait a moment and try again.";
    case "timeout":
      return "Search took too long. Check your connection and try again.";
    case "offline":
      return "You look offline. Reconnect and try again — or place the pin by hand.";
    case "aborted":
      return "Search cancelled.";
    case "invalid-response":
      return "Search returned an unexpected result. Try again.";
    case "http":
      return typeof status === "number"
        ? `Search failed (server error ${status}). Try again.`
        : "Search failed. Try again.";
  }
}

export interface PhotonSearchParams {
  /** Override to switch providers/instances, e.g. a self-hosted Photon. */
  endpoint?: string;
  /** 1..10, defaults to 5 ("5ish legitimate results"). */
  limit?: number;
  /** Single language code, defaults to "en". */
  lang?: string;
  /** Optional explicit country restriction, e.g. ["IN"]. No default. */
  countryCodes?: string[];
}

export interface PhotonSearchOptions extends PhotonSearchParams {
  /** Caller abort (new query / reset / unmount). Never treated as error. */
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Injectable fetch for tests. */
  fetchImpl?: typeof fetch;
}

export function normalizePlaceQuery(query: string): string {
  return query.trim().replace(/\s+/g, " ");
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return PLACE_SEARCH_DEFAULT_LIMIT;
  }
  return Math.min(
    Math.max(Math.floor(limit), 1),
    PLACE_SEARCH_MAX_LIMIT,
  );
}

/**
 * Pure URL builder (testable, no network). Only uses parameters verified in
 * docs/api-v1.md. No lat/lon/bbox bias by design (see header).
 */
export function buildPhotonSearchUrl(
  query: string,
  params: PhotonSearchParams = {},
): string {
  const q = normalizePlaceQuery(query);
  if (!q) throw new Error("Place search needs a non-empty query.");
  const endpoint = (params.endpoint ?? PHOTON_SEARCH_ENDPOINT_DEFAULT).trim();
  if (!/^https?:\/\//i.test(endpoint)) {
    throw new Error("Place search endpoint must be an http(s) URL.");
  }
  const lang = (params.lang ?? PLACE_SEARCH_DEFAULT_LANG).trim() || PLACE_SEARCH_DEFAULT_LANG;
  const url = new URL(endpoint);
  url.searchParams.set("q", q);
  url.searchParams.set("limit", String(clampLimit(params.limit)));
  url.searchParams.set("lang", lang);
  for (const raw of params.countryCodes ?? []) {
    const code = raw.trim().toUpperCase();
    // ISO 3166-1 alpha-2 only; anything else is dropped, never guessed.
    if (/^[A-Z]{2}$/.test(code)) url.searchParams.append("countrycode", code);
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Response parsing (robust GeoJSON FeatureCollection handling)
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Fallback label when Photon has no `name`: street address first, then
 *  ascending administrative parts. Never HTML, never empty. */
function fallbackLabel(props: Record<string, unknown>): string {
  const street = nonEmptyString(props.street);
  const housenumber = nonEmptyString(props.housenumber);
  if (street) {
    const composed = housenumber ? `${housenumber} ${street}` : street;
    return composed.slice(0, 120);
  }
  for (const key of ["locality", "district", "city", "state", "country"]) {
    const part = nonEmptyString(props[key]);
    if (part) return part.slice(0, 120);
  }
  return "Unnamed place";
}

/**
 * Distinguishing context so repeated names are not a blind pick, e.g.
 * "Indiranagar 1st Stage, Bengaluru, Karnataka, India". Parts equal to the
 * label are dropped; order is locality → city → state → country.
 */
function buildDetail(
  label: string,
  props: Record<string, unknown>,
): string | undefined {
  const seen = new Set<string>([label.trim().toLowerCase()]);
  const parts: string[] = [];
  for (const key of ["locality", "city", "state", "country"]) {
    const part = nonEmptyString(props[key]);
    if (!part) continue;
    const folded = part.toLowerCase();
    if (seen.has(folded)) continue;
    seen.add(folded);
    parts.push(part);
  }
  const detail = parts.join(", ").slice(0, 160);
  return detail.length > 0 ? detail : undefined;
}

/** Stable id: OSM identity when present, else rounded-coordinate fallback. */
function stableResultId(
  props: Record<string, unknown>,
  lat: number,
  lng: number,
  index: number,
): string {
  const osmType = nonEmptyString(props.osm_type);
  const osmIdRaw = props.osm_id;
  const osmId =
    finiteNumber(osmIdRaw) !== null
      ? String(osmIdRaw)
      : (nonEmptyString(osmIdRaw) ?? null);
  if (osmType && osmId && /^[NWR]$/.test(osmType)) {
    return `photon:${osmType}:${osmId}`;
  }
  return `photon:pin:${lat.toFixed(5)},${lng.toFixed(5)}:${index}`;
}

function toPlaceSearchResult(
  feature: unknown,
  index: number,
): PlaceSearchResult | null {
  const item = asRecord(feature);
  const geometry = asRecord(item?.geometry);
  const coords = geometry?.coordinates;
  // GeoJSON order is [lng, lat] — never swapped.
  if (
    geometry?.type !== "Point" ||
    !Array.isArray(coords) ||
    coords.length < 2
  ) {
    return null;
  }
  const lng = finiteNumber(coords[0]);
  const lat = finiteNumber(coords[1]);
  if (lng === null || lat === null) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  const props = asRecord(item?.properties) ?? {};
  const label =
    nonEmptyString(props.name)?.slice(0, 120) ?? fallbackLabel(props);
  return {
    id: stableResultId(props, lat, lng, index),
    label,
    detail: buildDetail(label, props),
    lat,
    lng,
  };
}

/**
 * Parse a Photon GeoJSON payload into PlaceSearchResult (the exact
 * LocationSearchBar shape — no duplicate result type). Skips invalid
 * coordinates, removes duplicates (same OSM id or same rounded location),
 * caps at `limit`. Throws PlaceSearchError("invalid-response") when the
 * payload is not a FeatureCollection.
 */
export function parsePhotonFeatureCollection(
  payload: unknown,
  limit: number = PLACE_SEARCH_DEFAULT_LIMIT,
): PlaceSearchResult[] {
  const max = clampLimit(limit);
  const root = asRecord(payload);
  const features = root && Array.isArray(root.features) ? root.features : null;
  if (!features) {
    throw new PlaceSearchError(
      "invalid-response",
      placeSearchErrorMessage("invalid-response"),
    );
  }
  const results: PlaceSearchResult[] = [];
  const seenIds = new Set<string>();
  const seenCoords = new Set<string>();
  for (let i = 0; i < features.length && results.length < max; i += 1) {
    const result = toPlaceSearchResult(features[i], i);
    if (!result) continue;
    if (seenIds.has(result.id)) continue;
    const coordKey = `${result.lat.toFixed(5)},${result.lng.toFixed(5)}`;
    if (seenCoords.has(coordKey)) continue;
    seenIds.add(result.id);
    seenCoords.add(coordKey);
    results.push(result);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Network: timeout, one manual retry, TTL cache, request spacing
// ---------------------------------------------------------------------------

interface CacheEntry {
  expiresAt: number;
  results: PlaceSearchResult[];
}

const resultCache = new Map<string, CacheEntry>();
let lastRequestStartMs = 0;

function cacheKeyFor(query: string, options: PhotonSearchParams): string {
  const endpoint = (options.endpoint ?? PHOTON_SEARCH_ENDPOINT_DEFAULT).trim();
  const lang = (options.lang ?? PLACE_SEARCH_DEFAULT_LANG).trim();
  const codes = (options.countryCodes ?? [])
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{2}$/.test(c))
    .sort()
    .join(",");
  return `${endpoint}|${lang}|${clampLimit(options.limit)}|${codes}|${query.toLowerCase()}`;
}

/** Test/support utility: drop cached results (also handy after reset). */
export function clearPlaceSearchCache(): void {
  resultCache.clear();
}

function readCache(key: string): PlaceSearchResult[] | null {
  const entry = resultCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    resultCache.delete(key);
    return null;
  }
  return entry.results;
}

function writeCache(key: string, results: PlaceSearchResult[]): void {
  while (resultCache.size >= PLACE_SEARCH_CACHE_MAX_ENTRIES) {
    const oldest = resultCache.keys().next();
    if (oldest.done) break;
    resultCache.delete(oldest.value);
  }
  resultCache.set(key, {
    expiresAt: Date.now() + PLACE_SEARCH_CACHE_TTL_MS,
    results,
  });
}

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(
        new PlaceSearchError("aborted", placeSearchErrorMessage("aborted")),
      );
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(
        new PlaceSearchError("aborted", placeSearchErrorMessage("aborted")),
      );
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function ensureRequestSpacing(signal?: AbortSignal): Promise<void> {
  const wait =
    PLACE_SEARCH_MIN_REQUEST_SPACING_MS - (Date.now() - lastRequestStartMs);
  if (wait > 0) await abortableSleep(wait, signal);
  lastRequestStartMs = Date.now();
}

function retryDelayMs(res: Response): number {
  if (res.status === 429) {
    const header = res.headers.get("retry-after");
    if (header) {
      const seconds = Number(header);
      if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.min(seconds * 1000, 5000);
      }
      const dateMs = Date.parse(header);
      if (!Number.isNaN(dateMs)) {
        return Math.min(Math.max(dateMs - Date.now(), 0), 5000);
      }
    }
    return 1000;
  }
  return 800;
}

function isAbortError(err: unknown): boolean {
  return (
    err instanceof DOMException
      ? err.name === "AbortError"
      : err instanceof Error && err.name === "AbortError"
  );
}

function isOfflineNow(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    navigator.onLine === false
  );
}

/**
 * Explicit-submit search. Never called per keystroke (see hook). Throws
 * PlaceSearchError with kind throttled | timeout | offline | http |
 * invalid-response | aborted. A single automatic retry on 429/502/503/504
 * only (bounded, honours Retry-After); timeouts and network failures are
 * NOT auto-retried, and anything still failing surfaces for an explicit
 * manual repeat — no background repeat traffic against the demo service.
 */
export async function searchPlacesPhoton(
  query: string,
  options: PhotonSearchOptions = {},
): Promise<PlaceSearchResult[]> {
  const q = normalizePlaceQuery(query);
  if (!q) throw new Error("Place search needs a non-empty query.");
  if (isOfflineNow()) {
    throw new PlaceSearchError("offline", placeSearchErrorMessage("offline"));
  }
  const limit = clampLimit(options.limit);
  const key = cacheKeyFor(q, options);
  const cached = readCache(key);
  if (cached) return cached;

  await ensureRequestSpacing(options.signal);

  const url = buildPhotonSearchUrl(q, options);
  const timeoutMs =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)
      ? Math.max(options.timeoutMs, 1)
      : PLACE_SEARCH_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const outerSignal = options.signal;

  async function attemptFetch(): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onOuterAbort = () => controller.abort();
    if (outerSignal) {
      if (outerSignal.aborted) {
        clearTimeout(timer);
        throw new PlaceSearchError(
          "aborted",
          placeSearchErrorMessage("aborted"),
        );
      }
      outerSignal.addEventListener("abort", onOuterAbort, { once: true });
    }
    try {
      return await fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } catch (err) {
      if (outerSignal?.aborted || isAbortError(err) && !timedOut) {
        throw new PlaceSearchError(
          "aborted",
          placeSearchErrorMessage("aborted"),
        );
      }
      if (timedOut || isAbortError(err)) {
        throw new PlaceSearchError(
          "timeout",
          placeSearchErrorMessage("timeout"),
        );
      }
      if (err instanceof TypeError && isOfflineNow()) {
        throw new PlaceSearchError(
          "offline",
          placeSearchErrorMessage("offline"),
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
      outerSignal?.removeEventListener("abort", onOuterAbort);
    }
  }

  for (let attempt = 0; ; attempt += 1) {
    const res = await attemptFetch();
    if (
      res.status === 429 ||
      res.status === 502 ||
      res.status === 503 ||
      res.status === 504
    ) {
      if (attempt === 0) {
        await abortableSleep(retryDelayMs(res), outerSignal);
        continue;
      }
      if (res.status === 429) {
        throw new PlaceSearchError(
          "throttled",
          placeSearchErrorMessage("throttled"),
          429,
        );
      }
      throw new PlaceSearchError(
        "http",
        placeSearchErrorMessage("http", res.status),
        res.status,
      );
    }
    if (!res.ok) {
      throw new PlaceSearchError(
        "http",
        placeSearchErrorMessage("http", res.status),
        res.status,
      );
    }
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      throw new PlaceSearchError(
        "invalid-response",
        placeSearchErrorMessage("invalid-response"),
        res.status,
      );
    }
    const results = parsePhotonFeatureCollection(payload, limit);
    // Cache successes (including empty lists) so repeated explicit submits
    // of the same text do not re-hit the demo service within the TTL.
    writeCache(key, results);
    return results;
  }
}
