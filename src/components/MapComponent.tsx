"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import { Waves } from "lucide-react";
import { groupLocalReports, type FloodReport, type LocalFloodReport, type LocalReportGroup, type ReportPin } from "../lib/report";
import ReportTimestamp from "./ReportTimestamp";

interface MapComponentProps {
  tileRetrySignal?: number;
  onTilesUnavailable?: (unavailable: boolean) => void;
  gps: { lat: number; lng: number; accuracyMeters: number } | null;
  reportPin: ReportPin | null;
  onReportPinChange: (pin: ReportPin) => void;
  recenterSignal: number;
  /** Shared flood reports. Empty until a backend data source connects. */
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

/** Clearly generic starting view: India at country scale. Never a fake user position. */
const START_VIEW: { center: [number, number]; zoom: number } = {
  center: [22.5, 79.0],
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
function FloodHeatCanvas({ reports }: { reports: FloodReport[] }) {
  const map = useMap();

  useEffect(() => {
    const pane = map.getPanes().overlayPane;
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
        if (reports.length === 0) return;
        ctx.globalCompositeOperation = "source-over";

        // Neighbor-aware density: hotspots with nearby reports paint larger
        // and more opaque, so overlaps composite into deeper blue.
        const pts = reports.map((r) => map.latLngToContainerPoint([r.lat, r.lng]));
        reports.forEach((report, i) => {
          const p = pts[i];
          if (p.x < -120 || p.y < -120 || p.x > size.x + 120 || p.y > size.y + 120)
            return;
          let neighbors = 0;
          for (let j = 0; j < pts.length; j++) {
            if (j === i) continue;
            const dx = pts[j].x - p.x;
            const dy = pts[j].y - p.y;
            if (dx * dx + dy * dy < 70 * 70) neighbors += 1;
          }
          const weight = Math.min(
            report.reportCount + neighbors,
            10,
          );
          const radius = 30 + weight * 7;
          const alpha = Math.min(0.28 + weight * 0.055, 0.75);
          const grad = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, radius);
          grad.addColorStop(0, `rgba(21, 95, 208, ${alpha.toFixed(3)})`);
          grad.addColorStop(0.55, `rgba(21, 95, 208, ${(alpha * 0.55).toFixed(3)})`);
          grad.addColorStop(1, "rgba(21, 95, 208, 0)");
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
  }, [map, reports]);

  return null;
}

function ClickToPlacePin({
  onReportPinChange,
}: {
  onReportPinChange: (pin: ReportPin) => void;
}) {
  useMapEvents({
    click(e) {
      onReportPinChange({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
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
    if (recenterSignal > 0 && gps) {
      const reduceMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        map.setView([gps.lat, gps.lng], Math.max(map.getZoom(), 15), {
          animate: false,
        });
      } else {
        map.flyTo([gps.lat, gps.lng], Math.max(map.getZoom(), 15), {
          duration: 0.8,
        });
      }
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
      const reduceMotion =
        typeof window !== "undefined" &&
        typeof window.matchMedia !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduceMotion) {
        map.setView([focusPin.lat, focusPin.lng], Math.max(map.getZoom(), 15), {
          animate: false,
        });
      } else {
        map.flyTo([focusPin.lat, focusPin.lng], Math.max(map.getZoom(), 15), {
          duration: 0.8,
        });
      }
    }
  }, [focusPinSignal, focusPin, map]);
  return null;
}

function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(el);
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    return () => {
      window.clearTimeout(t);
      observer.disconnect();
    };
  }, [map]);
  return null;
}

export default function MapComponent({
  gps,
  reportPin,
  onReportPinChange,
  recenterSignal,
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
    <MapContainer
      center={START_VIEW.center}
      zoom={START_VIEW.zoom}
      zoomControl
      scrollWheelZoom
      style={{ width: "100%", height: "100%" }}
    >
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

      <FloodHeatCanvas reports={reports} />
      <ClickToPlacePin onReportPinChange={onReportPinChange} />
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
          />
        </>
      ) : null}

      {reports.map((report) => (
        <Marker
          key={report.id}
          position={[report.lat, report.lng]}
          icon={
            waveIcons.get(Math.min(Math.max(report.reportCount, 1), 8)) ??
            floodWaveIcon(report.reportCount)
          }
          keyboard
          title={`Reported flooding near ${report.lat.toFixed(3)}, ${report.lng.toFixed(3)}`}
          alt={`Reported flooding hotspot, ${report.reportCount} report${report.reportCount === 1 ? "" : "s"}`}
        >
          <Popup>
            <div className="min-w-[12rem] text-sm">
              <p className="flex items-center gap-1.5 font-semibold">
                <Waves className="h-4 w-4 shrink-0" aria-hidden="true" />
                Reported flooding
              </p>
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
              <p className="mt-1.5 text-xs font-medium">Avoid crossing.</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {localGroups.map((group) => (
        <LocalReportMarker key={group.id} group={group} selectedId={selectedLocalReportId} selectionSignal={localSelectionSignal} onSelect={onSelectLocalReport} />
      ))}

      {reportPin ? (
        <Marker
          position={[reportPin.lat, reportPin.lng]}
          icon={pinIcon}
          draggable
          keyboard
          title="Report location. Drag to adjust."
          alt="Report location pin"
          eventHandlers={{
            dragend(e) {
              const marker = e.target as L.Marker;
              const pos = marker.getLatLng();
              onReportPinChange({ lat: pos.lat, lng: pos.lng });
            },
          }}
        />
      ) : null}
    </MapContainer>
  );
}
