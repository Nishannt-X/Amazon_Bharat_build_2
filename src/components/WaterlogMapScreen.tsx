"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, RefreshCw, Waves } from "lucide-react";
import theme from "./map-experience-theme.module.css";
import NavigationPanel from "./navigation/NavigationPanel";
import type { NavigationMapPath } from "../lib/navigation";
import type { ReportPin, SharedWaterlogReport } from "../lib/report";
import { watchDeviceLocation, type DeviceFix, type LocationFailure } from "../lib/report-geolocation";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-surface" role="status">Opening the waterlogging map…</div>,
});

export default function WaterlogMapScreen() {
  const [reports, setReports] = useState<SharedWaterlogReport[]>([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [paths, setPaths] = useState<NavigationMapPath[]>([]);
  const [endpoints, setEndpoints] = useState<{ start: ReportPin; end: ReportPin } | null>(null);
  const [focusPin, setFocusPin] = useState<ReportPin | null>(null);
  const [focusSignal, setFocusSignal] = useState(0);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);
  const [tileRetry, setTileRetry] = useState(0);
  const [routeFocusSignal, setRouteFocusSignal] = useState(0);
  const focusedReport = useRef(false);
  const [gps, setGps] = useState<DeviceFix | null>(null);
  const [locationError, setLocationError] = useState<LocationFailure | null>(null);
  const [locationRetry, setLocationRetry] = useState(0);
  const [recenterSignal, setRecenterSignal] = useState(0);

  useEffect(() => {
    let centered = false;
    let precise = false;
    const stop = watchDeviceLocation((fix) => {
      setGps(fix); setLocationError(null);
      if (!centered || (!precise && fix.accuracyMeters <= 100)) setRecenterSignal((n) => n + 1);
      centered = true; precise = precise || fix.accuracyMeters <= 100;
    }, setLocationError);
    return stop;
  }, [locationRetry]);

  useEffect(() => {
    let stopped = false;
    let inFlight = false;
    const controller = new AbortController();
    async function load() {
      if (inFlight) return;
      inFlight = true;
      try {
        const all = new Map<string, SharedWaterlogReport>();
        const visited = new Set<string>();
        let cursor: string | null = null;
        do {
          const query = new URLSearchParams({ limit: "500" });
          if (cursor) query.set("cursor", cursor);
          const response = await fetch(`/api/reports?${query}`, { cache: "no-store", signal: controller.signal });
          if (!response.ok) throw new Error("Reports could not be refreshed. Your previous map is still shown.");
          const data = await response.json();
          if (!Array.isArray(data.reports)) throw new Error("The report feed returned an unexpected response.");
          for (const report of data.reports) all.set(report.id, report);
          cursor = typeof data.nextCursor === "string" ? data.nextCursor : null;
          if (cursor && visited.has(cursor)) throw new Error("The report feed could not finish loading. Retry shortly.");
          if (cursor) visited.add(cursor);
        } while (cursor && !stopped);
        if (!stopped) {
          setReports([...all.values()]); setLoaded(true); setError("");
          if (!focusedReport.current) {
            const selected = all.get(new URLSearchParams(window.location.search).get("report") ?? "");
            if (selected) { setFocusPin(selected); setFocusSignal((n) => n + 1); focusedReport.current = true; }
          }
        }
      } catch (caught) {
        if (!stopped) setError(caught instanceof Error ? caught.message : "Reports could not be refreshed.");
      } finally { inFlight = false; }
    }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 15000);
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { stopped = true; controller.abort(); window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  const updateRoutes = useCallback((next: NavigationMapPath[], nextEndpoints: { start: ReportPin; end: ReportPin } | null) => {
    setPaths(next); setEndpoints(nextEndpoints);
    if (next.length) setRouteFocusSignal((n) => n + 1);
  }, []);
  const focusPoint = useCallback((point: ReportPin) => { setFocusPin(point); setFocusSignal((n) => n + 1); }, []);

  return <div className={`${theme.experience} flex min-h-dvh flex-col bg-background text-foreground`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold"><Waves className="text-accent" /> FloodFlow</Link>
      <Link href="/report" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 font-semibold text-accent-foreground"><Camera size={18} /> Report a waterlog</Link>
    </header>
    <div className="grid flex-1 lg:grid-cols-[370px_1fr]">
      <aside className="order-2 min-w-0 border-t border-border bg-surface p-4 lg:order-1 lg:max-h-[calc(100dvh-80px)] lg:overflow-y-auto lg:border-t-0 lg:border-r">
        <h1 className="text-2xl font-semibold">The waterlogging map</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground-secondary">Explore reported spots or plan a journey. Waterlog markers stay on the map at every zoom level.</p>
        <details className="my-4 rounded-xl border border-border bg-surface-raised p-3">
          <summary className="cursor-pointer text-sm font-semibold">Browse reported spots · {reports.length}</summary>
          <div className="mt-2 max-h-52 overflow-y-auto">{reports.map((report) => <button key={report.id} type="button" onClick={() => focusPoint(report)} className="flex min-h-12 w-full items-center gap-2 border-b border-border px-1 py-2 text-left text-xs"><Waves size={16} /><span className="flex-1">{report.locationLabel}<small className="mt-1 block text-foreground-secondary">{report.provenance === "sample" ? "Sample incident" : "Community observation"} · {report.observedDepthCm == null ? "Depth unknown" : `${report.observedDepthCm} cm reported`}</small></span></button>)}</div>
        </details>
        <NavigationPanel reports={reports.filter((r) => r.provenance !== "sample")} onRoutesChange={updateRoutes} onFocusPoint={focusPoint} />
      </aside>
      <section aria-label="Reported waterlogging map" className="relative order-1 h-[65dvh] min-h-[340px] lg:order-2 lg:h-auto lg:min-h-0">
        <MapComponent mode="browse" gps={gps} reportPin={null} onReportPinChange={() => {}} recenterSignal={recenterSignal} reports={reports} focusPin={focusPin} focusPinSignal={focusSignal} routePaths={paths} routeEndpoints={endpoints} routeFocusSignal={routeFocusSignal} tileRetrySignal={tileRetry} onTilesUnavailable={setTilesUnavailable} />
        <div className="pointer-events-none absolute left-16 right-3 top-3 z-[500] rounded-xl border border-border bg-surface/95 p-3 text-sm shadow-lg sm:right-auto sm:max-w-sm">
          <p className="font-semibold">{loaded ? `${reports.filter((r) => r.provenance !== "sample").length} community reports · ${reports.filter((r) => r.provenance === "sample").length} samples` : "Loading reported spots…"}</p>
          <p className="mt-1 text-xs text-foreground-secondary">Reports describe observations at their recorded time. An empty area does not mean a clear road.</p>
          <p role="status" className="mt-2 text-xs text-foreground-secondary">{locationError === "denied" ? "Location blocked. Allow localhost in your browser and device Location Services." : locationError ? "Your device could not return a precise location. Check Location Services and retry." : gps ? `Your position · ±${Math.round(gps.accuracyMeters)} m` : "Finding your current location…"}</p>
          <button type="button" className="pointer-events-auto mt-1 inline-flex min-h-11 items-center gap-2 text-xs font-semibold" onClick={() => { if (gps && !locationError) setRecenterSignal((n) => n + 1); else { setLocationError(null); setLocationRetry((n) => n + 1); } }}>{locationError ? "Retry location" : gps ? "Recenter on me" : "Retry location"}</button>
        </div>
        {error || tilesUnavailable ? <div role="status" className="absolute bottom-4 left-3 right-3 z-[600] rounded-xl border border-border bg-surface/95 p-3 text-sm shadow-lg sm:right-auto sm:max-w-md">
          <p>{error || "Map background unavailable. Reports and route selections are kept."}</p>
          <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-2 font-semibold text-accent" onClick={() => { setRefresh((n) => n + 1); setTilesUnavailable(false); setTileRetry((n) => n + 1); }}><RefreshCw size={16} /> Retry</button>
        </div> : null}
      </section>
    </div>
  </div>;
}
