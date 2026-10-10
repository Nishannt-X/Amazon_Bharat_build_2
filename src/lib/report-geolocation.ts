import type { GpsFix } from "./report";

export type DeviceFix = GpsFix & { capturedAt: string };
export type LocationFailure = "denied" | "unavailable" | "timeout" | "inaccurate";

/** Show an initial network fix, then let the high-accuracy watch refine it.
 * Approximate fixes locate the map; only fresh fixes within 100 m bind evidence.
 */
export function watchDeviceLocation(onFix: (fix: DeviceFix) => void, onError: (reason: LocationFailure) => void) {
  let stopped = false;
  let best: DeviceFix | null = null;
  const handles: { watch?: number; timer?: ReturnType<typeof setTimeout> } = {};
  const stop = () => {
    stopped = true;
    if (handles.watch !== undefined) navigator.geolocation.clearWatch(handles.watch);
    if (handles.timer) clearTimeout(handles.timer);
  };
  if (!window.isSecureContext || !("geolocation" in navigator)) {
    queueMicrotask(() => { if (!stopped) onError("unavailable"); });
    return stop;
  }
  const accept = (position: GeolocationPosition) => {
    if (stopped) return;
    const { latitude: lat, longitude: lng, accuracy: accuracyMeters } = position.coords;
    if (![lat, lng, accuracyMeters, position.timestamp].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracyMeters < 0 || Date.now() - position.timestamp > 30000 || position.timestamp > Date.now() + 5000) return;
    const fix = { lat, lng, accuracyMeters, capturedAt: new Date(position.timestamp).toISOString() };
    if (!best || accuracyMeters <= best.accuracyMeters || Date.now() - Date.parse(best.capturedAt) > 30000) {
      best = fix;
      onFix(fix);
    }
  };
  const failed = (error: GeolocationPositionError) => {
    if (stopped) return;
    if (error.code === 1) { onError("denied"); stop(); }
    // A transient provider error is not final: the other request/watch may succeed.
  };
  handles.watch = navigator.geolocation.watchPosition(accept, failed, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  navigator.geolocation.getCurrentPosition(accept, failed, { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
  handles.timer = setTimeout(() => {
    if (stopped || (best && best.accuracyMeters <= 100)) return;
    onError(best ? "inaccurate" : "timeout");
  }, 25000);
  return stop;
}

export function freshPhotoLocation(onFix: (fix: DeviceFix) => void): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    const stop = watchDeviceLocation((fix) => {
      onFix(fix);
      if (fix.accuracyMeters <= 100) { resolve(fix); queueMicrotask(() => stop?.()); }
    }, (reason) => { reject(new Error(reason)); stop?.(); });
  });
}
