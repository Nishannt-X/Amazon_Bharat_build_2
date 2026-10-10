"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Circle,
  Marker,
  Popup,
  Polyline,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Waves } from "lucide-react";
import { groupLocalReports, type FloodReport, type LocalFloodReport, type LocalReportGroup, type ReportPin, type SharedWaterlogReport } from "../lib/report";
import ReportTimestamp from "./ReportTimestamp";
import { INDIA_BOUNDS, inIndiaMapArea } from "../lib/map-region";
import LeafletMapContainer from "./LeafletMapContainer";

interface MapComponentProps {
  mode?: "browse" | "report";
  reportingLocked?: boolean;
  readOnly?: boolean;
  heatMode?: "density" | "depth";
  overviewSignal?: number;
  routePaths?: { id: string; positions: [number, number][]; color?: string; dashed?: boolean }[];
  routeEndpoints?: { start: ReportPin; end: ReportPin } | null;
  routeFocusSignal?: number;
  tileRetrySignal?: number;
  onTilesUnavailable?: (unavailable: boolean) => void;
  gps: { lat: number; lng: number; accuracyMeters: number } | null;
  reportPin: ReportPin | null;
  onReportPinChange: (pin: ReportPin) => void;
  recenterSignal: number;
  /** Persisted community reports loaded by the map screen. */
  reports?: FloodReport[];
  localReports?: LocalFloodReport[];
  selectedLocalReportId?: string | null;
  localSelectionSignal?: number;
  onSelectLocalReport?: (id: string) => void;
  /** Explicit search-selection focus target. Only a selection bumps
   *  focusPinSignal; manual drag/click never recenters automatically. */
  focusPin?: ReportPin | null;
  focusPinSignal?: number;
}

/** Generic world view. Device position is shown only after real GPS permission. */
const START_VIEW: { center: [number, number]; zoom: number } = {
  center: [22.8, 79],
  zoom: 5,
};

/** Lucide `Waves` (waves-horizontal) paths, mirrored for the Leaflet divIcon
 *  HTML string where the React component cannot render. Same 24x24 grid,
 *  stroke, and round caps as the lucide-react `Waves` component used in
 *  popups below — never an emoji.
 */
const WAVES_PATHS = [
  "M2 12q2.5 2 5 0t5 0 5 0 5 0",
  "M2 19q2.5 2 5 0t5 0 5 0 5 0",
  "M2 5q2.5 2 5 0t5 0 5 0 5 0",
];

function wavesSvg(size: number): string {
  const paths = WAVES_PATHS.map(
    (d) =>
      `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;
}

function gpsDotIcon(): L.DivIcon {
  return L.divIcon({
    className: "ff-gps-dot",
    html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:var(--accent);border:3px solid #ffffff;box-shadow:0 1px 6px rgb(0 0 0 / 0.45)"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

function reportPinIcon(): L.DivIcon {
  return L.divIcon({
    className: "ff-report-pin",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:9999px;background:var(--accent);color:var(--accent-foreground);border:3px solid #fff;box-shadow:0 2px 10px rgb(0 0 0 / 0.45);font-size:18px;font-weight:700;line-height:1">!</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

/** Wave hotspot marker: deliberately distinct from the GPS dot and the "!"
 *  report pin — deeper blue disc, white ring, centered Lucide wave glyph.
 *  Density deepens the disc for hotspots with more overlapping reports.
 */
function floodWaveIcon(reportCount: number): L.DivIcon {
  const density = Math.min(Math.max(reportCount, 1), 8);
  // Deeper blue as overlapping reports accumulate (light-theme base #0b3d91
  // toward #061f4d); white ring + white glyph stay legible in both themes.
  const mix = (density - 1) / 7;
  const r = Math.round(11 + (6 - 11) * mix);
  const g = Math.round(61 + (31 - 61) * mix);
  const b = Math.round(145 + (77 - 145) * mix);
  const size = 40 + Math.min(density - 1, 4) * 2;
  return L.divIcon({
    className: "ff-flood-wave",
    html: `<span style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:rgb(${r} ${g} ${b});color:#ffffff;border:3px solid #ffffff;box-shadow:0 2px 12px rgb(0 0 0 / 0.5),0 0 0 ${4 + density}px rgb(29 95 194 / 0.25)">${wavesSvg(22)}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/**
 * Lightweight density heat overlay: a single canvas in Leaflet's overlayPane
 * (below markers), repainted on pan/zoom/resize. Each report paints a blue
 * radial wash; overlapping washes composite into deeper blue, so dense
 * hotspots read denser. Nothing paints when `reports` is empty — no
 * decorative whole-map gradient.
 */
function FloodHeatCanvas({ reports, heatMode }: { reports: FloodReport[]; heatMode: "density" | "depth" }) {
  const map = useMap();

  useEffect(() => {
    const pane = map.getPanes().overlayPane;
    if (!pane) return;
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "absolute";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "1";
    pane.appendChild(canvas);
    const rawCtx = canvas.getContext("2d");
    if (!rawCtx) {
      return () => {
        if (pane.contains(canvas)) pane.removeChild(canvas);
      };
    }
    const ctx: CanvasRenderingContext2D = rawCtx;

    let raf = 0;

    function paint() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!map.getPane("mapPane")?.isConnected) return;
        const size = map.getSize();
        const dpr =
          typeof window !== "undefined"
            ? Math.min(window.devicePixelRatio || 1, 2)
            : 1;
        canvas.width = Math.max(1, Math.floor(size.x * dpr));
        canvas.height = Math.max(1, Math.floor(size.y * dpr));
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size.x, size.y);
        if (reports.length === 0 || map.getZoom() >= 13) return;
        ctx.globalCompositeOperation = "source-over";

        // Neighbor-aware density: hotspots with nearby reports paint larger
        // and more opaque, so overlaps composite into deeper blue.
        const visible = reports.map((report) => ({ report, point: map.latLngToContainerPoint([report.lat, report.lng]) }))
          .filter(({ point }) => point.x >= -120 && point.y >= -120 && point.x <= size.x + 120 && point.y <= size.y + 120);
        const cells = new Map<string, typeof visible>();
        for (const item of visible) {
          const key = `${Math.floor(item.point.x / 70)},${Math.floor(item.point.y / 70)}`;
          const cell = cells.get(key);
          if (cell) cell.push(item); else cells.set(key, [item]);
        }
        visible.forEach(({ report, point: p }) => {
          const unknownDepth = heatMode === "depth" && report.observedDepthCm == null;
          let neighbors = 0;
          const cellX = Math.floor(p.x / 70), cellY = Math.floor(p.y / 70);
          // Saturate at ten neighbors: the visual scale is bounded, so dense
          // cities do not require quadratic comparisons on every map movement.
          neighborSearch: for (let x = cellX - 1; x <= cellX + 1; x++) {
            for (let y = cellY - 1; y <= cellY + 1; y++) {
              for (const candidate of cells.get(`${x},${y}`) ?? []) {
                if (candidate.report.id === report.id) continue;
                const dx = candidate.point.x - p.x, dy = candidate.point.y - p.y;
                if (dx * dx + dy * dy < 70 * 70) neighbors += 1;
                if (neighbors >= 10) break neighborSearch;
              }
            }
          }
          const weight = heatMode === "depth"
            ? unknownDepth ? 1 : Math.min((report.observedDepthCm ?? 0) / 10, 10)
            : Math.min(report.reportCount + neighbors, 10);
          const radius = heatMode === "depth" ? 55 : 30 + weight * 7;
          const alpha = Math.min(0.28 + weight * 0.055, 0.75);
          const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, radius);
          const color = unknownDepth ? "120, 128, 140" : "21, 95, 208";
          grad.addColorStop(0, `rgba(${color}, ${alpha.toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(${color}, ${(alpha * 0.55).toFixed(3)})`);
          grad.addColorStop(1, `rgba(${color}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    paint();
    map.on("moveend zoomend resize viewreset move zoom", paint);
    return () => {
      cancelAnimationFrame(raf);
      map.off("moveend zoomend resize viewreset move zoom", paint);
      if (pane.contains(canvas)) pane.removeChild(canvas);
    };
  }, [map, reports, heatMode]);

  return null;
}

function ZoomObserver({ onZoom }: { onZoom: (zoom: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => { onZoom(map.getZoom()); }, [map, onZoom]);
  return null;
}

function FocusRoute({ paths, signal }: { paths: NonNullable<MapComponentProps["routePaths"]>; signal: number }) {
  const map = useMap();
  const consumed = useRef(0);
  useEffect(() => {
    if (consumed.current === signal) return;
    consumed.current = signal;
    const points = paths.flatMap((p) => p.positions);
    if (signal && points.length && map.getPane("mapPane")?.isConnected) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 16, animate: false });
  }, [map, paths, signal]);
  return null;
}

function IndiaOverview({ signal }: { signal: number }) {
  const map = useMap();
  const consumed = useRef<number | null>(null);
  useEffect(() => {
    if (consumed.current === signal) return;
    consumed.current = signal;
    if (map.getPane("mapPane")?.isConnected) map.fitBounds([[INDIA_BOUNDS.south, INDIA_BOUNDS.west], [INDIA_BOUNDS.north, INDIA_BOUNDS.east]], { padding: [24, 24], animate: false });
  }, [map, signal]);
  return null;
}

function RecenterOnGps({
  gps,
  recenterSignal,
}: {
  gps: MapComponentProps["gps"];
  recenterSignal: number;
}) {
  const map = useMap();
  const consumedSignal = useRef(0);
  useEffect(() => {
    // A new GPS fix alone must not replay an earlier recenter request.
    if (consumedSignal.current === recenterSignal) return;
    consumedSignal.current = recenterSignal;
    if (recenterSignal > 0 && gps && inIndiaMapArea(gps)) {
      if (!map.getPane("mapPane")?.isConnected) return;
      map.setView([gps.lat, gps.lng], gps.accuracyMeters > 1000 ? 10 : gps.accuracyMeters > 100 ? 12 : 15, { animate: false });
    }
  }, [recenterSignal, gps, map]);
  return null;
}

function LocalReportMarker({ group, selectedId, selectionSignal, onSelect }: {
  group: LocalReportGroup;
  selectedId: string | null;
  selectionSignal: number;
  onSelect?: (id: string) => void;
}) {
  const report = group.reports.find((item) => item.id === selectedId) ?? group.reports[0];
  const selected = group.reports.some((item) => item.id === selectedId);
  const markerRef = useRef<L.Marker | null>(null);
  const icon = useMemo(() => floodWaveIcon(group.reports.length), [group.reports.length]);
  useEffect(() => {
    if (selected) markerRef.current?.openPopup();
    else markerRef.current?.closePopup();
  }, [selected, selectionSignal]);
  return (
    <Marker ref={markerRef} position={[group.anchor.lat, group.anchor.lng]} icon={icon} keyboard
      title={`${group.reports.length} local report${group.reports.length === 1 ? "" : "s"}: ${report.locationLabel}`} alt={`Local flood reports at ${report.locationLabel}`}
      eventHandlers={{ click: () => onSelect?.(report.id) }}>
      <Popup>
        <div className="w-56 max-w-full text-sm">
          <p className="font-semibold">Local report · Not shared</p>
          {group.reports.length > 1 ? <div className="mt-2">
            <p className="text-xs">{group.reports.length} reports within 25 m of the first pin. Each photo is kept.</p>
            <div className="mt-1 flex flex-wrap gap-1" aria-label="Reports near this spot">
              {group.reports.map((item, index) => <button key={item.id} type="button" aria-pressed={item.id === report.id} onClick={() => onSelect?.(item.id)} className="min-h-11 min-w-11 rounded-lg border border-border px-2 text-xs">Photo {index + 1}</button>)}
            </div>
          </div> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={report.photoUrl} alt={`Flood photo: ${report.photoName}`} className="mt-2 h-32 w-full rounded-lg object-cover" />
          <p className="mt-2 break-words font-medium">{report.locationLabel}</p>
          <p className="ff-coords !text-xs">{report.lat.toFixed(5)}, {report.lng.toFixed(5)}</p>
          <p className="mt-1 break-words">{report.vehicle.make} {report.vehicle.model} · {report.vehicle.year}{report.vehicle.variant ? ` · ${report.vehicle.variant}` : ""}</p>
          <ReportTimestamp reportedAt={report.reportedAt} />
          <p className="mt-2 border-t border-border pt-2 font-semibold">Unable to assess · Avoid crossing</p>
        </div>
      </Popup>
    </Marker>
  );
}

function RecenterOnFocusPin({
  focusPin,
  focusPinSignal,
}: {
  focusPin: ReportPin | null | undefined;
  focusPinSignal: number | undefined;
}) {
  const map = useMap();
  useEffect(() => {
    if ((focusPinSignal ?? 0) > 0 && focusPin) {
      if (!map.getPane("mapPane")?.isConnected) return;
      map.setView([focusPin.lat, focusPin.lng], Math.max(map.getZoom(), 15), { animate: false });
    }
  }, [focusPinSignal, focusPin, map]);
  return null;
}

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    let frame = 0;
    const resize = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        if (el.isConnected && map.getPane("mapPane")?.isConnected) map.invalidateSize({ pan: false, debounceMoveend: true });
      });
    };
    const onVisibility = () => { if (!document.hidden) resize(); };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(resize);
    observer?.observe(el);
    window.addEventListener("pageshow", resize);
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", onVisibility);
    resize();
    const t = window.setTimeout(resize, 250);
    return () => {
      window.clearTimeout(t);
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("pageshow", resize);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [map]);
  return null;
}

export default function MapComponent({
  gps,
  reportPin,
  recenterSignal,
  mode = "browse",
  heatMode = "density",
  overviewSignal = 0,
  routePaths = [],
  routeEndpoints = null,
  routeFocusSignal = 0,
  tileRetrySignal = 0,
  onTilesUnavailable,
  reports = [],
  localReports = [],
  selectedLocalReportId = null,
  localSelectionSignal = 0,
  onSelectLocalReport,
  focusPin = null,
  focusPinSignal = 0,
}: MapComponentProps) {
  const tileCycleFailed = useRef(false);
  const [zoom, setZoom] = useState(START_VIEW.zoom);
  const localGroups = useMemo(() => groupLocalReports(localReports), [localReports]);
  const gpsIcon = useMemo(() => gpsDotIcon(), []);
  const pinIcon = useMemo(() => reportPinIcon(), []);
  const waveIcons = useMemo(() => {
    const cache = new Map<number, L.DivIcon>();
    for (const r of reports) {
      const bucket = Math.min(Math.max(r.reportCount, 1), 8);
      if (!cache.has(bucket)) cache.set(bucket, floodWaveIcon(bucket));
    }
    return cache;
  }, [reports]);

  return (
    <LeafletMapContainer center={START_VIEW.center} zoom={START_VIEW.zoom}>
      <TileLayer
        key={tileRetrySignal}
        eventHandlers={{
          loading: () => { tileCycleFailed.current = false; },
          tileerror: () => {
            tileCycleFailed.current = true;
            onTilesUnavailable?.(true);
          },
          load: () => onTilesUnavailable?.(tileCycleFailed.current),
        }}
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />

      <FloodHeatCanvas reports={reports} heatMode={heatMode} />
      <ZoomObserver onZoom={setZoom} />
      <IndiaOverview signal={overviewSignal} />
      <FocusRoute paths={routePaths} signal={routeFocusSignal} />
      {routePaths.map((path) => <Polyline key={path.id} positions={path.positions} pathOptions={{ color: path.color ?? "#20a56a", weight: 5, opacity: 0.85, dashArray: path.dashed ? "8 10" : undefined }} />)}
      {routeEndpoints ? <>
        <Marker position={[routeEndpoints.start.lat, routeEndpoints.start.lng]} icon={gpsIcon}><Popup>Route start</Popup></Marker>
        <Marker position={[routeEndpoints.end.lat, routeEndpoints.end.lng]} icon={pinIcon}><Popup>Route destination</Popup></Marker>
      </> : null}
      <RecenterOnGps gps={gps} recenterSignal={recenterSignal} />
      <RecenterOnFocusPin focusPin={focusPin} focusPinSignal={focusPinSignal} />
      <InvalidateOnResize />

      {gps ? (
        <>
          <Circle
            center={[gps.lat, gps.lng]}
            radius={Math.max(gps.accuracyMeters, 10)}
            pathOptions={{
              color: "#155FD0",
              weight: 1.5,
              fillColor: "#155FD0",
              fillOpacity: 0.15,
            }}
          />
          <Marker
            position={[gps.lat, gps.lng]}
            icon={gpsIcon}
            keyboard={false}
            interactive={false}
            alt="Your position"
            zIndexOffset={1000}
          ><Tooltip permanent direction="right" offset={[12, 0]}>You are here</Tooltip></Marker>
        </>
      ) : null}

      {zoom >= 13 ? reports.map((report) => (
        <Marker
          key={report.id}
          position={[report.lat, report.lng]}
          icon={
            waveIcons.get(Math.min(Math.max(report.reportCount, 1), 8)) ??
            floodWaveIcon(report.reportCount)
          }
          keyboard
          title={"locationLabel" in report ? `${(report as SharedWaterlogReport).locationLabel}${(report as SharedWaterlogReport).provenance === "sample" ? " · Sample" : ""}` : `Reported waterlogging near ${report.lat.toFixed(3)}, ${report.lng.toFixed(3)}`}
          alt={`Reported waterlogging hotspot, ${report.reportCount} report${report.reportCount === 1 ? "" : "s"}`}
        >
          <Popup>
            <div className="min-w-[12rem] text-sm">
              <p className="flex items-center gap-1.5 font-semibold">
                <Waves className="h-4 w-4 shrink-0" aria-hidden="true" />
                Reported waterlogging
              </p>
              {"provenance" in report && report.provenance === "sample" ? <p className="mt-2 rounded-md bg-amber-100 p-2 text-xs font-semibold text-amber-950">SAMPLE INCIDENT · Illustrative location, depth and photo. Not a live report.</p> : null}
              <p className="ff-coords mt-1 !text-xs">
                {report.lat.toFixed(4)}, {report.lng.toFixed(4)}
              </p>
              <p className="mt-1 text-xs">
                {report.reportCount} report{report.reportCount === 1 ? "" : "s"}
                {" · "}
                {new Date(report.reportedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
              {"photoUrl" in report ? <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={(report as SharedWaterlogReport).photoUrl} alt="Community waterlogging evidence" className="mt-2 h-32 w-56 rounded-lg object-cover" />
                <p className="mt-1">{(report as SharedWaterlogReport).locationLabel}</p>
                {(report as SharedWaterlogReport).provenance !== "sample" ? <p className="mt-1 text-xs">GPS ±{Math.round((report as SharedWaterlogReport).gps.accuracyMeters)} m · {(report as SharedWaterlogReport).photoSource === "camera" ? "Camera submission" : "Uploaded photo"}</p> : null}
                <p className="mt-1 text-xs">{(report as SharedWaterlogReport).provenance === "sample" ? "Illustrative sample photo · Not captured at this location" : "Community report · Location and photo unverified"}</p>
              </> : null}
              <p className="mt-1 text-xs">{report.observedDepthCm == null ? "Water depth unknown" : `User observed depth: ${report.observedDepthCm} cm · Unverified`}</p>
              <ReportTimestamp reportedAt={report.reportedAt} />
              <p className="mt-1.5 text-xs font-medium">Past evidence, not current road safety. Avoid crossing.</p>
            </div>
          </Popup>
        </Marker>
      )) : null}

      {localGroups.map((group) => (
        <LocalReportMarker key={group.id} group={group} selectedId={selectedLocalReportId} selectionSignal={localSelectionSignal} onSelect={onSelectLocalReport} />
      ))}

      {mode === "report" && reportPin ? (
        <Marker
          position={[reportPin.lat, reportPin.lng]}
          icon={pinIcon}
          draggable={false}
          keyboard
          title="Report location locked to photo GPS."
          alt="Report location pin"

        />
      ) : null}
    </LeafletMapContainer>
  );
}
