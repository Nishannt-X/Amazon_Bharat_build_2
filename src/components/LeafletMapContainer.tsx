"use client";

// @refresh reset

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createLeafletContext, LeafletContext } from "@react-leaflet/core";
import L from "leaflet";

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
  const pendingRemoval = useRef<{ cancel: () => void } | null>(null);
  const initialView = useRef({ center, zoom });
  const [context, setContext] = useState<ReturnType<typeof createLeafletContext> | null>(null);

  const attach = useCallback((node: HTMLDivElement | null) => {
    if (!node || mapRef.current) return;
    const map = L.map(node, { zoomControl: true, scrollWheelZoom: true });
    map.setView(initialView.current.center, initialView.current.zoom);
    mapRef.current = map;
    setContext(createLeafletContext(map));
  }, []);

  useEffect(() => {
    let active = true;
    // A new setup cancels the previous teardown before its microtask runs.
    const lifetime = { cancel: () => { active = false; } };
    pendingRemoval.current?.cancel();
    pendingRemoval.current = lifetime;
    return () => {
      queueMicrotask(() => {
        if (!active) return;
        const map = mapRef.current;
        // Effect/ref replay and Fast Refresh are not DOM unmounts. In particular,
        // a refresh can reconnect passive effects after this microtask runs.
        if (!map || map.getContainer().isConnected) return;
        // The detached host means this is a real unmount. Layer cleanup has now
        // completed, so deleting the map panes cannot race child addLayer().
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
