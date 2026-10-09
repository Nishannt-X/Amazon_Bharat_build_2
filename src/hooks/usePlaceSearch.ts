"use client";

/**
 * Explicit-submit place-search hook for ReportScreen (Photon adapter).
 *
 * Ownership: input + search state live here so text/results survive phase
 * changes while the hook stays mounted in ReportScreen. LocationSearchBar
 * stays purely presentational — it never fetches.
 *
 * Guarantees:
 * - No autocomplete, no background/repeated calls: network fires only from
 *   `search()`, called on explicit form submit.
 * - New query clears outdated selection/results but keeps the input text.
 * - `reset()` (report restart) cancels in-flight work and clears all state.
 * - Unmount cancels in-flight work. Aborts are never surfaced as errors.
 * - Stale responses (slow earlier query finishing after a newer one) are
 *   ignored via a sequence guard.
 * - Selecting a result only records the selection; the PARENT moves the
 *   report pin and bumps focusPinSignal (recenter), then allows drag
 *   refine. The GPS dot is never touched here.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OSM_COPYRIGHT_URL,
  PHOTON_ATTRIBUTION_TEXT,
  PHOTON_ATTRIBUTION_URL,
  PlaceSearchError,
  searchPlacesPhoton,
  type PhotonSearchParams,
} from "../lib/place-search";
import type {
  LocationSearchBarStatus,
  PlaceSearchResult,
} from "../components/LocationSearchBar";

export interface UsePlaceSearchOptions extends PhotonSearchParams {
  timeoutMs?: number;
}

export interface PlaceSearchAttribution {
  text: string;
  photonUrl: string;
  osmUrl: string;
}

export const PLACE_SEARCH_ATTRIBUTION: PlaceSearchAttribution = {
  text: PHOTON_ATTRIBUTION_TEXT,
  photonUrl: PHOTON_ATTRIBUTION_URL,
  osmUrl: OSM_COPYRIGHT_URL,
};

export interface UsePlaceSearchApi {
  /** Editable input text. Survives phase changes; cleared only by reset(). */
  query: string;
  setQuery: (query: string) => void;
  /** Last explicitly submitted text ("results for X"). */
  committedQuery: string;
  results: PlaceSearchResult[];
  status: LocationSearchBarStatus;
  errorMessage: string | null;
  selectedResultId: string | null;
  /** Always true: Photon is configured. Parent passes straight through. */
  hasProvider: true;
  attribution: PlaceSearchAttribution;
  /** Explicit submit only. No-arg form reuses the current input text. */
  search: (rawQuery?: string) => void;
  /** Record a pick; parent moves the report pin + recenters. */
  selectResult: (result: PlaceSearchResult) => PlaceSearchResult;
  /** Drop the selected highlight (typed text changed, pin dragged, GPS
   *  moved the pin). Results and input text are kept. */
  clearSelection: () => void;
  /** Cancel in-flight work and clear everything (report restart). */
  reset: () => void;
}

export function usePlaceSearch(
  options: UsePlaceSearchOptions = {},
): UsePlaceSearchApi {
  const [query, setQueryState] = useState("");
  const [committedQuery, setCommittedQuery] = useState("");
  const [results, setResults] = useState<PlaceSearchResult[]>([]);
  const [status, setStatus] =
    useState<LocationSearchBarStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedResultId, setSelectedResultId] = useState<string | null>(
    null,
  );

  const queryRef = useRef(query);
  const optionsRef = useRef(options);
  const seqRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  // Unmount cancels in-flight work; the late response is ignored.
  useEffect(() => {
    return () => {
      seqRef.current += 1;
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const setQuery = useCallback((next: string) => {
    queryRef.current = next;
    setQueryState(next);
  }, []);

  const search = useCallback((rawQuery?: string) => {
    const text = (rawQuery ?? queryRef.current).trim();
    if (!text) return;
    seqRef.current += 1;
    const seq = seqRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // Fresh explicit query: drop outdated selection/results, keep input.
    setCommittedQuery(text);
    setResults([]);
    setSelectedResultId(null);
    setErrorMessage(null);
    setStatus("searching");
    const opts = optionsRef.current;
    void (async () => {
      try {
        const found = await searchPlacesPhoton(text, {
          ...opts,
          signal: controller.signal,
        });
        if (seqRef.current !== seq) return; // stale response
        setResults(found);
        setStatus(found.length > 0 ? "ready" : "empty");
      } catch (err) {
        if (seqRef.current !== seq) return; // stale failure
        // Abort after reset()/new search()/unmount is control flow, not error.
        if (err instanceof PlaceSearchError && err.kind === "aborted") return;
        const message =
          err instanceof PlaceSearchError
            ? err.message
            : "Search failed. Try again.";
        setResults([]);
        setErrorMessage(message);
        setStatus("error");
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    })();
  }, []);

  const selectResult = useCallback((result: PlaceSearchResult) => {
    setSelectedResultId(result.id);
    return result;
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedResultId(null);
  }, []);

  const reset = useCallback(() => {
    seqRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    queryRef.current = "";
    setQueryState("");
    setCommittedQuery("");
    setResults([]);
    setSelectedResultId(null);
    setErrorMessage(null);
    setStatus("idle");
  }, []);

  return {
    query,
    setQuery,
    committedQuery,
    results,
    status,
    errorMessage,
    selectedResultId,
    hasProvider: true,
    attribution: PLACE_SEARCH_ATTRIBUTION,
    search,
    selectResult,
    clearSelection,
    reset,
  };
}
