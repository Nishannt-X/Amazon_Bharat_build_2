import type { GpsFix } from "./report";

export type DeviceFix = GpsFix & { capturedAt: string };
export type LocationFailure = "denied" | "unavailable" | "timeout" | "inaccurate" | "no-response";

/** A network fix locates the map while the precise watch refines it.
 * Permission changes restart acquisition; no coordinates are fabricated.
 */
export function watchDeviceLocation(onFix: (fix: DeviceFix) => void, onError: (reason: LocationFailure) => void) {
  let stopped = false;
  let generation = 0;
  let best: DeviceFix | null = null;
  let permission: PermissionStatus | null = null;
  let blocked = false;
  // Set once a failure was reported, so a later permission grant restarts acquisition.
  let failedOut = false;
  const fail = (reason: LocationFailure) => { failedOut = true; onError(reason); };
  const handles: { watch?: number; timer?: ReturnType<typeof setTimeout>; fallback?: ReturnType<typeof setTimeout> } = {};
  const clearRequests = () => {
    generation += 1;
    if (handles.watch !== undefined) navigator.geolocation.clearWatch(handles.watch);
    if (handles.timer) clearTimeout(handles.timer);
    if (handles.fallback) clearTimeout(handles.fallback);
    handles.watch = undefined;
    handles.timer = undefined;
    handles.fallback = undefined;
  };
  const stop = () => {
    stopped = true;
    clearRequests();
    if (permission) permission.onchange = null;
    if (typeof document !== "undefined") document.removeEventListener("visibilitychange", resume);
  };
  // An embedding page can withhold geolocation from an iframe; the browser then never prompts.
  const policy = typeof document === "undefined" ? undefined : (document as Document & { featurePolicy?: { allowsFeature(name: string): boolean } }).featurePolicy;
  if (!window.isSecureContext || !("geolocation" in navigator) || policy?.allowsFeature("geolocation") === false) {
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
      if (!best || position.timestamp >= Date.parse(best.capturedAt)) {
        best = fix;
        onFix(fix);
      }
    };
    let watching = false;
    const startWatch = () => {
      if (!active() || watching) return;
      watching = true;
      if (handles.fallback) clearTimeout(handles.fallback);
      try {
        handles.watch = navigator.geolocation.watchPosition(accept, failed, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      } catch { clearRequests(); fail("unavailable"); }
    };
    const failed = (error: GeolocationPositionError) => {
      if (!active()) return;
      failure = error.code === 1 ? "denied" : error.code === 2 ? "unavailable" : "timeout";
      if (failure === "denied") {
        blocked = true;
        clearRequests();
        fail("denied");
      }
      // Let the other provider finish before a transient failure becomes final.
    };
    // The watch starts about 12s in with a 20s timeout, so give it room to finish.
    const settle = () => {
      if (!active() || (best && best.accuracyMeters <= 100)) return;
      // The browser's timeout does not run while its permission prompt is open, and some
      // embedded browsers never show one. Stop waiting; the user can ask again by tapping.
      // A weak fix keeps refining; only a missing fix ends the attempt.
      if (best) { onError("inaccurate"); return; }
      clearRequests();
      fail(permission?.state === "prompt" && failure === "timeout" ? "no-response" : failure);
    };
    handles.timer = setTimeout(settle, 33000);
    try {
      // Obtain the first fix before opening the continuous watch. Some device
      // providers do not handle two simultaneous acquisition requests well.
      handles.fallback = setTimeout(startWatch, 12500);
      navigator.geolocation.getCurrentPosition((position) => { accept(position); startWatch(); }, (error) => { failed(error); startWatch(); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
    } catch {
      clearRequests();
      fail("unavailable");
    }
  }
  begin();
  // Phones suspend geolocation in background tabs; resume when the page returns.
  function resume() {
    if (stopped || blocked || failedOut || document.visibilityState !== "visible") return;
    // An attempt still waiting for its first fix keeps its original deadline; restarting it
    // would reset the timer (and re-prompt) on every tab switch, so it could never time out.
    if (!best || Date.now() - Date.parse(best.capturedAt) < 20000) return;
    begin();
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", resume);
  // Safari versions without this API still use the browser's geolocation prompt.
  if (navigator.permissions?.query) {
    void navigator.permissions.query({ name: "geolocation" }).then((status) => {
      if (stopped) return;
      permission = status;
      permission.onchange = () => {
        if (permission?.state === "denied") { blocked = true; clearRequests(); fail("denied"); }
        else if (failedOut && permission?.state === "granted") { blocked = false; failedOut = false; best = null; begin(); }
      };
      if (permission.state === "denied") { blocked = true; clearRequests(); fail("denied"); }
    }).catch(() => { /* Geolocation remains usable when permission inspection is unsupported. */ });
  }
  return stop;
}

export function freshPhotoLocation(onFix: (fix: DeviceFix) => void, signal?: AbortSignal): Promise<DeviceFix> {
  return new Promise((resolve, reject) => {
    let stop = () => {};
    if (signal?.aborted) { reject(new Error("aborted")); return; }
    signal?.addEventListener("abort", () => { stop(); reject(new Error("aborted")); }, { once: true });
    stop = watchDeviceLocation((fix) => {
      onFix(fix);
      if (fix.accuracyMeters <= 100) { resolve(fix); queueMicrotask(() => stop()); }
    }, (reason) => { reject(new Error(reason)); queueMicrotask(() => stop()); });
  });
}
