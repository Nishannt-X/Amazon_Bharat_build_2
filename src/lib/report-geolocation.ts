import type { GpsFix } from "./report";

export type DeviceFix = GpsFix & { capturedAt: string };
export type LocationFailure = "denied" | "unavailable" | "timeout" | "inaccurate";

/** A network fix locates the map while the precise watch refines it.
 * Permission changes restart acquisition; no coordinates are fabricated.
 */
export function watchDeviceLocation(onFix: (fix: DeviceFix) => void, onError: (reason: LocationFailure) => void) {
  let stopped = false;
  let generation = 0;
  let best: DeviceFix | null = null;
  let permission: PermissionStatus | null = null;
  const handles: { watch?: number; timer?: ReturnType<typeof setTimeout> } = {};
  const clearRequests = () => {
    generation += 1;
    if (handles.watch !== undefined) navigator.geolocation.clearWatch(handles.watch);
    if (handles.timer) clearTimeout(handles.timer);
    handles.watch = undefined;
    handles.timer = undefined;
  };
  const stop = () => {
    stopped = true;
    clearRequests();
    if (permission) permission.onchange = null;
  };
  if (!window.isSecureContext || !("geolocation" in navigator)) {
    queueMicrotask(() => { if (!stopped) onError("unavailable"); });
    return stop;
  }
  function begin() {
    if (stopped) return;
    clearRequests();
    const token = generation;
    let failure: LocationFailure = "timeout";
    const active = () => !stopped && token === generation;
    const accept = (position: GeolocationPosition) => {
      if (!active()) return;
      const { latitude: lat, longitude: lng, accuracy: accuracyMeters } = position.coords;
      if (![lat, lng, accuracyMeters, position.timestamp].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || accuracyMeters < 0 || Date.now() - position.timestamp > 30000 || position.timestamp > Date.now() + 5000) return;
      const fix = { lat, lng, accuracyMeters, capturedAt: new Date(position.timestamp).toISOString() };
      if (!best || accuracyMeters <= best.accuracyMeters || Date.now() - Date.parse(best.capturedAt) > 30000) {
        best = fix;
        onFix(fix);
      }
    };
    const failed = (error: GeolocationPositionError) => {
      if (!active()) return;
      failure = error.code === 1 ? "denied" : error.code === 2 ? "unavailable" : "timeout";
      if (failure === "denied") {
        clearRequests();
        onError("denied");
      }
      // Let the other provider finish before a transient failure becomes final.
    };
    handles.timer = setTimeout(() => {
      if (!active() || (best && best.accuracyMeters <= 100)) return;
      onError(best ? "inaccurate" : failure);
    }, 25000);
    try {
      handles.watch = navigator.geolocation.watchPosition(accept, failed, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      navigator.geolocation.getCurrentPosition(accept, failed, { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 });
    } catch {
      clearRequests();
      onError("unavailable");
    }
  }
  begin();
  // Safari versions without this API still use the browser's geolocation prompt.
  if (navigator.permissions?.query) {
    void navigator.permissions.query({ name: "geolocation" }).then((status) => {
      if (stopped) return;
      permission = status;
      permission.onchange = () => {
        if (permission?.state === "denied") { clearRequests(); onError("denied"); }
        else { best = null; begin(); }
      };
    }).catch(() => { /* Geolocation remains usable when permission inspection is unsupported. */ });
  }
  return stop;
}

export function freshPhotoLocation(onFix: (fix: DeviceFix) => void): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    stop = watchDeviceLocation((fix) => {
      onFix(fix);
      if (fix.accuracyMeters <= 100) { resolve(fix); queueMicrotask(() => stop()); }
    }, (reason) => { reject(new Error(reason)); queueMicrotask(() => stop()); });
  });
}
