"use client";

import dynamic from "next/dynamic";
import type { ReportPin } from "@/lib/report";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      aria-label="Map is loading"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
      }}
    >
      Map is loading…
    </div>
  ),
});

interface PreviewMapProps {
  gps: { lat: number; lng: number; accuracyMeters: number } | null;
  reportPin: ReportPin | null;
  onReportPinChange: (pin: ReportPin) => void;
  recenterSignal: number;
}

/**
 * Preview-owned wrapper around the existing MapComponent. No edits to the
 * shared component: shared reports stay empty (no fabricated incidents) and
 * no location is invented.
 */
export default function PreviewMap({
  gps,
  reportPin,
  onReportPinChange,
  recenterSignal,
}: PreviewMapProps) {
  return (
    <MapComponent
      gps={gps}
      reportPin={reportPin}
      onReportPinChange={onReportPinChange}
      recenterSignal={recenterSignal}
      reports={[]}
    />
  );
}
