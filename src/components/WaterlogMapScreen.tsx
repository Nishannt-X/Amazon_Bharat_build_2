"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Camera, LocateFixed, RefreshCw, Waves } from "lucide-react";
import theme from "./map-experience-theme.module.css";
import NavigationPanel from "./navigation/NavigationPanel";
import type { NavigationMapPath } from "../lib/navigation";
import type { ReportPin, SharedWaterlogReport } from "../lib/report";
import { watchDeviceLocation, type DeviceFix, type LocationFailure } from "../lib/report-geolocation";

const MapComponent = dynamic(() => import("./MapComponent"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center bg-surface" role="status">Opening the waterlogging map…</div>,
});

// Browsers only expose location on HTTPS or localhost; read lazily, after an error.
const insecureContext = () => typeof window !== "undefined" && !window.isSecureContext;

export default function WaterlogMapScreen() {
  const [panel, setPanel] = useState<"plan" | "spots">("plan");
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
  const [recenterSignal, setRecenterSignal] = useState(0);
  const stopLocation = useRef<(() => void) | null>(null);

  // Called directly from the tap handler too, so the browser sees a user gesture.
  const beginLocation = useCallback(() => {
    stopLocation.current?.();
    let centered = false;
    let precise = false;
    stopLocation.current = watchDeviceLocation((fix) => {
      setGps(fix); setLocationError(null);
      if (!centered || (!precise && fix.accuracyMeters <= 100)) setRecenterSignal((n) => n + 1);
      centered = true; precise = precise || fix.accuracyMeters <= 100;
    }, setLocationError);
  }, []);
  const startLocation = () => { setLocationError(null); setGps(null); beginLocation(); };

  useEffect(() => {
    beginLocation();
    return () => stopLocation.current?.();
  }, [beginLocation]);

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

  return <div className={`${theme.experience} mapPage flex flex-col bg-background text-foreground`}>
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-surface px-4 py-3">
      <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-lg font-semibold"><Waves className="text-accent" /> FloodFlow</Link>
      <Link href="/report" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 py-2 font-semibold text-accent-foreground"><Camera size={18} /> Report a waterlog</Link>
    </header>
    <div className={theme.mapLayout}>
      <aside className={theme.mapPanel}>
        <h1 className="text-xl font-semibold">Map & routes</h1>
        <div className="my-3 flex gap-2" role="group" aria-label="Map activities">
          <button type="button" aria-pressed={panel === "plan"} onClick={() => setPanel("plan")} className={`min-h-11 flex-1 rounded-xl border border-border px-3 text-sm font-medium ${panel === "plan" ? "bg-accent-soft" : "bg-surface"}`}>Plan a journey</button>
          <button type="button" aria-pressed={panel === "spots"} onClick={() => setPanel("spots")} className={`min-h-11 flex-1 rounded-xl border border-border px-3 text-sm font-medium ${panel === "spots" ? "bg-accent-soft" : "bg-surface"}`}>Reported spots · {reports.length}</button>
        </div>
        {locationError ? <details className="mb-3 rounded-xl border border-border bg-surface-raised px-3 text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center font-medium">Location is off · what to do</summary>
            <p className="pb-3 text-foreground-secondary">{locationError === "unavailable" && insecureContext() ? "Phones only share location on HTTPS. Open the HTTPS link, or search for your start." : locationError === "denied" ? "Location is blocked. Allow it in site settings, then retry, or search for your start." : locationError === "no-response" ? "The location prompt got no answer. Retry, or search for your start." : "No precise fix. Check Location Services, then retry."}</p>
          </details> : null}
        <div hidden={panel !== "spots"}>
        <div>
          <h2 className="text-sm font-medium">{loaded ? `${reports.filter((r) => r.provenance !== "sample").length} community reports · ${reports.filter((r) => r.provenance === "sample").length} samples` : "Loading reported spots…"}</h2>
          {loaded && !reports.length ? <div className="py-4 text-sm"><p>No waterlogging reported yet.</p><p className="mt-1 text-foreground-secondary">An empty map does not mean a clear road.</p><Link href="/report" className="mt-2 inline-flex min-h-11 items-center font-medium underline">Add what you see</Link></div> : null}
          <div className="mt-2 max-h-52 overflow-y-auto">{reports.map((report) => <button key={report.id} type="button" onClick={() => focusPoint(report)} className="flex min-h-12 w-full items-center gap-2 border-b border-border px-1 py-2 text-left text-xs"><Waves size={16} /><span className="flex-1">{report.locationLabel}<small className="mt-1 block text-foreground-secondary">{report.provenance === "sample" ? "Sample incident" : "Community observation"} · {report.observedDepthCm == null ? "Depth unknown" : `${report.observedDepthCm} cm reported`}</small></span></button>)}</div>
        </div></div>
        <div hidden={panel !== "plan"}><NavigationPanel gps={gps} reports={reports.filter((r) => r.provenance !== "sample")} onRoutesChange={updateRoutes} onFocusPoint={focusPoint} /></div>
      </aside>
      <section aria-label="Reported waterlogging map" className={theme.mapStage}>
        <MapComponent mode="browse" gps={gps} reportPin={null} onReportPinChange={() => {}} recenterSignal={recenterSignal} reports={reports} focusPin={focusPin} focusPinSignal={focusSignal} routePaths={paths} routeEndpoints={endpoints} routeFocusSignal={routeFocusSignal} tileRetrySignal={tileRetry} onTilesUnavailable={setTilesUnavailable} />
        <div className={`${theme.mapStatus} absolute right-3 top-3 z-[500] flex max-w-[calc(100%-5.5rem)] flex-col items-end gap-1`}>
          <button type="button" onClick={() => { if (gps && !locationError) setRecenterSignal((n) => n + 1); else startLocation(); }} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border bg-surface/95 px-3.5 text-xs font-semibold shadow-lg" aria-label={locationError ? "Retry location" : gps ? "Recenter on my position" : "Finding your location"}>
            <LocateFixed size={16} className={locationError ? "text-danger" : "text-accent"} aria-hidden="true" />
            <span role="status">{locationError ? "Location off · Retry" : gps ? `You · ±${Math.round(gps.accuracyMeters)} m` : "Locating…"}</span>
          </button>
        </div>
        {error || tilesUnavailable ? <div role="status" className="absolute bottom-4 left-3 right-3 z-[600] rounded-xl border border-border bg-surface/95 p-3 text-sm shadow-lg sm:right-auto sm:max-w-md">
          <p>{error || "Map background unavailable. Reports and route selections are kept."}</p>
          <button type="button" className="mt-1 inline-flex min-h-11 items-center gap-2 font-semibold text-accent" onClick={() => { setRefresh((n) => n + 1); setTilesUnavailable(false); setTileRetry((n) => n + 1); }}><RefreshCw size={16} /> Retry</button>
        </div> : null}
      </section>
    </div>
  </div>;
}
