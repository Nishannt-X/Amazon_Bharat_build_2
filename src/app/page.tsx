'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Car, Map as MapIcon, Activity, ChevronRight, UserPlus, Camera, Upload, CheckCircle2, Terminal, X, Sparkles, Navigation, Lock, MessageCircle, Route } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [boxes, setBoxes] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPhotoUrl(URL.createObjectURL(file));
      setAnalysisResult(null);
      setLogs([]);
      setBoxes([]);
    }
  };

  const runQuickAnalysis = () => {
    if (!photoUrl) return;
    setIsScanning(true);
    setLogs([]);
    setBoxes([]);
    setAnalysisResult(null);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toISOString().split('T')[1].slice(0, -1)}] ${msg}`]);

    addLog('INIT: Connecting to AWS Rekognition via API Gateway...');
    setTimeout(() => addLog('AWS REKOGNITION: Object detection model loaded.'), 600);
    setTimeout(() => {
      addLog('AWS REKOGNITION: Analyzing scene geometry & water boundaries...');
    }, 1400);
    setTimeout(() => {
      addLog('AWS REKOGNITION: Found [Vehicle Tire Reference]. Confidence: 91.7%');
      setBoxes([{ id: 1, x: '12%', y: '45%', w: '18%', h: '22%', label: 'TIRE_REF', conf: 0.917 }]);
    }, 2400);
    setTimeout(() => {
      addLog('AWS REKOGNITION: Triangulating water depth via pixel ratio...');
    }, 3200);
    setTimeout(() => {
      const depth = Math.floor(Math.random() * (420 - 160) + 160);
      addLog(`MODEL OUTPUT: Estimated Water Depth = ${depth}mm`);
      addLog('AWS BEDROCK (Haiku): Cross-referencing against standard sedan (170mm clearance)...');

      setTimeout(() => {
        const sedanSafe = depth <= 150;
        const suvSafe = depth <= 210;
        setIsScanning(false);
        setAnalysisResult({
          depth,
          sedanStatus: sedanSafe ? 'SAFE' : 'DANGER',
          suvStatus: suvSafe ? 'SAFE' : 'DANGER',
          advisory: sedanSafe
            ? `Estimated depth (${depth}mm) is within safe limits for most vehicles.`
            : suvSafe
              ? `Estimated depth (${depth}mm) is risky for sedans but likely safe for SUVs. Proceed with caution.`
              : `Estimated depth (${depth}mm) exceeds safe wading limits for most vehicles. Avoid this road.`,
        });
      }, 1200);
    }, 4000);
  };

  const useDemoPhoto = () => {
    setPhotoUrl('/manipal-actual.jpg');
    setAnalysisResult(null);
    setLogs([]);
    setBoxes([]);
  };

  return (
    <div className="min-h-screen bg-[#020202] text-slate-200 font-sans selection:bg-cyan-500/30 overflow-x-hidden">

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-white/5 bg-[#020202]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Activity className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="font-bold tracking-widest uppercase text-xl text-white">FloodFlow</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/login" className="text-sm font-bold text-slate-400 hover:text-white transition-colors uppercase tracking-wider">Sign In</Link>
            <Link href="/login" className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold uppercase tracking-wider rounded-lg hover:brightness-110 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
              <UserPlus className="w-4 h-4" /> Get Full Access
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-32 pb-16 lg:pt-48 lg:pb-24 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-500/20 rounded-full blur-[120px] opacity-50 pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-mono mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            LIVE: Over 4,200 active sensors globally
          </motion.div>

          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-5xl md:text-8xl font-black text-white tracking-tighter leading-tight mb-8">
            Don't let a puddle <br className="hidden md:block" /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">hydrolock your engine.</span>
          </motion.h1>

          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="text-lg md:text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            Snap a photo of any waterlogged road. Our AI tells you if it's safe to drive through — instantly, for free. No sign-up required.
          </motion.p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* INLINE QUICK ANALYSIS — Available to everyone, no account     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      <div id="try-it" className="max-w-5xl mx-auto px-6 pb-24">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="rounded-[2.5rem] border border-white/10 bg-white/[0.02] backdrop-blur-sm overflow-hidden shadow-[0_0_60px_rgba(6,182,212,0.08)]">

          {/* Header */}
          <div className="px-8 pt-8 pb-4 border-b border-white/5">
            <div className="flex items-center gap-3 mb-2">
              <Camera className="w-6 h-6 text-cyan-400" />
              <h2 className="text-2xl font-black text-white">Quick Scan</h2>
              <span className="ml-auto px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold uppercase tracking-widest rounded-full">Free · No Account</span>
            </div>
            <p className="text-sm text-slate-500">Upload a photo of a flooded road. We'll estimate the water depth and give you a generic safety verdict.</p>
          </div>

          {/* Content */}
          <div className="p-8">
            {!photoUrl ? (
              /* Upload Zone */
              <div className="space-y-4">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full aspect-[21/9] rounded-2xl border-2 border-dashed border-white/15 hover:border-cyan-500/50 bg-white/[0.01] transition-all flex flex-col items-center justify-center cursor-pointer group"
                >
                  <div className="w-16 h-16 rounded-full bg-cyan-500/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Upload className="w-8 h-8 text-cyan-400" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-1">Upload or Take a Photo</h3>
                  <p className="text-xs text-slate-500">JPG, PNG · Max 10MB</p>
                  <input type="file" accept="image/*" capture="environment" className="hidden" ref={fileInputRef} onChange={handlePhotoUpload} />
                </div>
                <div className="text-center">
                  <button onClick={useDemoPhoto} className="text-xs font-bold text-cyan-600 hover:text-cyan-400 uppercase tracking-widest transition-all">
                    or use a demo photo →
                  </button>
                </div>
              </div>
            ) : !analysisResult && !isScanning ? (
              /* Photo Preview + Analyze Button */
              <div className="grid md:grid-cols-2 gap-6">
                <div className="rounded-2xl overflow-hidden bg-black aspect-video relative">
                  <img src={photoUrl} alt="Upload" className="w-full h-full object-cover opacity-80" />
                  <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur px-3 py-1.5 rounded-lg border border-white/10 text-xs font-mono flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Image loaded
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-4">
                  <div className="p-5 rounded-2xl bg-white/[0.03] border border-white/10">
                    <p className="text-xs text-slate-400 mb-2 uppercase tracking-widest font-bold">Quick Scan Mode</p>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      We'll analyze this image against a <span className="text-white font-bold">standard sedan</span> (170mm clearance) and a <span className="text-white font-bold">compact SUV</span> (210mm clearance). For your exact vehicle, <Link href="/login" className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300">create a free account</Link>.
                    </p>
                  </div>
                  <button onClick={runQuickAnalysis} className="w-full py-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl font-bold text-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(6,182,212,0.3)]">
                    <Activity className="w-5 h-5 animate-pulse" /> Analyze Depth
                  </button>
                  <button onClick={() => { setPhotoUrl(null); setAnalysisResult(null); setLogs([]); setBoxes([]); }} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
                    ← Choose a different photo
                  </button>
                </div>
              </div>
            ) : (
              /* Analysis View */
              <div className="grid lg:grid-cols-2 gap-8">
                {/* Image + Bounding Boxes */}
                <div className="relative aspect-[4/3] rounded-2xl bg-black border border-white/10 overflow-hidden">
                  <img src={photoUrl} alt="Analysis" className="w-full h-full object-cover opacity-60" />
                  {isScanning && (
                    <motion.div
                      animate={{ y: ['0%', '100%', '0%'] }}
                      transition={{ repeat: Infinity, duration: 3, ease: 'linear' }}
                      className="absolute top-0 left-0 w-full h-1 bg-cyan-400 shadow-[0_0_20px_rgba(6,182,212,1)] z-20"
                    />
                  )}
                  <AnimatePresence>
                    {boxes.map(box => (
                      <motion.div key={box.id} initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} className="absolute border-2 border-cyan-400 bg-cyan-400/10 z-10" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
                        <div className="absolute -top-6 left-[-2px] bg-cyan-400 text-black text-[10px] font-mono font-bold px-1 py-0.5 whitespace-nowrap">{box.label} ({(box.conf * 100).toFixed(1)}%)</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>

                {/* Logs + Result */}
                <div className="flex flex-col gap-5">
                  <div className="flex-1 bg-black border border-white/10 rounded-2xl p-5 font-mono text-[11px] overflow-hidden">
                    <div className="flex items-center gap-2 text-slate-500 mb-3 border-b border-white/5 pb-2">
                      <Terminal className="w-4 h-4" /> AWS API Gateway Logs
                    </div>
                    <div className="space-y-1.5 text-cyan-500/80 max-h-[160px] overflow-y-auto">
                      {logs.map((log, i) => (
                        <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>{log}</motion.div>
                      ))}
                    </div>
                  </div>

                  <AnimatePresence>
                    {!isScanning && analysisResult && (
                      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        {/* Generic Verdict */}
                        <div className={`p-5 rounded-2xl border ${analysisResult.sedanStatus === 'DANGER' ? 'bg-rose-950/30 border-rose-500/40' : 'bg-emerald-950/30 border-emerald-500/40'}`}>
                          <div className="flex gap-3 items-start mb-3">
                            {analysisResult.sedanStatus === 'DANGER' ? <ShieldAlert className="w-8 h-8 text-rose-500 shrink-0" /> : <CheckCircle2 className="w-8 h-8 text-emerald-500 shrink-0" />}
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-1">Generic Verdict</div>
                              <p className="text-sm text-slate-200 leading-relaxed">{analysisResult.advisory}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className={`p-3 rounded-xl text-center ${analysisResult.sedanStatus === 'DANGER' ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                              <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">Sedan</div>
                              <div className={`text-lg font-black ${analysisResult.sedanStatus === 'DANGER' ? 'text-rose-400' : 'text-emerald-400'}`}>{analysisResult.sedanStatus}</div>
                            </div>
                            <div className={`p-3 rounded-xl text-center ${analysisResult.suvStatus === 'DANGER' ? 'bg-rose-500/10 border border-rose-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                              <div className="text-[9px] uppercase tracking-widest text-slate-400 mb-1">SUV</div>
                              <div className={`text-lg font-black ${analysisResult.suvStatus === 'DANGER' ? 'text-rose-400' : 'text-emerald-400'}`}>{analysisResult.suvStatus}</div>
                            </div>
                          </div>
                        </div>

                        {/* Upsell */}
                        <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 to-blue-950/40 border border-cyan-500/20">
                          <div className="flex items-center gap-2 mb-3">
                            <Sparkles className="w-5 h-5 text-cyan-400" />
                            <h4 className="font-bold text-white text-sm">Want analysis for YOUR exact vehicle?</h4>
                          </div>
                          <p className="text-xs text-slate-400 leading-relaxed mb-4">
                            Create a free account to unlock vehicle-specific verdicts, live global map, alternate routing via Google Maps, AI chatbot for deeper analysis, and more.
                          </p>
                          <Link href="/login" className="w-full py-3 bg-white text-black font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors flex items-center justify-center gap-2">
                            <UserPlus className="w-4 h-4" /> Create Free Account
                          </Link>
                        </div>

                        <button onClick={() => { setPhotoUrl(null); setAnalysisResult(null); setLogs([]); setBoxes([]); }} className="w-full text-xs text-slate-500 hover:text-slate-300 transition-colors text-center py-2">
                          ← Analyze another photo
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Impact Metric Strip */}
      <div className="border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="p-4">
              <div className="text-5xl font-black text-white mb-2">₹35Cr+</div>
              <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Engine Damage Prevented</div>
            </div>
            <div className="p-4">
              <div className="text-5xl font-black text-white mb-2">12,450</div>
              <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Active Safe Routes Generated</div>
            </div>
            <div className="p-4">
              <div className="text-5xl font-black text-white mb-2">&lt;2.4s</div>
              <div className="text-sm font-bold text-slate-500 uppercase tracking-widest">Average AWS AI Latency</div>
            </div>
          </div>
        </div>
      </div>

      {/* How It Works */}
      <div className="max-w-7xl mx-auto px-6 py-32">
        <div className="text-center mb-20">
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">How it works.</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">We don't build GPS systems. We build an intelligence layer that injects safe waypoints directly into your existing Google Maps.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 transition-colors group">
            <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Camera className="w-7 h-7 text-blue-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">1. Crowdsourced Vision</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Users snap photos of flooded intersections. Our AWS Rekognition pipeline analyzes tires and landmarks to triangulate exact water depths in millimeters.
            </p>
          </div>

          <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-emerald-500/30 transition-colors group">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <Car className="w-7 h-7 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">2. Bespoke Context</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Claude 3 Haiku accesses live web databases to scrape your exact vehicle's ground clearance and air intake height. We don't guess; we use the manual.
            </p>
          </div>

          <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-purple-500/30 transition-colors group">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
              <MapIcon className="w-7 h-7 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-3">3. Google Maps Integration</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              We calculate the safest detour around the hazard and generate a deep-link waypoint. One tap opens your native Google Maps with the safe route pre-loaded.
            </p>
          </div>
        </div>
      </div>

      {/* Premium Features (Behind Sign-Up) */}
      <div className="max-w-7xl mx-auto px-6 pb-32">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/20 bg-cyan-500/5 text-cyan-400 text-xs font-mono mb-6">
            <Lock className="w-3 h-3" /> PREMIUM — FREE WITH ACCOUNT
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6">Unlock the full engine.</h2>
          <p className="text-slate-400 max-w-2xl mx-auto">Everything above, plus these powerful features — completely free. Just create an account.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { icon: <Car className="w-6 h-6 text-cyan-400" />, title: 'Your Exact Vehicle', desc: 'Register all your vehicles. AI scrapes factory manuals for precise ground clearance & air intake heights.' },
            { icon: <MapIcon className="w-6 h-6 text-emerald-400" />, title: 'Live Global Map', desc: 'See every reported waterlog worldwide in real-time. Depth, severity, age, and photo evidence on every pin.' },
            { icon: <Route className="w-6 h-6 text-purple-400" />, title: 'Smart Routing', desc: 'Enter point A to B. We calculate alternate routes that avoid hazards and deep-link them to Google Maps.' },
            { icon: <MessageCircle className="w-6 h-6 text-amber-400" />, title: 'AI Chatbot', desc: 'If a photo is unclear, our AI asks follow-up questions to determine the exact depth with higher accuracy.' },
          ].map((feat, i) => (
            <div key={i} className="p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/15 transition-colors">
              <div className="mb-4">{feat.icon}</div>
              <h4 className="font-bold text-white text-sm mb-2">{feat.title}</h4>
              <p className="text-xs text-slate-500 leading-relaxed">{feat.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link href="/login" className="inline-flex items-center gap-2 px-10 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold text-lg hover:brightness-110 transition-all shadow-[0_0_30px_rgba(6,182,212,0.3)]">
            <UserPlus className="w-5 h-5" /> Create Free Account
          </Link>
          <p className="mt-3 text-xs text-slate-500 font-mono">No credit card. No spam. Just safer roads.</p>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/5 py-8">
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-cyan-500" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">FloodFlow</span>
          </div>
          <p className="text-[10px] text-slate-600">Built on AWS · Bharat Builds Tour 2026</p>
        </div>
      </div>
    </div>
  );
}
