"use client";

// @refresh reset

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createLeafletContext, LeafletContext } from "@react-leaflet/core";
import L from "leaflet";

const reduceMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Touch pinch is Leaflet's touchZoom. Laptop trackpad pinch arrives as ctrl+wheel
 * (Chrome/Firefox/Edge) or Safari gesture events; plain wheel scrolling is untouched.
 * Input is coalesced to one continuous, focal-point zoom per animation frame.
 * Returns a teardown that removes every listener and pending frame.
 */
function enableTrackpadPinch(map: L.Map, node: HTMLElement) {
  const abort = new AbortController();
  const { signal } = abort;
  let frame = 0;
  let pendingZoomDelta = 0;
  let focal: L.Point | null = null;
  let touching = false;
  let settleTimer = 0;
  let moving = false;
  // Leaflet's own touch-pinch path: _move with {pinch:true} keeps the existing
  // tile levels (no prune/abort at integer crossings), so tiles never blank
  // mid-gesture. A plain setZoomAround would rebuild the tile level each time.
  const internal = map as unknown as {
    _animatingZoom?: boolean;
    _moveStart(zoomChanged: boolean, noMoveStart: boolean): void;
    _moveEnd(zoomChanged: boolean): void;
    _move(center: L.LatLng, zoom: number, data: object, suppress?: boolean): void;
    _limitZoom(zoom: number): number;
  };
  const animating = () => !!internal._animatingZoom;
  const endGesture = () => {
    if (!moving) return;
    moving = false;
    if (map.getPane("mapPane")?.isConnected) internal._moveEnd(true);
  };
  // Once input stops, ease to the nearest whole level in ONE animated commit so
  // tiles are crisp again, rather than leaving the map between tile levels.
  const settle = () => {
    settleTimer = 0;
    if (!focal || !map.getPane("mapPane")?.isConnected || pendingZoomDelta) return;
    if (animating()) { map.once("zoomend", queueSettle); return; }
    endGesture();
    const target = Math.round(map.getZoom());
    if (Math.abs(target - map.getZoom()) < 0.05) return;
    map.setZoomAround(focal, target, { animate: !reduceMotion() });
  };
  const queueSettle = () => { window.clearTimeout(settleTimer); settleTimer = window.setTimeout(settle, 180); };
  const flush = () => {
    frame = 0;
    if (!focal || !pendingZoomDelta || !map.getPane("mapPane")?.isConnected) { pendingZoomDelta = 0; return; }
    // Leaflet ignores new zoom requests mid-animation and would later jump back
    // to the animated target; hold the pinch input until that zoom finishes.
    if (animating()) { map.once("zoomend", () => { if (!frame && pendingZoomDelta) frame = requestAnimationFrame(flush); }); return; }
    const delta = Math.max(-2, Math.min(2, pendingZoomDelta));
    pendingZoomDelta = 0;
    const from = map.getZoom();
    const zoom = internal._limitZoom(from + delta);
    if (zoom === from) { queueSettle(); return; }
    if (!moving) { map.stop(); internal._moveStart(true, false); moving = true; }
    // Same focal-point math as Map.setZoomAround.
    const scale = map.getZoomScale(zoom, from);
    const half = map.getSize().divideBy(2);
    const center = map.containerPointToLatLng(half.add(focal.subtract(half).multiplyBy(1 - 1 / scale)));
    internal._move(center, zoom, { pinch: true, round: false });
    queueSettle();
  };
  const queue = (zoomDelta: number, point: L.Point) => {
    pendingZoomDelta += zoomDelta;
    focal = point;
    if (!frame) frame = requestAnimationFrame(flush);
  };
  // Touch pinch already belongs to Leaflet; Safari iOS also emits gesture events for it.
  const touch = (e: TouchEvent) => { touching = e.touches.length > 0; };
  for (const type of ["touchstart", "touchend", "touchcancel"]) node.addEventListener(type, touch as EventListener, { passive: true, signal });

  node.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault(); // otherwise the browser zooms the whole page
    const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 100 : e.deltaY;
    queue(-px / 100, map.mouseEventToContainerPoint(e));
  }, { passive: false, signal });

  let lastScale = 1;
  const gesturePoint = (e: Event) => {
    const { clientX, clientY } = e as unknown as { clientX?: number; clientY?: number };
    const rect = node.getBoundingClientRect();
    return Number.isFinite(clientX) && Number.isFinite(clientY) ? L.point(clientX! - rect.left, clientY! - rect.top) : map.getSize().divideBy(2);
  };
  node.addEventListener("gesturestart", (e) => { e.preventDefault(); lastScale = 1; }, { signal });
  node.addEventListener("gesturechange", (e) => {
    e.preventDefault();
    if (touching) return;
    const scale = (e as unknown as { scale: number }).scale;
    if (!(scale > 0)) return;
    queue(Math.log2(scale / lastScale), gesturePoint(e));
    lastScale = scale;
  }, { signal });
  node.addEventListener("gestureend", (e) => e.preventDefault(), { signal });

  return () => { abort.abort(); if (frame) cancelAnimationFrame(frame); window.clearTimeout(settleTimer); map.off("zoomend", queueSettle); endGesture(); frame = 0; pendingZoomDelta = 0; };
}

/** A Leaflet map belongs to its DOM host, not to an effect setup. React can
 * disconnect and reconnect effects while retaining both that host and context.
 * Removing a connected map deletes the panes that retained layers still use.
 */
export default function LeafletMapContainer({ center, zoom, children }: {
  center: L.LatLngExpression;
  zoom: number;
  children: ReactNode;
}) {
  const mapRef = useRef<L.Map | null>(null);
  const stopGestures = useRef<(() => void) | null>(null);
  const pendingRemoval = useRef<{ cancel: () => void } | null>(null);
  const initialView = useRef({ center, zoom });
  const [context, setContext] = useState<ReturnType<typeof createLeafletContext> | null>(null);

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, { zoomControl: true, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: true, zoomAnimation: !reduceMotion(), fadeAnimation: false, markerZoomAnimation: !reduceMotion(), zoomSnap: 0.1, zoomDelta: 1, wheelPxPerZoomLevel: 120 });
    map.setView(initialView.current.center, initialView.current.zoom);
    mapRef.current = map;
    stopGestures.current = enableTrackpadPinch(map, node);
    setContext(createLeafletContext(map));
  }, []);

  useEffect(() => {
    let active = true;
    // A new setup cancels the previous teardown before its microtask runs.
    const lifetime = { cancel: () => { active = false; } };
    pendingRemoval.current?.cancel();
    pendingRemoval.current = lifetime;
    return () => {
      // Cancel movement while React hides or disconnects this map's effects.
      if (mapRef.current?.getPane("mapPane")) mapRef.current.stop();
      queueMicrotask(() => {
        if (!active) return;
        const map = mapRef.current;
        // Effect/ref replay and Fast Refresh are not DOM unmounts. In particular,
        // a refresh can reconnect passive effects after this microtask runs.
        if (!map || map.getContainer().isConnected) return;
        // The detached host means this is a real unmount. Layer cleanup has now
        // completed, so deleting the map panes cannot race child addLayer().
        stopGestures.current?.(); stopGestures.current = null;
        map.remove();
        if (mapRef.current === map) mapRef.current = null;
      });
    };
  }, []);

  return (
    <div ref={attach} style={{ width: "100%", height: "100%" }}>
      {context ? <LeafletContext value={context}>{children}</LeafletContext> : null}
    </div>
  );
}
