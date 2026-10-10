"use client";

import { useEffect, useMemo } from "react";
import L from "leaflet";
import { useMap } from "react-leaflet";
import { heatAlpha, heatRadiusPx, usableHeatPoints, type HeatPoint } from "../lib/report-heat";

const PANE = "report-heat";
// Above tiles (200), below routes/overlays (400) and markers (600).
const PANE_Z = "380";

const RGB = { light: "37, 99, 235", dark: "59, 130, 246" } as const;

export interface ReportHeatLayerProps {
  /** Any FloodReport-compatible list; only lat/lng/reportCount are read. */
  reports: readonly HeatPoint[];
  /** Match the base map: "dark" uses a lighter blue for contrast on charcoal. */
  tone?: "light" | "dark";
}

/** Soft blue wash showing where reports concentrate. It is not verified
 * depth, risk or live water extent. Non-interactive; markers stay on top. */
export default function ReportHeatLayer({ reports, tone = "light" }: ReportHeatLayerProps) {
  const map = useMap();
  // A new array with identical content must not rebuild the canvas (that blinks).
  const signature = useMemo(
    () => JSON.stringify(usableHeatPoints(reports).map((p) => [p.lat, p.lng, p.reportCount])),
    [reports],
  );

  useEffect(() => {
    const points = (JSON.parse(signature) as [number, number, number][]).map(([lat, lng, reportCount]) => ({ lat, lng, reportCount }));
    if (!points.length) return;
    const pane = map.getPane(PANE) ?? map.createPane(PANE);
    pane.style.zIndex = PANE_Z;
    pane.style.pointerEvents = "none";

    const canvas = L.DomUtil.create("canvas", map.options.zoomAnimation ? "leaflet-zoom-animated" : "") as HTMLCanvasElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.pointerEvents = "none";
    canvas.style.opacity = "1";
    pane.appendChild(canvas);
    let frame = 0;

    const draw = () => {
      frame = 0;
      if (!map.getPane("mapPane")?.isConnected) return;
      const size = map.getSize();
      if (!size.x || !size.y) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(size.x * dpr);
      const h = Math.round(size.y * dpr);
      // Resizing clears and reallocates; only do it when the viewport changed.
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        canvas.style.width = `${size.x}px`;
        canvas.style.height = `${size.y}px`;
      }
      L.DomUtil.setPosition(canvas, map.containerPointToLayerPoint([0, 0]));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.x, size.y);
      const zoom = map.getZoom();
      const rgb = RGB[tone];
      for (const p of points) {
        const at = map.latLngToContainerPoint([p.lat, p.lng]);
        const r = heatRadiusPx(p.reportCount, p.lat, zoom);
        if (at.x < -r || at.y < -r || at.x > size.x + r || at.y > size.y + r) continue;
        const g = ctx.createRadialGradient(at.x, at.y, 0, at.x, at.y, r);
        const a = heatAlpha(p.reportCount);
        g.addColorStop(0, `rgba(${rgb}, ${a})`);
        g.addColorStop(0.55, `rgba(${rgb}, ${a * 0.5})`);
        g.addColorStop(1, `rgba(${rgb}, 0)`);
        ctx.fillStyle = g;
        ctx.fillRect(at.x - r, at.y - r, r * 2, r * 2);
      }
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(draw); };

    map.on("move moveend zoomend resize viewreset", schedule);
    schedule();
    return () => {
      map.off("move moveend zoomend resize viewreset", schedule);
      if (frame) cancelAnimationFrame(frame);
      canvas.remove();
    };
  }, [map, signature, tone]);

  return null;
}
