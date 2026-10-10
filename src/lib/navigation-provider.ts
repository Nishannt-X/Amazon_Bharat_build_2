import { assessRoute, intersectingReports, REPORT_BUFFER_METERS, selectLowerExposure, type NavigationResult, type RoadRoute, validNavigationPoint, shouldPrioritizeReport, type NavigationPreference, type NavigationFloodReport } from './navigation';
import { lookupVehicleSpecs } from './vehicle-catalog';
import type { FloodReport, ReportPin, VehicleDetails } from './report';

const OSRM_URL = 'https://router.project-osrm.org';
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car/geojson';
export class NavigationProviderError extends Error {}
export function reportAvoidancePolygons(reports: readonly FloodReport[]) {
  // Circumscribed rectangles contain the full 75 m evidence buffer.
  return { type: 'MultiPolygon', coordinates: reports.map(p => {
    const lat = REPORT_BUFFER_METERS / 111195;
    const lng = lat / Math.max(0.08, Math.cos(p.lat * Math.PI / 180));
    return [[[p.lng-lng,p.lat-lat],[p.lng+lng,p.lat-lat],[p.lng+lng,p.lat+lat],[p.lng-lng,p.lat+lat],[p.lng-lng,p.lat-lat]]];
  }) };
}
async function fetchJson(url: string, init: RequestInit, fetcher: typeof fetch) {
  const response = await fetcher(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new NavigationProviderError('Road routing is unavailable. Try again shortly.');
  const reader = response.body?.getReader();
  if (!reader) throw new NavigationProviderError('Routing returned an empty response.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const {value,done} = await reader.read();
    if(done) break;
    bytes += value.byteLength;
    if(bytes > 4000000) {await reader.cancel();throw new NavigationProviderError('Routing returned too much data. Choose a shorter journey.');}
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new NavigationProviderError('Routing returned invalid data.'); }
}
function parseRoutes(value: unknown, provider: 'osrm'|'openrouteservice'): RoadRoute[] {
  const data = value as {code?:string;routes?: unknown[];features?: unknown[]};
  if (!data || (provider === 'osrm' && data.code !== 'Ok')) throw new NavigationProviderError('No road route was found between these points.');
  const rows = provider === 'osrm' ? data.routes : data.features;
  if (!Array.isArray(rows)) throw new NavigationProviderError('Routing returned invalid data.');
  return rows.slice(0, 3).map((raw, i) => {
    const row = raw as { geometry?: {type?:string;coordinates?:unknown[]}; distance?:number; duration?:number; properties?:{summary?:{distance?:number;duration?:number}} };
    const distance = provider === 'osrm' ? row.distance : row.properties?.summary?.distance;
    const duration = provider === 'osrm' ? row.duration : row.properties?.summary?.duration;
    const coordinates = row.geometry?.coordinates;
    if (row.geometry?.type !== 'LineString' || !Array.isArray(coordinates) || coordinates.length < 2 || coordinates.length > 20000 || !Number.isFinite(distance) || !Number.isFinite(duration) || distance! <= 0 || duration! < 0) throw new NavigationProviderError('Routing returned invalid geometry.');
    const positions = coordinates.map(c => {
      if (!Array.isArray(c) || !validNavigationPoint({lat:c[1],lng:c[0]})) throw new NavigationProviderError('Routing returned invalid coordinates.');
      return [c[1], c[0]] as [number,number];
    });
    return { id: `${provider}-${i}`, positions, distanceMeters: distance!, durationSeconds: duration! };
  });
}
export async function getNavigationRoutes(start: ReportPin, end: ReportPin, reports: readonly NavigationFloodReport[], vehicle: VehicleDetails, options: { orsKey?: string; fetcher?: typeof fetch; preference?: NavigationPreference } = {}): Promise<NavigationResult> {
  const fetcher = options.fetcher ?? fetch;
  const provider = options.orsKey ? 'openrouteservice' : 'osrm';
  const ors = async (avoid?: readonly FloodReport[]) => parseRoutes(await fetchJson(ORS_URL, {method:'POST', headers:{Authorization:options.orsKey!, 'Content-Type':'application/json'}, body: JSON.stringify({coordinates:[[start.lng,start.lat],[end.lng,end.lat]], ...(avoid?.length ? {options:{avoid_polygons:reportAvoidancePolygons(avoid)}} : {})})}, fetcher), provider);
  const base = provider === 'openrouteservice' ? await ors() : parseRoutes(await fetchJson(`${OSRM_URL}/route/v1/driving/${start.lng},${start.lat};${end.lng},${end.lat}?alternatives=true&overview=full&geometries=geojson&steps=false`, {}, fetcher), provider);
  if (!base.length) throw new NavigationProviderError('No road route was found.');
  let warning = provider === 'osrm' ? 'Public OSRM demo: driving routes only; alternatives are checked against supplied reports. It cannot request flood avoidance or account for vehicle restrictions.' : 'Driving routes from openrouteservice. Report buffers are approximate; vehicle access restrictions and current road conditions are unverified.';
  const specs = lookupVehicleSpecs(vehicle);
  const prioritized = intersectingReports(base[0], reports, 1000).filter(r=>shouldPrioritizeReport(r,options.preference,specs));
  let avoidanceAttempted = false;
  if (provider === 'openrouteservice' && intersectingReports(base[0], prioritized).length) {
    avoidanceAttempted = true;
    try { if (prioritized.length > 100) throw new NavigationProviderError('Too many avoidance areas.'); const avoided = await ors(prioritized); base.push(...avoided.map((r,i) => ({...r,id:`ors-avoid-${i}`}))); }
    catch { warning += ' The avoidance request failed or too many nearby report areas were present; original route remains available with warnings.'; }
  }
  const routes = base.map(r => assessRoute(r, reports, vehicle, options.preference));
  const selected = selectLowerExposure(routes)!;
  return {provider, routes, selectedId:selected.id, rerouted:selected.id !== routes[0].id && selected.exposure.priorityCount < routes[0].exposure.priorityCount || (selected.id !== routes[0].id && selected.exposure.reportCount < routes[0].exposure.reportCount), avoidanceAttempted, warning};
}
