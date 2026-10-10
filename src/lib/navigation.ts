import type { FloodReport, ReportPin, VehicleDetails } from './report';
import { lookupVehicleSpecs, type SpecLookupResult } from './vehicle-catalog';

export type NavigationPosition = [number, number]; // latitude, longitude
export interface NavigationMapPath { id: string; positions: NavigationPosition[]; color?: string; dashed?: boolean }
export interface RoadRoute { id: string; positions: NavigationPosition[]; distanceMeters: number; durationSeconds: number }
export interface NavigationFloodReport extends FloodReport { observedDepthCm?: number | null }
export interface NavigationPreference { avoidanceDepthCm?: number | null }
export interface RouteExposure { reportIds: string[]; reportCount: number; priorityCount: number; assessment: 'no-reports-near-route' | 'unknown-avoid' | 'reported-avoid'; message: string }
export interface AssessedRoute extends RoadRoute { exposure: RouteExposure }
export interface NavigationResult { provider: 'osrm' | 'openrouteservice'; routes: AssessedRoute[]; selectedId: string; rerouted: boolean; avoidanceAttempted: boolean; warning: string }
export const REPORT_BUFFER_METERS = 75;

export function validNavigationPoint(value: unknown): value is ReportPin {
  if (!value || typeof value !== 'object') return false;
  const p = value as ReportPin;
  return Number.isFinite(p.lat) && Math.abs(p.lat) <= 85 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
}

/** Local equirectangular segment distance, with longitude wrapped at the date line.
 * Testing full segments prevents missing reports between sparse road vertices. */
export function pointSegmentDistanceMeters(point: ReportPin, a: NavigationPosition, b: NavigationPosition): number {
  const wrap = (n: number) => ((n + 540) % 360) - 180;
  const scale = Math.cos(point.lat * Math.PI / 180);
  const x1 = wrap(a[1] - point.lng) * scale * 111195;
  const y1 = (a[0] - point.lat) * 111195;
  const x2 = x1 + wrap(b[1] - a[1]) * scale * 111195;
  const y2 = (b[0] - point.lat) * 111195;
  const dx = x2 - x1, dy = y2 - y1;
  const t = Math.max(0, Math.min(1, -(x1 * dx + y1 * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x1 + t * dx, y1 + t * dy);
}
export function intersectingReports(route: RoadRoute, reports: readonly FloodReport[], buffer = REPORT_BUFFER_METERS): FloodReport[] {
  if (route.positions.length < 2) return [];
  const latitudes = route.positions.map(p=>p[0]);
  const longitudes = route.positions.map(p=>p[1]);
  const minLat = Math.min(...latitudes), maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes), maxLng = Math.max(...longitudes);
  const latPad = buffer / 111195;
  const lngPad = latPad / Math.max(0.08,Math.cos(Math.min(85,Math.max(Math.abs(minLat),Math.abs(maxLat))+latPad) * Math.PI/180));
  const crossesDateLine = maxLng - minLng > 180;
  const candidates = reports.filter(report => validNavigationPoint(report) && report.lat >= minLat-latPad && report.lat <= maxLat+latPad && (crossesDateLine || (report.lng >= minLng-lngPad && report.lng <= maxLng+lngPad)));
  if (crossesDateLine) return candidates.filter(report=>route.positions.some((p,i)=>i>0&&pointSegmentDistanceMeters(report,route.positions[i-1],p)<=buffer));
  // Index evidence in fixed geographic cells so a dense city's feed does
  // not require comparing every report with every road vertex.
  const cell = 0.01;
  const grid = new Map<string, number[]>();
  candidates.forEach((report,index)=>{
    const key = `${Math.floor(report.lat/cell)},${Math.floor(report.lng/cell)}`;
    const bucket=grid.get(key)??[];bucket.push(index);grid.set(key,bucket);
  });
  const hits = new Set<number>();
  for (let i=1;i<route.positions.length;i++) {
    const a=route.positions[i-1],b=route.positions[i];
    const south=Math.floor((Math.min(a[0],b[0])-latPad)/cell), north=Math.floor((Math.max(a[0],b[0])+latPad)/cell);
    const west=Math.floor((Math.min(a[1],b[1])-lngPad)/cell), east=Math.floor((Math.max(a[1],b[1])+lngPad)/cell);
    const check=(index:number)=>{if(!hits.has(index)&&pointSegmentDistanceMeters(candidates[index],a,b)<=buffer)hits.add(index);};
    if ((north-south+1)*(east-west+1)>10000) candidates.forEach((_,index)=>check(index));
    else for(let y=south;y<=north;y++) for(let x=west;x<=east;x++) for(const index of grid.get(`${y},${x}`)??[])check(index);
  }
  return candidates.filter((_,index)=>hits.has(index));
}
export function shouldPrioritizeReport(report: NavigationFloodReport, preference: NavigationPreference = {}, specs?: SpecLookupResult): boolean {
  const depth = report.observedDepthCm;
  if (depth == null || !Number.isFinite(depth) || depth < 0) return true;
  // An exact OEM dimension can only raise concern, never clear a report.
  const row = specs?.status === 'verified' ? specs.row : null;
  const dimensions = [row?.groundClearanceMm?.value,row?.exhaustHeightMm?.value,row?.wadingMm?.value].filter((n):n is number => n != null);
  if (dimensions.some(n => depth * 10 >= n)) return true;
  const threshold = preference.avoidanceDepthCm;
  return threshold == null || depth >= threshold;
}
export function assessRoute(route: RoadRoute, reports: readonly NavigationFloodReport[], vehicle: VehicleDetails, preference: NavigationPreference = {}, specResult?: SpecLookupResult): AssessedRoute {
  const hits = intersectingReports(route, reports);
  const specs = specResult ?? lookupVehicleSpecs(vehicle);
  const unknown = specs.status !== 'verified' || !specs.row?.wadingMm;
  // Ground clearance/exhaust height cannot establish safe flood traversal.
  // Observed depths are unverified; current and road integrity are unknown.
  return { ...route, exposure: { reportIds: hits.map(r => r.id), priorityCount: hits.filter(r=>shouldPrioritizeReport(r,preference,specs)).reduce((n,r)=>n+Math.max(1,r.reportCount),0), reportCount: hits.reduce((n, r) => n + Math.max(1, r.reportCount), 0), assessment: hits.length ? (unknown ? 'unknown-avoid' : 'reported-avoid') : 'no-reports-near-route', message: hits.length ? (unknown ? 'Vehicle flood capability and water depth are unverified. Avoid crossing reported waterlogging.' : 'Verified vehicle specifications cannot establish safety without measured water depth and conditions. Avoid crossing.') : 'No supplied reports within 75 m. This does not confirm clear roads.' } };
}
export function selectLowerExposure(routes: readonly AssessedRoute[]): AssessedRoute | null {
  return [...routes].sort((a, b) => a.exposure.priorityCount - b.exposure.priorityCount || a.exposure.reportCount - b.exposure.reportCount || a.durationSeconds - b.durationSeconds)[0] ?? null;
}
