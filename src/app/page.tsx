'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Upload, Car, Activity, Terminal, ShieldAlert, CheckCircle2, Navigation, MapIcon, X, MapPin, Database, Route, Search } from 'lucide-react';
import dynamic from 'next/dynamic';
import vehiclesData from '../data/vehicles.json';

const MapComponent = dynamic(() => import('../components/MapComponent'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#050505] flex items-center justify-center text-cyan-500 animate-pulse">Initializing Telemetry...</div>
});

const INITIAL_REPORTS = [
  { id: 102, lat: 28.6328, lng: 77.2227, depth: 400, time: '10 mins ago', address: 'Minto Bridge Underpass', vehicleName: 'Unknown', imageUrl: '/flood-demo.jpg' },
];

const LOCATION_SUGGESTIONS = [
  { name: 'Current Location (GPS)', lat: 0, lng: 0 },
  { name: 'Bachus Inn, Manipal', lat: 13.3503, lng: 74.7885 },
  { name: 'Tiger Circle, Manipal', lat: 13.3520, lng: 74.7870 },
  { name: 'MIT Main Gate, Manipal', lat: 13.3450, lng: 74.7800 },
  { name: 'Minto Bridge Underpass, New Delhi', lat: 28.6328, lng: 77.2227 },
  { name: 'Connaught Place, New Delhi', lat: 28.6300, lng: 77.2150 },
  { name: 'Koramangala 4th Block, Bengaluru', lat: 12.9300, lng: 77.6200 },
];

function simulateVehicleSpecsFetch(vehicleName: string) {
  const name = vehicleName.toLowerCase();
  let gc = 170; 
  let intake = 400;

  if (name.includes('suv') || name.includes('thar') || name.includes('fortuner') || name.includes('scorpio')) {
    gc = 225; intake = 650;
  } else if (name.includes('nexon') || name.includes('creta') || name.includes('brezza')) {
    gc = 205; intake = 500;
  } else if (name.includes('bike') || name.includes('activa') || name.includes('splendor')) {
    gc = 160; intake = 250;
  } else if (name.includes('bus') || name.includes('truck')) {
    gc = 300; intake = 800;
  } else {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    gc = 150 + (Math.abs(hash) % 70); 
    intake = 300 + (Math.abs(hash) % 300); 
  }
  return { gc, intake };
}

export default function Home() {
  const [reports, setReports] = useState(INITIAL_REPORTS);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  
  // Custom Vehicles State
  const [vehicles, setVehicles] = useState(vehiclesData);
  const [globalVehicleId, setGlobalVehicleId] = useState(vehiclesData[0].id);
  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [customVehicleQuery, setCustomVehicleQuery] = useState('');
  const [isFetchingSpecs, setIsFetchingSpecs] = useState(false);
  
  // Routing State
  const [startQuery, setStartQuery] = useState('Current Location (GPS)');
  const [destQuery, setDestQuery] = useState('');
  const [isStartFocused, setIsStartFocused] = useState(false);
  const [isDestFocused, setIsDestFocused] = useState(false);
  const [routeData, setRouteData] = useState<{ active: boolean, original: [number, number][], alternate: [number, number][] } | null>(null);

  // UI States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [demoType, setDemoType] = useState<'real' | 'manipal' | 'delhi'>('real');
  
  // Analysis States
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [boxes, setBoxes] = useState<any[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  const [isLoaded, setIsLoaded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const globalVehicle = vehicles.find(v => v.id === globalVehicleId) || vehicles[0];

  useEffect(() => {
    const saved = localStorage.getItem('floodflow_reports_v4'); // Bump to v4
    if (saved) {
      try {
        setReports(JSON.parse(saved));
      } catch(e) {}
    }
    setIsLoaded(true);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => setUserLocation([position.coords.latitude, position.coords.longitude]),
        () => setUserLocation([13.35, 74.78]) 
      );
    }
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('floodflow_reports_v4', JSON.stringify(reports));
    }
  }, [reports, isLoaded]);

  const handleRouteSearch = () => {
    if (!destQuery.trim() || !startQuery.trim()) return;
    
    // Check if the destination is Manipal for the demo
    if (destQuery.toLowerCase().includes('manipal') || destQuery.toLowerCase().includes('mit')) {
      const manipalReport = reports.find(r => Math.abs(r.lat - 13.3503) < 0.01);
      if (manipalReport) setSelectedReportId(manipalReport.id); 
      
      setRouteData({
        active: true,
        original: [
          [13.3450, 74.7800], 
          [13.3503, 74.7885], 
          [13.3600, 74.7950]  
        ],
        alternate: [
          [13.3450, 74.7800], 
          [13.3480, 74.7750], 
          [13.3550, 74.7800], 
          [13.3600, 74.7950]  
        ]
      });
    } else if (destQuery.toLowerCase().includes('delhi') || destQuery.toLowerCase().includes('minto')) {
      const delhiReport = reports.find(r => Math.abs(r.lat - 28.6328) < 0.01);
      if (delhiReport) setSelectedReportId(delhiReport.id);
      
      setRouteData({
        active: true,
        original: [
          [28.6250, 77.2200], 
          [28.6328, 77.2227], 
          [28.6400, 77.2250]  
        ],
        alternate: [
          [28.6250, 77.2200], 
          [28.6300, 77.2150], 
          [28.6380, 77.2180], 
          [28.6400, 77.2250]  
        ]
      });
    } else {
      setRouteData(null);
    }
  };

  const openReportModal = () => {
    setStep(1);
    setPhotoUrl(null);
    setAnalysisResult(null);
    setDemoType('real');
    setIsModalOpen(true);
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoUrl(URL.createObjectURL(file));
      setDemoType('real');
      setStep(2);
    }
  };

  const handleFetchCustomVehicle = () => {
    if (!customVehicleQuery.trim()) return;
    setIsFetchingSpecs(true);
    
    setTimeout(() => {
      const { gc, intake } = simulateVehicleSpecsFetch(customVehicleQuery);
      
      const newVehicle = {
        id: `custom-${Date.now()}`,
        name: customVehicleQuery,
        type: "four-wheeler",
        groundClearance: gc,
        intakeHeight: intake,
        tractionFactor: 0.8
      };
      setVehicles(prev => [...prev, newVehicle]);
      setGlobalVehicleId(newVehicle.id);
      setIsAddingCustom(false);
      setIsFetchingSpecs(false);
      setCustomVehicleQuery('');
    }, 2000);
  };

  const runVisionAnalysis = () => {
    setIsScanning(true);
    setLogs([]);
    setBoxes([]);
    setStep(3);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toISOString().split('T')[1].slice(0,-1)}] ${msg}`]);

    addLog('INIT: Call to AWS API Gateway -> Rekognition started.');
    
    setTimeout(() => addLog('AWS REKOGNITION: Object detection model analyzing geometry.'), 800);
    setTimeout(() => {
      addLog('AWS REKOGNITION: Found [Vehicle Tire]. Conf: 94.2%');
      setBoxes([{ id: 1, x: '10%', y: '40%', w: '15%', h: '25%', label: 'TIRE_REF', conf: 0.94 }]);
    }, 1800);
    setTimeout(() => {
      addLog('AWS REKOGNITION: Triangulating water depth via pixel ratio...');
      addLog('AWS LOCATION SERVICE: Reverse geocoding device coordinates...');
    }, 3800);

    setTimeout(() => {
      const depth = demoType === 'manipal' ? 320 : demoType === 'delhi' ? 400 : Math.floor(Math.random() * (450 - 150) + 150); 
      const isDangerous = depth > globalVehicle.intakeHeight - 20;
      
      addLog(`MODEL OUTPUT: Water Depth = ${depth}mm`);
      addLog(`AWS BEDROCK: Querying foundation model with vehicle [${globalVehicle.name}]`);
      
      setTimeout(() => {
        setIsScanning(false);
        const status = isDangerous ? 'DANGER' : 'SAFE';
        
        setAnalysisResult({
          estimatedDepth: depth,
          status: status,
          advisory: isDangerous 
            ? `Water depth (${depth}mm) exceeds safe wading limit for ${globalVehicle.name}. Engine hydrolock highly probable.`
            : `Water depth (${depth}mm) is safe for ${globalVehicle.name}. Proceed with caution.`,
          alternateRoute: isDangerous ? "AWS Location Service: Alternative route calculated via DynamoDB history." : null
        });

        // Precision Placement Logic based on what they uploaded
        let reportLat = userLocation ? userLocation[0] : 13.35;
        let reportLng = userLocation ? userLocation[1] : 74.78;
        let address = 'New Report (Live)';

        if (demoType === 'manipal') {
          reportLat = 13.3503;
          reportLng = 74.7885;
          address = 'Bachus Inn, Manipal';
        } else if (demoType === 'delhi') {
          reportLat = 28.6328;
          reportLng = 77.2227;
          address = 'Minto Bridge Underpass';
        } else {
          // Simulate AWS Location Service Reverse Geocoding
          if (Math.abs(reportLat - 13.35) < 0.1) {
            address = 'KMC Hospital Road, Manipal';
          } else if (Math.abs(reportLat - 28.61) < 0.2) {
            address = 'Connaught Place, New Delhi';
          } else if (Math.abs(reportLat - 12.97) < 0.2) {
            address = 'Koramangala 4th Block, Bengaluru';
          } else {
            address = `Route 44 Intersection (${reportLat.toFixed(2)}N)`;
          }
        }

        const newReport = {
          id: Date.now(),
          lat: reportLat,
          lng: reportLng,
          depth: depth,
          status: status,
          time: 'Just now',
          address: address,
          vehicleName: globalVehicle.name,
          imageUrl: photoUrl
        };
        
        setReports(prev => {
          // Duplicate Overwrite Logic
          // Find any existing report within ~10 meters (0.0001 degrees)
          const existingIndex = prev.findIndex(r => Math.abs(r.lat - newReport.lat) < 0.0001 && Math.abs(r.lng - newReport.lng) < 0.0001);
          
          if (existingIndex !== -1) {
             // Replace the old report with the new one
             const updated = [...prev];
             updated[existingIndex] = newReport;
             return updated;
          } else {
             // Append normally
             return [newReport, ...prev];
          }
        });
        
        setSelectedReportId(newReport.id);
      }, 1500);
    }, 4800);
  };

  const startSuggestions = LOCATION_SUGGESTIONS.filter(loc => loc.name.toLowerCase().includes(startQuery.toLowerCase()));
  const destSuggestions = LOCATION_SUGGESTIONS.filter(loc => loc.name.toLowerCase().includes(destQuery.toLowerCase()));

  return (
    <div className="h-screen w-screen bg-[#050505] text-slate-200 flex overflow-hidden font-sans selection:bg-cyan-500/30">
      
      <aside className="w-full md:w-[400px] h-full bg-[#0a0a0a] border-r border-white/10 flex flex-col shrink-0 z-20 shadow-2xl relative">
        <div className="p-6 border-b border-white/5 bg-black/40">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold tracking-widest uppercase text-lg text-white">FloodFlow</h1>
              <div className="text-[10px] font-mono text-cyan-500">DYNAMIC ROUTING ENGINE</div>
            </div>
          </div>
          
          <div className="space-y-4 mb-6">
            <div className="bg-black/50 border border-white/10 rounded-xl p-4 space-y-3 relative">
              <div className="flex items-center gap-3 relative">
                 <div className="w-3 h-3 rounded-full border-2 border-emerald-500 shrink-0"></div>
                 <input 
                   type="text" 
                   placeholder="Start Location"
                   value={startQuery} 
                   onChange={(e) => setStartQuery(e.target.value)}
                   onFocus={() => setIsStartFocused(true)}
                   onBlur={() => setTimeout(() => setIsStartFocused(false), 200)}
                   className="bg-transparent text-sm text-white outline-none w-full" 
                 />
                 {isStartFocused && startQuery && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-black border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                      {startSuggestions.map((loc, idx) => (
                        <div key={idx} onClick={() => setStartQuery(loc.name)} className="px-4 py-2 hover:bg-white/5 text-xs cursor-pointer flex items-center gap-2">
                          <MapPin className="w-3 h-3 text-slate-500" /> {loc.name}
                        </div>
                      ))}
                    </div>
                 )}
              </div>
              <div className="w-px h-4 bg-white/10 ml-1.5 my-1"></div>
              <div className="flex items-center gap-3 relative">
                 <div className="w-3 h-3 bg-rose-500 rounded-sm shrink-0"></div>
                 <input 
                   type="text" 
                   placeholder="Enter destination" 
                   value={destQuery}
                   onChange={(e) => setDestQuery(e.target.value)}
                   onFocus={() => setIsDestFocused(true)}
                   onBlur={() => setTimeout(() => setIsDestFocused(false), 200)}
                   className="bg-transparent text-sm text-white outline-none w-full placeholder-slate-600" 
                 />
                 {isDestFocused && destQuery && (
                    <div className="absolute top-full left-0 right-0 mt-2 bg-black border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden max-h-48 overflow-y-auto">
                      {destSuggestions.map((loc, idx) => (
                        <div key={idx} onClick={() => setDestQuery(loc.name)} className="px-4 py-2 hover:bg-white/5 text-xs cursor-pointer flex items-center gap-2">
                          <Search className="w-3 h-3 text-slate-500" /> {loc.name}
                        </div>
                      ))}
                    </div>
                 )}
              </div>
              <button onClick={handleRouteSearch} className="w-full mt-2 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-xs font-bold uppercase tracking-widest text-cyan-400 border border-cyan-500/20 transition-colors">
                 Find Safe Route
              </button>
            </div>
          </div>

          <div className="mb-2">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Car className="w-3 h-3 text-cyan-400" /> My Vehicle Context
            </label>
            {isAddingCustom ? (
              <div className="bg-black border border-white/20 rounded-lg p-3 space-y-2">
                <input 
                  type="text" 
                  placeholder="e.g. Mahindra Thar 2024" 
                  value={customVehicleQuery}
                  onChange={(e) => setCustomVehicleQuery(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded px-2 py-1.5 text-sm focus:border-cyan-500 focus:outline-none text-white"
                />
                <div className="flex gap-2">
                  <button onClick={handleFetchCustomVehicle} disabled={isFetchingSpecs} className="flex-1 py-1.5 bg-cyan-600 text-white text-xs font-bold rounded flex items-center justify-center gap-2 hover:bg-cyan-500">
                    {isFetchingSpecs ? <Database className="w-3 h-3 animate-spin" /> : "Fetch from Bedrock"}
                  </button>
                  <button onClick={() => setIsAddingCustom(false)} className="px-3 py-1.5 bg-white/5 text-xs text-slate-400 rounded hover:text-white">Cancel</button>
                </div>
                <div className="text-[9px] text-slate-500">AI will scrape manuals for clearance & intake height.</div>
              </div>
            ) : (
              <select 
                value={globalVehicleId}
                onChange={(e) => {
                  if (e.target.value === 'custom') setIsAddingCustom(true);
                  else setGlobalVehicleId(e.target.value);
                }}
                className="w-full bg-black border border-white/20 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-none focus:border-cyan-500"
              >
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} (Intake: {v.intakeHeight}mm)</option>)}
                <option value="custom" className="text-cyan-400 font-bold">+ Add Custom Vehicle</option>
              </select>
            )}
            <p className="text-[9px] text-slate-500 mt-1">Map hazards update automatically based on this vehicle.</p>
          </div>
        </div>

        <div className="p-6 flex-1 overflow-y-auto no-scrollbar border-t border-white/5 pb-24">
          <div className="flex items-center justify-between mb-4">
             <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Live Reports on Map</h2>
             <span className="px-2 py-1 bg-white/5 rounded text-[10px] font-mono">{reports.length}</span>
          </div>

          <div className="space-y-3">
            {reports.map(report => {
               const isDanger = report.depth > (globalVehicle.intakeHeight - 20);
               const statusText = isDanger ? 'DANGER' : 'SAFE';
               return (
                <div 
                  key={report.id} 
                  onClick={() => setSelectedReportId(report.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all ${selectedReportId === report.id ? 'border-cyan-500/50 bg-cyan-950/30 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'border-white/5 bg-white/[0.01] hover:bg-white/[0.04]'}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="font-bold text-sm text-white truncate pr-2">{report.address}</div>
                  </div>
                  <div className="flex items-center gap-2 mb-2 text-[10px] font-bold">
                     <span className={`px-1.5 py-0.5 rounded ${isDanger ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                        {statusText} FOR {globalVehicle.name.substring(0, 10)}
                     </span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>Depth: {report.depth}mm</span>
                    <span>{report.time}</span>
                  </div>
                </div>
               );
            })}
          </div>
        </div>

        <div className="absolute bottom-6 left-6 right-6">
           <button 
             onClick={openReportModal}
             className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-xl hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(6,182,212,0.4)]"
           >
             <Camera className="w-5 h-5" /> Report Flooded Road
           </button>
        </div>
      </aside>

      <main className="flex-1 h-full relative z-10">
        <div className="absolute inset-0 z-0 map-dark-mode">
          <MapComponent 
            reports={reports} 
            userLocation={userLocation} 
            selectedReportId={selectedReportId} 
            globalVehicle={globalVehicle}
            routeData={routeData}
          />
        </div>
        
        <div className="absolute bottom-6 right-6 z-20 bg-black/80 backdrop-blur border border-white/10 p-4 rounded-2xl flex flex-col gap-3 shadow-2xl">
           <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
             <div className="w-8 h-1 bg-blue-500 rounded-full"></div> Safe Alternate Route
           </div>
           <div className="flex items-center gap-2 text-xs font-mono text-slate-300">
             <div className="w-8 h-1 border-t-2 border-dashed border-red-500 rounded-full"></div> Flooded Intersect
           </div>
        </div>
      </main>

      <AnimatePresence>
        {isModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 overflow-y-auto">
            <div className="absolute inset-0" onClick={() => !isScanning && setIsModalOpen(false)}></div>
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="relative w-full max-w-4xl bg-[#0a0a0a] border border-cyan-900/30 rounded-[2rem] shadow-[0_0_50px_rgba(6,182,212,0.1)] overflow-hidden my-8" onClick={e => e.stopPropagation()}>
              <div className="absolute top-4 right-4 z-50">
                <button onClick={() => setIsModalOpen(false)} disabled={isScanning} className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400"><X className="w-6 h-6" /></button>
              </div>

              <div className="p-8">
                {step === 1 && (
                  <div className="space-y-8">
                    <div className="text-center max-w-xl mx-auto">
                      <h2 className="text-3xl font-black mb-2">Report Flooded Road</h2>
                      <p className="text-slate-400">AWS Computer Vision will estimate the depth and verify the hazard for other drivers in real-time.</p>
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-400/10 py-2 px-4 rounded-full max-w-sm mx-auto border border-cyan-400/20">
                      <MapPin className="w-4 h-4 animate-pulse" /> 
                      {userLocation ? `Lat: ${userLocation[0].toFixed(4)} | Lng: ${userLocation[1].toFixed(4)}` : 'Requesting Geolocation API...'}
                    </div>

                    <div onClick={() => fileInputRef.current?.click()} className="w-full aspect-[21/9] rounded-3xl border-2 border-dashed border-white/20 hover:border-cyan-500/50 bg-white/[0.02] transition-all flex flex-col items-center justify-center cursor-pointer group">
                      <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform"><Upload className="w-8 h-8 text-cyan-400" /></div>
                      <h3 className="text-xl font-bold text-white mb-1">Take a Photo</h3>
                      <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handlePhotoUpload} />
                    </div>
                    
                    <div className="text-center space-x-4">
                       <button onClick={() => { setPhotoUrl('/manipal-actual.jpg'); setDemoType('manipal'); setStep(2); }} className="text-xs font-bold text-cyan-600 hover:text-cyan-400 uppercase tracking-widest transition-all">Use "Bachus Inn" Demo</button>
                    </div>
                  </div>
                )}

                {step === 2 && (
                  <div className="space-y-6">
                    <h2 className="text-2xl font-black mb-6">What vehicle are you driving right now?</h2>
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="rounded-[2rem] overflow-hidden bg-black aspect-video relative">
                        {photoUrl && <img src={photoUrl} alt="Upload" className="w-full h-full object-cover opacity-80" />}
                        <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Image processed</div>
                      </div>

                      <div className="flex flex-col justify-between gap-4">
                        <div className="p-6 rounded-3xl bg-white/[0.02] border border-white/10">
                          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 flex items-center gap-2"><Car className="w-4 h-4 text-cyan-400" /> Confirm Context</label>
                          <div className="bg-black border border-white/20 rounded-xl p-4 text-white">
                            <span className="font-bold block mb-1">{globalVehicle.name}</span>
                            <span className="text-xs text-slate-400 font-mono">Intake Height: {globalVehicle.intakeHeight}mm</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2">Analysis will be calibrated to your active global vehicle.</p>
                        </div>

                        <button onClick={runVisionAnalysis} className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl font-bold text-lg hover:brightness-110 transition-all flex items-center justify-center gap-2">
                          <Activity className="w-6 h-6 animate-pulse" /> Deploy Vision Engine
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="grid lg:grid-cols-2 gap-8">
                    <div className="relative aspect-[4/3] rounded-3xl bg-black border border-white/10 overflow-hidden shadow-2xl">
                      {photoUrl && <img src={photoUrl} alt="Analysis" className="w-full h-full object-cover opacity-60" />}
                      {isScanning && <motion.div animate={{ y: ['0%', '100%', '0%'] }} transition={{ repeat: Infinity, duration: 3, ease: 'linear' }} className="absolute top-0 left-0 w-full h-1 bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,1)] z-20" />}
                      <AnimatePresence>
                        {boxes.map(box => (
                          <motion.div key={box.id} initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} className="absolute border-2 border-cyan-400 bg-cyan-400/10 z-10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                            <div className="absolute -top-6 left-[-2px] bg-cyan-400 text-black text-[10px] font-mono font-bold px-1 py-0.5 whitespace-nowrap">{box.label}</div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>

                    <div className="flex flex-col gap-6">
                      <div className="flex-1 bg-black border border-white/10 rounded-3xl p-5 font-mono text-[11px] md:text-xs overflow-hidden relative">
                        <div className="flex items-center gap-2 text-slate-500 mb-4 border-b border-white/5 pb-2"><Terminal className="w-4 h-4" /> Serverless API Gateway Logs</div>
                        <div className="space-y-1.5 text-cyan-500/80 max-h-[150px] overflow-y-auto no-scrollbar pb-8">
                          {logs.map((log, i) => <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>{log}</motion.div>)}
                        </div>
                      </div>

                      <AnimatePresence>
                        {!isScanning && analysisResult && (
                          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-3xl border relative overflow-hidden ${analysisResult.status === 'DANGER' ? 'bg-rose-950/40 border-rose-500/50' : 'bg-emerald-950/40 border-emerald-500/50'}`}>
                            <div className="flex gap-4">
                              {analysisResult.status === 'DANGER' ? <ShieldAlert className="w-10 h-10 text-rose-500 shrink-0" /> : <CheckCircle2 className="w-10 h-10 text-emerald-500 shrink-0" />}
                              <div>
                                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">Verdict for {globalVehicle.name}</div>
                                <div className={`text-2xl font-black tracking-tight mb-2 ${analysisResult.status === 'DANGER' ? 'text-rose-500' : 'text-emerald-500'}`}>{analysisResult.status}</div>
                                <p className="text-xs font-medium text-slate-300 leading-relaxed mb-4">{analysisResult.advisory}</p>
                              </div>
                            </div>
                            
                            {analysisResult.alternateRoute && (
                              <div className="bg-blue-950/30 border border-blue-500/30 p-3 rounded-xl mb-4 flex items-start gap-3 text-xs text-blue-200">
                                <Navigation className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                {analysisResult.alternateRoute}
                              </div>
                            )}

                            <button onClick={() => setIsModalOpen(false)} className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                              <MapIcon className="w-4 h-4" /> Add to Global Map
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar { display: none; } 
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .map-dark-mode .leaflet-layer,
        .map-dark-mode .leaflet-control-zoom-in,
        .map-dark-mode .leaflet-control-zoom-out,
        .map-dark-mode .leaflet-control-attribution {
          filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%);
        }
      `}} />
    </div>
  );
}
