/**
 * Lightweight verification for the Photon adapter (src/lib/place-search.ts).
 *
 * No test runner is installed in this repo, so this file uses the Node
 * built-in test runner (`node:test`, no dependencies). Repo convention is
 * extensionless imports, which the Node resolver cannot run directly — run
 * `npm run test:search` (scripts/run-place-search-tests.mjs, also
 * dependency-free) to execute this file via a temp copy.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPhotonSearchUrl,
  clearPlaceSearchCache,
  parsePhotonFeatureCollection,
  PlaceSearchError,
  placeSearchErrorMessage,
  searchPlacesPhoton,
} from "./place-search";

/** Real-shaped Photon payload (trimmed Indiranagar/Bengaluru response). */
function indiranagarPayload(): unknown {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          osm_type: "R",
          osm_id: 19883335,
          type: "district",
          name: "Indiranagar",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
          countrycode: "IN",
        },
        geometry: { type: "Point", coordinates: [77.6443636, 12.9810684] },
      },
      {
        type: "Feature",
        properties: {
          osm_type: "N",
          osm_id: 6400857551,
          type: "house",
          name: "Indiranagar",
          street: "Chinmaya Mission Hospital Road",
          locality: "Indiranagar 1st Stage",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
          countrycode: "IN",
        },
        geometry: { type: "Point", coordinates: [77.6386612, 12.9783325] },
      },
      {
        // No name: label must fall back to street, not "" or HTML.
        type: "Feature",
        properties: {
          osm_type: "N",
          osm_id: 999,
          street: "100 Feet Road",
          housenumber: "12",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
        },
        geometry: { type: "Point", coordinates: [77.64, 12.98] },
      },
      {
        // Invalid coordinates: must be skipped.
        type: "Feature",
        properties: { osm_type: "N", osm_id: 1000, name: "Nowhere" },
        geometry: { type: "Point", coordinates: ["x", null] },
      },
      {
        // Duplicate rounded location of feature 0: must be removed.
        type: "Feature",
        properties: {
          osm_type: "W",
          osm_id: 555,
          name: "Indiranagar copy",
          city: "Bengaluru",
          state: "Karnataka",
          country: "India",
        },
        geometry: { type: "Point", coordinates: [77.64436361, 12.98106841] },
      },
    ],
  };
}

describe("buildPhotonSearchUrl", () => {
  it("encodes q/limit/lang and repeats valid countrycodes only", () => {
    const url = new URL(
      buildPhotonSearchUrl("  Indiranagar,   Bengaluru ", {
        limit: 5,
        lang: "en",
        countryCodes: ["in", "xx1", "USA"],
      }),
    );
    assert.equal(url.searchParams.get("q"), "Indiranagar, Bengaluru");
    assert.equal(url.searchParams.get("limit"), "5");
    assert.equal(url.searchParams.get("lang"), "en");
    assert.deepEqual(url.searchParams.getAll("countrycode"), ["IN"]);
  });

  it("never invents location-bias params and rejects blank queries", () => {
    const url = buildPhotonSearchUrl("Indiranagar");
    assert.ok(!url.includes("lat="));
    assert.ok(!url.includes("lon="));
    assert.ok(!url.includes("bbox="));
    assert.throws(() => buildPhotonSearchUrl("   "), /non-empty query/);
  });
});

describe("parsePhotonFeatureCollection", () => {
  it("keeps GeoJSON lng/lat order and builds distinguishable labels", () => {
    const results = parsePhotonFeatureCollection(indiranagarPayload(), 5);
    // 5 features in, 2 removed (invalid + duplicate) => 3 out.
    assert.equal(results.length, 3);
    const [first, second, third] = results;
    // Bengaluru is ~12.98N, 77.64E: lat must be ~12.98, NOT 77.x.
    assert.ok(Math.abs(first.lat - 12.98107) < 0.001);
    assert.ok(Math.abs(first.lng - 77.64436) < 0.001);
    assert.equal(first.id, "photon:R:19883335");
    assert.equal(first.label, "Indiranagar");
    assert.ok(first.detail?.includes("Bengaluru"));
    assert.ok(first.detail?.includes("Karnataka"));
    assert.ok(first.detail?.includes("India"));
    assert.equal(second.id, "photon:N:6400857551");
    assert.ok(second.detail?.includes("Indiranagar 1st Stage"));
    // Missing name falls back to "12 100 Feet Road", never empty.
    assert.equal(third.label, "12 100 Feet Road");
  });

  it("rejects non-FeatureCollection payloads", () => {
    assert.throws(
      () => parsePhotonFeatureCollection({ features: "nope" }),
      (err: unknown) =>
        err instanceof PlaceSearchError && err.kind === "invalid-response",
    );
  });
});

describe("placeSearchErrorMessage", () => {
  it("distinguishes 429 / timeout / offline", () => {
    assert.match(placeSearchErrorMessage("throttled", 429), /busy/i);
    assert.match(placeSearchErrorMessage("timeout"), /too long/i);
    assert.match(placeSearchErrorMessage("offline"), /offline/i);
    assert.match(placeSearchErrorMessage("http", 500), /500/);
  });
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("searchPlacesPhoton", () => {
  it("returns parsed results and serves repeats from cache without refetch", async () => {
    clearPlaceSearchCache();
    let calls = 0;
    const fetchImpl = (async (): Promise<Response> => {
      calls += 1;
      return jsonResponse(indiranagarPayload());
    }) as typeof fetch;
    const first = await searchPlacesPhoton("Indiranagar, Bengaluru", {
      fetchImpl,
      timeoutMs: 5000,
    });
    assert.equal(first.length, 3);
    const second = await searchPlacesPhoton("Indiranagar, Bengaluru", {
      fetchImpl,
      timeoutMs: 5000,
    });
    assert.equal(second.length, 3);
    assert.equal(calls, 1);
  });

  it("retries once on 429 then succeeds", async () => {
    clearPlaceSearchCache();
    let calls = 0;
    const fetchImpl = (async (): Promise<Response> => {
      calls += 1;
      if (calls === 1) return new Response("slow down", { status: 429 });
      return jsonResponse(indiranagarPayload());
    }) as typeof fetch;
    const results = await searchPlacesPhoton("Indiranagar retry", {
      fetchImpl,
      timeoutMs: 5000,
    });
    assert.equal(calls, 2);
    assert.ok(results.length > 0);
  });

  it("surfaces a persistent 429 as throttled (no endless retry)", async () => {
    clearPlaceSearchCache();
    const fetchImpl = (async (): Promise<Response> =>
      new Response("slow down", { status: 429 })) as typeof fetch;
    await assert.rejects(
      () =>
        searchPlacesPhoton("Indiranagar throttle", {
          fetchImpl,
          timeoutMs: 5000,
        }),
      (err: unknown) =>
        err instanceof PlaceSearchError && err.kind === "throttled",
    );
  });

  it("maps abort to kind=aborted and timeout to kind=timeout", async () => {
    clearPlaceSearchCache();
    const hanging = ((_url: string, init?: { signal?: AbortSignal }) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const e = new DOMException("aborted", "AbortError");
          reject(e);
        });
      })) as unknown as typeof fetch;
    const controller = new AbortController();
    const pending = searchPlacesPhoton("Indiranagar abort", {
      fetchImpl: hanging,
      timeoutMs: 5000,
      signal: controller.signal,
    });
    controller.abort();
    await assert.rejects(
      () => pending,
      (err: unknown) =>
        err instanceof PlaceSearchError && err.kind === "aborted",
    );

    clearPlaceSearchCache();
    await assert.rejects(
      () =>
        searchPlacesPhoton("Indiranagar timeout", {
          fetchImpl: hanging,
          timeoutMs: 30,
        }),
      (err: unknown) =>
        err instanceof PlaceSearchError && err.kind === "timeout",
    );
  });
});
