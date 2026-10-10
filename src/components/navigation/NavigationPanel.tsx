'use client';
import { useEffect, useId, useMemo, useState } from 'react';
import { ArrowDownUp, Crosshair, Navigation, X } from 'lucide-react';
import LocationSearchBar, { type PlaceSearchResult } from '../LocationSearchBar';
import { usePlaceSearch } from '../../hooks/usePlaceSearch';
import { VEHICLE_NAMES, lookupVehicleSpecs } from '../../lib/vehicle-catalog';
import type { GpsFix, ReportPin, VehicleDetails } from '../../lib/report';
import type { NavigationMapPath, NavigationResult, NavigationFloodReport } from '../../lib/navigation';

export interface NavigationPanelProps {
  reports: readonly NavigationFloodReport[];
  gps?: GpsFix | null;
  onRoutesChange: (paths: NavigationMapPath[], endpoints: {start: ReportPin; end: ReportPin} | null) => void;
  onFocusPoint?: (point: ReportPin) => void;
}
interface Endpoint extends ReportPin { label: string }
function EndpointSearch({label, point, onPick, onEdit}: {label:string; point:Endpoint|null; onPick:(p:Endpoint)=>void; onEdit:()=>void}) {
  const search = usePlaceSearch();
  return <div className="min-w-0">
    <p className="mb-1 text-sm font-semibold">{label}</p>
    {point ? <div className="flex min-h-11 items-center justify-between gap-2 rounded-xl border border-border bg-surface px-3 text-sm"><span className="truncate">{point.label}</span><button type="button" aria-label={`Change ${label.toLowerCase()}`} className="min-h-11 min-w-11" onClick={onEdit}><X size={16}/></button></div> : <LocationSearchBar {...search} helpText={`Choose the ${label.toLowerCase()} point for your journey.`} hideLocationButton query={search.query} onQueryChange={search.setQuery} onSearch={search.search} onRequestLocation={()=>{}} onSelectResult={(p:PlaceSearchResult)=>{search.selectResult(p);onPick(p);}} />}
  </div>;
}
const blankVehicle: VehicleDetails = {make:'',model:'',year:'',variant:''};
export default function NavigationPanel({reports,gps,onRoutesChange,onFocusPoint}:NavigationPanelProps) {
  const [start,setStart] = useState<Endpoint|null>(null);
  const [end,setEnd] = useState<Endpoint|null>(null);
  const [vehicle,setVehicle] = useState<VehicleDetails>(blankVehicle);
  const [avoidanceDepth,setAvoidanceDepth] = useState('');
  const [request,setRequest] = useState<{start:Endpoint;end:Endpoint;vehicle:VehicleDetails;preference:{avoidanceDepthCm:number|null};revision:number}|null>(null);
  const [result,setResult] = useState<NavigationResult|null>(null);
  const [loading,setLoading] = useState(false);
  const [locating,setLocating] = useState(false);
  const [error,setError] = useState('');
  const id = useId();
  // Only evidence relevant to route checks goes over the routing boundary.
  const reportsJson = useMemo(()=>JSON.stringify(reports.map(r=>({id:r.id,lat:r.lat,lng:r.lng,reportedAt:r.reportedAt,reportCount:r.reportCount,observedDepthCm:r.observedDepthCm??null}))),[reports]);
  const specs = lookupVehicleSpecs(vehicle);
  function clear() {setLoading(false);setRequest(null);setResult(null);setError('');onRoutesChange([],null);}
  function pick(which:'start'|'end',point:Endpoint) {clear();if(which==='start')setStart(point);else setEnd(point);onFocusPoint?.(point);}
  useEffect(()=>{
    if (!request) return;
    const controller = new AbortController();
    let alive = true;
    async function load() {
      setLoading(true);setError('');setResult(null);onRoutesChange([],null);
      try {
        const response = await fetch('/api/navigation/route',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(request),signal:controller.signal});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Route could not be calculated.');
        if (!alive) return;
        const routeResult = data as NavigationResult;
        setResult(routeResult);
        onRoutesChange(routeResult.routes.map(r=>({id:r.id,positions:r.positions,color:r.id===routeResult.selectedId?'#155FD0':'#64748b',dashed:r.id!==routeResult.selectedId})),{start:request!.start,end:request!.end});
      } catch (err) {if(alive)setError(err instanceof Error?err.message:'Route could not be calculated.');}
      finally {if(alive)setLoading(false);}
    }
    void load();
    return ()=>{alive=false;controller.abort();};
  },[request,reportsJson,onRoutesChange]);
  useEffect(()=>()=>onRoutesChange([],null),[onRoutesChange]);
  function locate() {
    if(gps){pick('start',{...gps,label:'Your current location'});return;}
    if(!navigator.geolocation){setError('Location is unavailable. Search for your starting point.');return;}
    setLocating(true);setError('');
    navigator.geolocation.getCurrentPosition(p=>{setLocating(false);pick('start',{lat:p.coords.latitude,lng:p.coords.longitude,label:'Your current location'});},()=>{setLocating(false);setError('Location could not be read. Search for your starting point.');},{enableHighAccuracy:true,timeout:12000,maximumAge:30000});
  }
  const selected = result?.routes.find(r=>r.id===result.selectedId);
  return <section aria-label="Plan a route" className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
    <div className="mb-3 flex items-center gap-2"><Navigation size={18} className="text-accent"/><h2 className="font-bold">Plan your route</h2></div>
    <div className="space-y-3">
      <EndpointSearch label="From" point={start} onPick={p=>pick('start',p)} onEdit={()=>{clear();setStart(null);}}/>
      <button type="button" onClick={locate} disabled={locating} className="flex min-h-11 items-center gap-2 text-sm font-medium text-accent disabled:opacity-50"><Crosshair size={16}/>{locating?'Getting location…':'Use current location'}</button>
      <EndpointSearch label="To" point={end} onPick={p=>pick('end',p)} onEdit={()=>{clear();setEnd(null);}}/>
      <button type="button" disabled={!start&&!end} onClick={()=>{clear();setStart(end);setEnd(start);}} className="flex min-h-11 items-center gap-2 text-sm disabled:opacity-40"><ArrowDownUp size={16}/>Swap start and destination</button>
      <label htmlFor={`${id}-vehicle`} className="block text-sm font-semibold">Your vehicle</label>
      <select id={`${id}-vehicle`} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" value={VEHICLE_NAMES.find(v=>v.make===vehicle.make&&v.model===vehicle.model)?.id||''} onChange={e=>{clear();const v=VEHICLE_NAMES.find(v=>v.id===e.target.value);setVehicle({...blankVehicle,make:v?.make||'',model:v?.model||''});}}>
        <option value="">Select a vehicle</option>{VEHICLE_NAMES.map(v=><option value={v.id} key={v.id}>{v.displayName}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">{(['year','variant'] as const).map(field=><label key={field} className="text-xs">{field==='year'?'Model year':'Variant / trim'}<input aria-label={field==='year'?'Vehicle model year':'Vehicle variant'} maxLength={field==='year'?4:100} inputMode={field==='year'?'numeric':'text'} value={vehicle[field]} onChange={e=>{clear();setVehicle({...vehicle,[field]:e.target.value});}} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"/></label>)}</div>
      <p className="text-xs text-foreground-secondary">{specs.status==='verified'?'Exact vehicle specifications found. Water depth is still unverified.':'Verified flood capability unavailable for this vehicle. Reported waterlogging will be treated conservatively.'}</p>
      <label className="block text-xs">Avoid observed water at or above (cm, optional)
        <input type="number" min="0" max="300" value={avoidanceDepth} onChange={e=>{clear();setAvoidanceDepth(e.target.value);}} className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" placeholder="Avoid all reported waterlogging"/>
      </label>
      <p className="text-xs text-foreground-secondary">Your planning preference is not a verified vehicle limit. Unknown depths always get priority; all reports remain warnings.</p>
      <button type="button" disabled={!start||!end||!vehicle.make||loading||!!avoidanceDepth&&(Number(avoidanceDepth)<0||Number(avoidanceDepth)>300)} onClick={()=>{if(start&&end)setRequest({start,end,vehicle,preference:{avoidanceDepthCm:avoidanceDepth?Number(avoidanceDepth):null},revision:Date.now()});}} className="min-h-11 w-full rounded-xl bg-accent px-4 font-semibold text-accent-foreground disabled:opacity-40">{loading?'Checking road routes…':result?'Recheck routes':'Find road route'}</button>
      {loading?<p role="status" className="text-xs">Checking nearby reports and road alternatives…</p>:null}
      {error?<p role="alert" className="text-sm text-red-600">{error}</p>:null}
      {selected&&result?<div aria-live="polite" className="space-y-2 border-t border-border pt-3">
        <p className="font-semibold">{(selected.distanceMeters/1000).toFixed(1)} km · {Math.max(1,Math.round(selected.durationSeconds/60))} min</p>
        <p className="text-sm font-medium">{result.rerouted?'Lower-exposure road alternative selected':selected.exposure.reportCount?'Reports near this route · Avoid crossing':'No supplied reports near this route'}</p>
        <p className="text-xs">{selected.exposure.priorityCount} priority · {selected.exposure.reportCount} report{selected.exposure.reportCount===1?'':'s'} within 75 m · {selected.exposure.message}</p>
        {result.routes.map((r,i)=><button key={r.id} type="button" aria-pressed={r.id===result.selectedId} className="flex min-h-11 w-full items-center justify-between rounded-xl border border-border px-3 text-left text-xs" onClick={()=>{setResult({...result,selectedId:r.id,rerouted:false});onRoutesChange(result.routes.map(p=>({id:p.id,positions:p.positions,color:p.id===r.id?'#155FD0':'#64748b',dashed:p.id!==r.id})),{start:request!.start,end:request!.end});}}><span>Route {i+1} · {(r.distanceMeters/1000).toFixed(1)} km · {Math.round(r.durationSeconds/60)} min</span><span>{r.exposure.reportCount} reports</span></button>)}
        <p className="text-xs text-foreground-secondary">{result.warning} Updates to supplied reports trigger a fresh route check.</p>
        <p className="text-xs text-foreground-secondary">Road data: OpenStreetMap · {result.provider==='osrm'?'OSRM':'openrouteservice'}. Travel times exclude live traffic. Endpoints are sent to the routing service.</p>
      </div>:null}
      <p className="text-xs text-foreground-secondary">Route planning uses car road access for every vehicle. It does not verify scooter or bus restrictions. Never enter water based on a route suggestion.</p>
    </div>
  </section>;
}
