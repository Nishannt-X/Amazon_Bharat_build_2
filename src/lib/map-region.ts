/** Viewport/service envelope for the India prototype. This is not a political
 * boundary polygon. Users can pan/zoom outside it; automatic GPS focus cannot.
 */
export const INDIA_BOUNDS = { south: 6.5, west: 68, north: 37.5, east: 97.5 };
export function inIndiaMapArea(point: { lat: number; lng: number }) {
  return point.lat >= INDIA_BOUNDS.south && point.lat <= INDIA_BOUNDS.north && point.lng >= INDIA_BOUNDS.west && point.lng <= INDIA_BOUNDS.east;
}
