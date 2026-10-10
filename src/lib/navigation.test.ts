import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRoute, intersectingReports, pointSegmentDistanceMeters, selectLowerExposure, shouldPrioritizeReport, validNavigationPoint, type NavigationFloodReport, type RoadRoute } from './navigation';
import { getNavigationRoutes, reportAvoidancePolygons } from './navigation-provider';
import { lookupVehicleSpecs, type VerifiedSpecRow } from './vehicle-catalog';
const vehicle = {make:'Honda',model:'Activa 6G',year:'2021',variant:''};
const road:RoadRoute = {id:'base',positions:[[28,77],[28,77.02]],distanceMeters:2000,durationSeconds:100};
const report:NavigationFloodReport = {id:'water',lat:28,lng:77.01,reportedAt:'2026-10-10T00:00:00Z',reportCount:1,observedDepthCm:null};

test('sparse segments detect midway reports and reject nearby parallel roads outside buffer',()=>{
  assert.equal(intersectingReports(road,[report]).length,1);
  assert.equal(intersectingReports(road,[{...report,lat:28.002}]).length,0);
  assert.ok(pointSegmentDistanceMeters(report,[28,77],[28,77.02])<1);
  assert.ok(pointSegmentDistanceMeters({lat:0,lng:180},[0,179.9],[0,-179.9])<1);
});
test('invalid coordinates rejected and zero-length segments work',()=>{
  assert.equal(validNavigationPoint({lat:NaN,lng:77}),false);
  assert.equal(validNavigationPoint({lat:90,lng:77}),false);
  assert.equal(pointSegmentDistanceMeters({lat:28,lng:77},[28,77],[28,77]),0);
});
test('unknown depth and missing specs never become safe, including bus/scooter names',()=>{
  for(const v of [vehicle,{make:'DTC',model:'Low-Floor Bus',year:'2025',variant:''}]) {
    const result=assessRoute(road,[report],v,{avoidanceDepthCm:300});
    assert.equal(result.exposure.assessment,'unknown-avoid');
    assert.equal(result.exposure.priorityCount,1);
  }
  assert.match(assessRoute(road,[],vehicle).exposure.message,/does not confirm/);
});
test('planning preference changes priority but never erases report warnings',()=>{
  const shallow={...report,observedDepthCm:10};
  assert.equal(assessRoute(road,[shallow],vehicle).exposure.priorityCount,1);
  const preference=assessRoute(road,[shallow],vehicle,{avoidanceDepthCm:20});
  assert.equal(preference.exposure.priorityCount,0);
  assert.equal(preference.exposure.reportCount,1);
  assert.equal(preference.exposure.assessment,'unknown-avoid');
});
test('exact fixture-backed dimensions raise priority; year mismatch stays unknown',()=>{
  // Synthetic values exercise matching only, never real OEM claims.
  const provenance={sourceUrl:'https://example.invalid/navigation-fixture',sourceClass:'test-fixture' as const,accessedOn:'2026-01-01',market:'IN',modelYear:'2021',variant:null,basis:'test-only',verified:true};
  const row:VerifiedSpecRow={vehicleId:'honda-activa-6g',...vehicle,market:'IN',tyreFront:null,tyreRear:null,groundClearanceMm:{value:150,provenance},exhaustHeightMm:null,exhaustPosition:null,wadingMm:null};
  const exact=lookupVehicleSpecs(vehicle,[row],{allowTestFixtures:true});
  const mismatch=lookupVehicleSpecs({...vehicle,year:'2022'},[row],{allowTestFixtures:true});
  assert.equal(exact.status,'verified');assert.equal(mismatch.status,'no-verified-row');
  assert.equal(shouldPrioritizeReport({...report,observedDepthCm:16},{avoidanceDepthCm:25},exact),true);
  assert.equal(shouldPrioritizeReport({...report,observedDepthCm:16},{avoidanceDepthCm:25},mismatch),false);
  const first=assessRoute(road,[{...report,observedDepthCm:16}],vehicle,{avoidanceDepthCm:25},exact);
  const second=assessRoute({...road,id:'slightly-longer',positions:[[28.01,77],[28.01,77.02]],durationSeconds:120},[{...report,id:'shallow',lat:28.01,observedDepthCm:10}],vehicle,{avoidanceDepthCm:25},exact);
  assert.equal(selectLowerExposure([first,second])?.id,'slightly-longer');
  const unverifiedFirst=assessRoute(road,[{...report,observedDepthCm:16}],vehicle,{avoidanceDepthCm:25},mismatch);
  assert.equal(selectLowerExposure([unverifiedFirst,second])?.id,'base');
});
test('selection prefers fewer priority reports then fewer warnings over speed',()=>{
  const a=assessRoute(road,[report],vehicle);
  const b=assessRoute({...road,id:'alternate',positions:[[28.01,77],[28.01,77.02]],durationSeconds:200},[report],vehicle);
  assert.equal(selectLowerExposure([a,b])?.id,'alternate');
});
const osrmRoute=(positions:RoadRoute['positions'])=>({distance:2000,duration:100,geometry:{type:'LineString',coordinates:positions.map(([lat,lng])=>[lng,lat])}});
test('OSRM requests actual road alternatives and does not pretend polygon avoidance',async()=>{
  let url='';
  const fetcher=(async(input)=>{url=String(input);return Response.json({code:'Ok',routes:[osrmRoute(road.positions),osrmRoute([[28.01,77],[28.01,77.02]])]});}) as typeof fetch;
  const result=await getNavigationRoutes({lat:28,lng:77},{lat:28,lng:77.02},[report],vehicle,{fetcher});
  assert.match(url,/alternatives=true/);assert.match(url,/geometries=geojson/);
  assert.equal(result.rerouted,true);assert.equal(result.avoidanceAttempted,false);
  assert.match(result.warning,/cannot request flood avoidance/);
});
test('ORS performs real second avoidance request and validates returned exposure',async()=>{
  const bodies: {options?: {avoid_polygons?:unknown}}[]=[];
  const fetcher=(async(_input,init)=>{bodies.push(JSON.parse(String(init?.body)));const route=osrmRoute(bodies.length===1?road.positions:[[28.01,77],[28.01,77.02]]);return Response.json({features:[{geometry:route.geometry,properties:{summary:{distance:route.distance,duration:route.duration}}}]});}) as typeof fetch;
  const result=await getNavigationRoutes({lat:28,lng:77},{lat:28,lng:77.02},[report],vehicle,{fetcher,orsKey:'test-only'});
  assert.equal(bodies.length,2);assert.ok(bodies[1].options?.avoid_polygons);
  assert.equal(result.avoidanceAttempted,true);assert.equal(result.rerouted,true);
  const polygons=reportAvoidancePolygons([report]);assert.equal(polygons.coordinates[0][0].length,5);
});
test('failed avoidance retains warning and never asserts successful reroute',async()=>{
  let calls=0;
  const fetcher=(async()=>{calls++;if(calls>1)return new Response('',{status:503});const r=osrmRoute(road.positions);return Response.json({features:[{geometry:r.geometry,properties:{summary:{distance:r.distance,duration:r.duration}}}]});}) as typeof fetch;
  const result=await getNavigationRoutes({lat:28,lng:77},{lat:28,lng:77.02},[report],vehicle,{fetcher,orsKey:'test-only'});
  assert.equal(result.rerouted,false);assert.match(result.warning,/avoidance request failed/);
});
test('provider invalid geometries and missing routes fail explicitly',async()=>{
  const fetcher=(async()=>Response.json({code:'Ok',routes:[{...osrmRoute(road.positions),geometry:{type:'LineString',coordinates:[[77,NaN],[77,28]]}}]})) as typeof fetch;
  await assert.rejects(()=>getNavigationRoutes({lat:28,lng:77},{lat:28,lng:77.02},[],vehicle,{fetcher}),/invalid coordinates/);
});
