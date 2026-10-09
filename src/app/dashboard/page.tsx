'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Droplets, Navigation, Info, Layers, Wind, Activity, Zap, Car, Bus, Bike } from 'lucide-react';
import vehicles from '../../data/vehicles.json';

const FLOOD_SPOTS = [
  { id: 1, name: 'Minto Bridge', depth_mm: 320, lat: 28.6328, lng: 77.2227, flow_turbulence: 0.1 },
  { id: 2, name: 'Kashmere Gate ISBT', depth_mm: 220, lat: 28.6679, lng: 77.2293, flow_turbulence: 0.3 },
  { id: 3, name: 'Golf Course Road, Gurugram', depth_mm: 450, lat: 28.4595, lng: 77.0266, flow_turbulence: 0.6 },
  { id: 4, name: 'ITO Intersection', depth_mm: 150, lat: 28.6272, lng: 77.2405, flow_turbulence: 0.05 },
];

const getVehicleIcon = (type: string) => {
  if (type === 'two-wheeler') return <Bike className="w-6 h-6" />;
  if (type === 'four-wheeler') return <Car className="w-6 h-6" />;
  if (type === 'public-transport') return <Bus className="w-6 h-6" />;
  return <Zap className="w-6 h-6" />;
};

export default function Dashboard() {
  const [selectedVehicleId, setSelectedVehicleId] = useState('activa-6g');
  const [selectedSpot, setSelectedSpot] = useState(FLOOD_SPOTS[0]);
  const [showRunoff, setShowRunoff] = useState(false);
  
  // Backend State
  const [aiAdvisory, setAiAdvisory] = useState('Loading AWS Bedrock advisory...');
  const [isAiLoading, setIsAiLoading] = useState(false);

  const vehicle = vehicles.find(v => v.id === selectedVehicleId) || vehicles[0];

  // Fetch AI Advisory from our Next.js API (Backend)
  useEffect(() => {
    const fetchAdvisory = async () => {
      setIsAiLoading(true);
      try {
        const response = await fetch('/api/bedrock', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vehicleName: vehicle.name,
            groundClearance: vehicle.groundClearance,
            intakeHeight: vehicle.intakeHeight,
            depthMm: selectedSpot.depth_mm
          })
        });
        const data = await response.json();
        setAiAdvisory(data.advisory || 'Unable to fetch advisory.');
      } catch (e) {
        setAiAdvisory('Backend connection failed.');
      }
      setIsAiLoading(false);
    };

    fetchAdvisory();
  }, [selectedVehicleId, selectedSpot.id]);

  // Risk Engine Math (Frontend calculation for instant UI updates)
  const riskCalculation = (spot: typeof FLOOD_SPOTS[0], v: typeof vehicle) => {
    const depthToGCRatio = spot.depth_mm / v.groundClearance;
    const depthToIntakeRatio = spot.depth_mm / v.intakeHeight;
    let risk = (depthToGCRatio * 0.3) + (depthToIntakeRatio * 0.5) + (v.tractionFactor * 0.1) + (spot.flow_turbulence * 0.1);
    if (spot.depth_mm > v.intakeHeight - 20) risk = Math.max(risk, 0.9);
    return Math.min(Math.max(risk, 0), 1);
  };

  const riskScore = riskCalculation(selectedSpot, vehicle);

  const getRiskTheme = (score: number) => {
    if (score > 0.75) return { 
      color: 'text-rose-500', 
      bg: 'bg-rose-500/10', 
      border: 'border-rose-500/30',
      glow: 'shadow-[0_0_30px_rgba(244,63,94,0.3)]',
      gradient: 'from-rose-500/20 to-transparent',
      status: 'CRITICAL AVOID',
      icon: <ShieldAlert className="w-8 h-8 text-rose-500" />
    };
    if (score > 0.45) return { 
      color: 'text-amber-500', 
      bg: 'bg-amber-500/10', 
      border: 'border-amber-500/30',
      glow: 'shadow-[0_0_30px_rgba(245,158,11,0.2)]',
      gradient: 'from-amber-500/20 to-transparent',
      status: 'CAUTION',
      icon: <Activity className="w-8 h-8 text-amber-500" />
    };
    return { 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-500/10', 
      border: 'border-emerald-500/30',
      glow: 'shadow-[0_0_30px_rgba(16,185,129,0.2)]',
      gradient: 'from-emerald-500/20 to-transparent',
      status: 'CLEAR TO PASS',
      icon: <Navigation className="w-8 h-8 text-emerald-500" />
    };
  };

  const theme = getRiskTheme(riskScore);

  return (
    <div className="min-h-screen bg-[#050505] text-slate-200 font-sans selection:bg-cyan-500/30 overflow-x-hidden">
      
      {/* Background ambient light */}
      <div className="fixed inset-0 z-0 pointer-events-none flex justify-center">
        <div className="absolute top-0 w-[1000px] h-[500px] bg-cyan-900/20 blur-[120px] rounded-full mix-blend-screen opacity-50"></div>
        <div className={`absolute bottom-0 w-[800px] h-[600px] blur-[150px] rounded-full mix-blend-screen opacity-30 transition-colors duration-1000 ${theme.bg}`}></div>
      </div>

      {/* Navbar */}
      <nav className="relative z-50 border-b border-white/5 bg-black/40 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)]">
              <Droplets className="w-5 h-5 text-black" />
            </div>
            <span className="font-bold text-xl tracking-tight text-white">FloodFlow Dashboard</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              <span className="text-white/80 font-medium tracking-wide">Live • New Delhi</span>
            </div>
            <a href="/" className="text-sm text-slate-400 hover:text-white">Sign Out</a>
          </div>
        </div>
      </nav>

      <main className="relative z-10 max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Panel: Vehicle Selector */}
        <div className="lg:col-span-4 space-y-6">
          <motion.div 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-xl shadow-2xl relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
            <h2 className="text-xs font-bold text-cyan-400 uppercase tracking-[0.2em] mb-5 flex items-center gap-2">
              <Car className="w-4 h-4" /> Select Vehicle
            </h2>
            
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
              {vehicles.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`w-full text-left flex items-center p-4 rounded-2xl border transition-all duration-300 group ${
                    selectedVehicleId === v.id 
                    ? 'bg-gradient-to-r from-cyan-950/40 to-blue-900/20 border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.15)]' 
                    : 'bg-black/40 border-white/5 hover:border-white/20 hover:bg-white/[0.04]'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mr-4 transition-colors ${selectedVehicleId === v.id ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-slate-400 group-hover:text-slate-200'}`}>
                    {getVehicleIcon(v.type)}
                  </div>
                  <div>
                    <div className={`font-semibold tracking-wide ${selectedVehicleId === v.id ? 'text-white' : 'text-slate-300'}`}>{v.name}</div>
                    <div className="text-xs text-slate-500 font-mono mt-1 flex gap-3">
                      <span>GC: <span className="text-slate-300">{v.groundClearance}mm</span></span>
                      <span>IN: <span className="text-slate-300">{v.intakeHeight}mm</span></span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="p-6 rounded-3xl bg-white/[0.02] border border-white/10 backdrop-blur-xl"
          >
             <h2 className="text-xs font-bold text-purple-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
               <Layers className="w-4 h-4" /> Environmental Impact
             </h2>
             <label className="flex items-center gap-4 cursor-pointer group p-3 rounded-2xl hover:bg-white/5 transition-colors">
               <div className="relative">
                 <input 
                   type="checkbox" 
                   className="sr-only" 
                   checked={showRunoff}
                   onChange={() => setShowRunoff(!showRunoff)}
                 />
                 <div className={`block w-12 h-7 rounded-full transition-colors duration-300 ${showRunoff ? 'bg-purple-500' : 'bg-white/10'}`}></div>
                 <div className={`absolute left-1 top-1 bg-white w-5 h-5 rounded-full transition-transform duration-300 shadow-md ${showRunoff ? 'translate-x-5' : ''}`}></div>
               </div>
               <div className="text-sm">
                 <div className="font-semibold text-white/90 group-hover:text-white transition-colors">Ecotoxic Runoff Engine</div>
                 <div className="text-slate-400 text-xs mt-0.5">Model TRWP microplastic wash-off</div>
               </div>
             </label>
          </motion.div>
        </div>

        {/* Right Panel: Map & Risk */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Main Map View */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative w-full aspect-[16/9] rounded-3xl bg-black border border-white/10 overflow-hidden shadow-2xl"
          >
            {/* Map image background (generated) */}
            <div className="absolute inset-0 bg-[url('/map-bg.jpg')] bg-cover bg-center opacity-40 mix-blend-screen transition-transform duration-10000 hover:scale-105"></div>
            
            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent"></div>
            <div className="absolute inset-0 bg-gradient-to-r from-[#050505] via-transparent to-transparent"></div>

            {/* Map Header / Selectors */}
            <div className="absolute top-6 left-6 right-6 z-20 flex gap-3 overflow-x-auto pb-2 no-scrollbar">
              {FLOOD_SPOTS.map(spot => (
                <button
                  key={spot.id}
                  onClick={() => setSelectedSpot(spot)}
                  className={`shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold backdrop-blur-xl border transition-all duration-300 ${
                    selectedSpot.id === spot.id
                    ? 'bg-white/10 border-white/30 text-white shadow-[0_0_20px_rgba(255,255,255,0.1)]'
                    : 'bg-black/50 border-white/5 text-slate-400 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {spot.name}
                </button>
              ))}
            </div>

            {/* Simulated Water Level Indicator on Map */}
            <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
               <div className="relative">
                  <motion.div 
                    animate={{ scale: [1, 2, 2.5], opacity: [0.6, 0.2, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className={`absolute inset-0 -m-8 rounded-full ${theme.bg}`}
                  />
                  <div className={`w-8 h-8 rounded-full border-4 border-[#050505] flex items-center justify-center ${theme.bg} ${theme.glow} ${theme.border}`}>
                    <div className={`w-3 h-3 rounded-full ${theme.color.replace('text', 'bg')}`}></div>
                  </div>
               </div>
               
               <motion.div 
                 key={selectedSpot.id}
                 initial={{ opacity: 0, y: 10 }}
                 animate={{ opacity: 1, y: 0 }}
                 className="mt-4 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-3"
               >
                 <div className="w-1 h-6 rounded-full bg-blue-500"></div>
                 <div>
                   <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detected Depth</div>
                   <div className="text-xl font-mono font-bold text-white leading-none">{selectedSpot.depth_mm}<span className="text-sm text-slate-500">mm</span></div>
                 </div>
               </motion.div>
            </div>

            {/* Environmental layer overlay */}
            <AnimatePresence>
              {showRunoff && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 pointer-events-none z-10"
                >
                  <div className="absolute top-1/3 left-1/4 w-[120%] h-4 bg-gradient-to-r from-purple-500/0 via-purple-500/40 to-purple-500/0 transform -rotate-[25deg] blur-md animate-pulse"></div>
                  <div className="absolute top-[40%] left-1/4 w-[120%] h-2 bg-gradient-to-r from-purple-500/0 via-purple-400/60 to-purple-500/0 transform -rotate-[25deg] blur-sm animate-pulse" style={{ animationDelay: '0.5s' }}></div>
                  
                  <div className="absolute bottom-6 right-6 p-4 rounded-2xl bg-black/90 border border-purple-500/30 backdrop-blur-xl shadow-[0_0_30px_rgba(168,85,247,0.15)] max-w-sm flex gap-4 items-start">
                    <div className="p-2 rounded-lg bg-purple-500/20 text-purple-400">
                      <Wind className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="block text-purple-400 font-bold text-xs uppercase tracking-widest mb-1">Catchment Alert</span>
                      <p className="text-slate-300 text-sm leading-relaxed">High traffic volume on {selectedSpot.name} washing estimated <span className="text-white font-mono font-bold bg-purple-500/20 px-1 rounded">12.4kg</span> of toxic tire wear particles into Drain 14.</p>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Risk Card connected to Backend */}
          <motion.div 
            key={`${selectedSpot.id}-${vehicle.id}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`relative overflow-hidden p-8 rounded-3xl border backdrop-blur-xl transition-all duration-500 ${theme.bg} ${theme.border} ${theme.glow}`}
          >
            <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${theme.gradient}`}></div>
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                {theme.icon}
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400 mb-1">AI Risk Assessment</h3>
                  <div className={`text-3xl md:text-4xl font-black tracking-tight ${theme.color}`}>
                    {theme.status}
                  </div>
                </div>
              </div>
              
              <div className="flex gap-8">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Risk Score</div>
                  <div className={`text-2xl font-mono font-bold ${theme.color}`}>
                    {(riskScore * 100).toFixed(0)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500 mb-1">Clearance</div>
                  <div className="text-2xl font-mono font-bold text-white">
                    {vehicle.intakeHeight - selectedSpot.depth_mm}<span className="text-sm text-slate-500">mm</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-6 border-t border-white/10">
              <div className="flex items-start gap-4 min-h-[48px]">
                <Info className={`w-5 h-5 shrink-0 mt-0.5 ${theme.color}`} />
                {isAiLoading ? (
                  <div className="text-slate-400 font-mono text-sm animate-pulse flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-slate-500 border-t-white rounded-full animate-spin"></div>
                    Querying AWS Bedrock (Claude)...
                  </div>
                ) : (
                  <p className="text-base/relaxed text-slate-300 font-medium">
                    {aiAdvisory}
                  </p>
                )}
              </div>
              
              <div className="mt-6 flex gap-3">
                 <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-slate-400">
                   <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
                   Connected to /api/bedrock
                 </span>
                 <span className="inline-flex items-center px-3 py-1.5 rounded-lg bg-black/40 border border-white/5 text-xs font-mono text-slate-400">
                   <span className="w-1.5 h-1.5 rounded-full bg-orange-500 mr-2"></span>
                   AWS SDK v3
                 </span>
              </div>
            </div>
          </motion.div>

        </div>
      </main>
      
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(6, 182, 212, 0.5); }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}} />
    </div>
  );
}
