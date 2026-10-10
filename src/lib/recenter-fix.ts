import type { DeviceFix } from "./report-geolocation";

/** A crosshair tap may reuse the live fix only while it is this recent. */
export const RECENTER_MAX_AGE_MS = 15000;
export const PRECISE_ACCURACY_METERS = 100;

/** The device fix a recenter may use, or null when a fresh one must be requested.
 * Only a fix the device itself reported qualifies: never a report, sample or default view.
 */
export function usableRecenterFix(fix: DeviceFix | null | undefined, now = Date.now()): DeviceFix | null {
  if (!fix) return null;
  const captured = Date.parse(fix.capturedAt);
  if (![fix.lat, fix.lng, fix.accuracyMeters, captured].every(Number.isFinite) || Math.abs(fix.lat) > 90 || Math.abs(fix.lng) > 180 || fix.accuracyMeters < 0) return null;
  if (now - captured > RECENTER_MAX_AGE_MS || captured > now + 5000) return null;
  return fix;
}

/** Explains a coarse fix (Wi-Fi/cell positioning), or null when the fix is precise. */
export function approximateLocationNote(fix: DeviceFix | null): string | null {
  if (!fix || fix.accuracyMeters <= PRECISE_ACCURACY_METERS) return null;
  return `Approximate location (±${Math.round(fix.accuracyMeters)} m) from Wi-Fi or cell data. The map is centred on the area, not the exact spot. Move outdoors for a precise GPS fix.`;
}
