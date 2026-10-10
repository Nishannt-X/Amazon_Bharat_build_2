/** Pure sizing for the report-concentration wash. Heat encodes how many
 * reports cluster nearby, never depth, risk or live water extent. */

export interface HeatPoint {
  lat: number;
  lng: number;
  reportCount: number;
}

export const HEAT_MIN_RADIUS_PX = 64;
export const HEAT_MAX_RADIUS_PX = 150;

export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Roughly 120–300 m of ground, clamped in pixels so the wash stays
 * localized when zoomed out and never floods the screen when zoomed in. */
export function heatRadiusPx(reportCount: number, lat: number, zoom: number): number {
  const count = Number.isFinite(reportCount) ? Math.min(Math.max(reportCount, 1), 8) : 1;
  const meters = 120 + 25 * (count - 1);
  const px = meters / metersPerPixel(lat, zoom);
  return Math.min(HEAT_MAX_RADIUS_PX, Math.max(HEAT_MIN_RADIUS_PX, px));
}

/** Peak alpha per point; stacking is capped by the layer's own opacity. */
export function heatAlpha(reportCount: number): number {
  const count = Number.isFinite(reportCount) ? Math.min(Math.max(reportCount, 1), 8) : 1;
  return 0.3 + 0.04 * (count - 1);
}

export function usableHeatPoints<T extends HeatPoint>(points: readonly T[]): T[] {
  return points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
}
