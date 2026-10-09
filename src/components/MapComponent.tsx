'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Droplets, Car } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';

const iconPerson = new L.Icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const createFloodIcon = (depth: number, status: string) => {
  const color = status === 'DANGER' ? 'bg-rose-500' : 'bg-amber-500';
  const html = renderToStaticMarkup(
    <div className="relative flex items-center justify-center w-8 h-8">
      <div className={`absolute inset-0 rounded-full ${color} opacity-40 animate-ping`}></div>
      <div className={`relative z-10 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center ${color} shadow-lg`}>
        <Droplets className="w-3 h-3 text-white" />
      </div>
    </div>
  );
  
  return L.divIcon({
    html,
    className: 'custom-leaflet-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

function MapController({ center, selectedReportId, reports }: { center: [number, number], selectedReportId: number | null, reports: any[] }) {
  const map = useMap();
  
  useEffect(() => {
    if (selectedReportId) {
      const target = reports.find(r => r.id === selectedReportId);
      if (target) {
        map.flyTo([target.lat, target.lng], 16, { duration: 1.5 });
      }
    } else {
      map.flyTo(center, 13, { duration: 1.5 });
    }
  }, [selectedReportId, center, map, reports]);
  
  return null;
}

export default function MapComponent({ 
  reports, 
  userLocation,
  selectedReportId,
  globalVehicle,
  routeData
}: { 
  reports: any[], 
  userLocation: [number, number] | null,
  selectedReportId: number | null,
  globalVehicle?: any,
  routeData?: { active: boolean, original: [number, number][], alternate: [number, number][] } | null
}) {
  const defaultCenter: [number, number] = [28.6328, 77.2227]; // Minto Bridge Area
  const center = userLocation || defaultCenter;



  return (
    <MapContainer 
      center={center} 
      zoom={13} 
      style={{ width: '100%', height: '100%', zIndex: 0 }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap'
      />
      
      <MapController center={center} selectedReportId={selectedReportId} reports={reports} />

      {/* Dynamic Routing Visualization */}
      {routeData?.active && (
        <>
          <Polyline positions={routeData.original} color="#ef4444" weight={4} opacity={0.5} dashArray="10, 10" />
          <Polyline positions={routeData.alternate} color="#3b82f6" weight={5} opacity={0.8} />
        </>
      )}

      {userLocation && (
        <Marker position={userLocation} icon={iconPerson}>
          <Popup>Your Location</Popup>
        </Marker>
      )}

      {reports.map((report) => (
        <Marker 
          key={report.id} 
          position={[report.lat, report.lng]} 
          icon={createFloodIcon(report.depth, report.status)}
        >
          <Popup className="custom-popup min-w-[200px]" closeButton={false}>
            <div className="p-0 overflow-hidden rounded-lg bg-white">
              {/* Analyzed Image */}
              <div className="h-24 w-full bg-slate-200 relative">
                {report.imageUrl ? (
                  <img src={report.imageUrl} alt="Flood" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">No image provided</div>
                )}
                <div className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold text-white ${report.status === 'DANGER' ? 'bg-rose-500' : 'bg-amber-500'}`}>
                  {report.status}
                </div>
              </div>
              
              <div className="p-3">
                <h3 className="font-bold text-gray-900 text-sm mb-2">{report.address}</h3>
                
                <div className="bg-slate-50 p-2 rounded border border-slate-100 mb-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 mb-1">
                    <Car className="w-3 h-3 text-cyan-600" /> 
                    {report.vehicleName}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Water depth ({report.depth}mm) evaluated against this vehicle's clearance.
                  </div>
                </div>

                <div className="text-[9px] text-gray-400 mt-1 uppercase tracking-widest text-center">
                  Verified by AWS CV Engine
                </div>
              </div>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
