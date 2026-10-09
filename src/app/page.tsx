'use client';

import { motion } from 'framer-motion';
import { ShieldAlert, Car, Map as MapIcon, Activity, ChevronRight, Lock, UserPlus, Fingerprint } from 'lucide-react';
import Link from 'next/link';

export default function LandingPage() {
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
            <Link href="/dashboard" className="px-6 py-2.5 bg-white text-black text-sm font-bold uppercase tracking-wider rounded-lg hover:bg-slate-200 transition-colors flex items-center gap-2">
              Go to Map <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <div className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-500/20 rounded-full blur-[120px] opacity-50 pointer-events-none"></div>
        
        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 text-xs font-mono mb-8">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            LIVE: Over 4,200 active sensors globally
          </motion.div>
          
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }} className="text-6xl md:text-8xl font-black text-white tracking-tighter leading-tight mb-8">
            Don't let a puddle <br className="hidden md:block"/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">hydrolock your engine.</span>
          </motion.h1>
          
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.2 }} className="text-xl text-slate-400 max-w-2xl mx-auto mb-12 leading-relaxed">
            FloodFlow uses crowdsourced Vision AI and AWS Bedrock to calculate exact water depths and cross-reference them with your vehicle's factory specifications in real-time.
          </motion.p>
          
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.3 }} className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login" className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold text-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(6,182,212,0.3)]">
              <UserPlus className="w-5 h-5" /> Create Free Account
            </Link>
            <Link href="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-white/5 border border-white/10 text-white rounded-xl font-bold text-lg hover:bg-white/10 transition-all flex items-center justify-center gap-2">
              <Fingerprint className="w-5 h-5 text-slate-400" /> Continue as Guest
            </Link>
          </motion.div>
          <p className="mt-4 text-xs font-mono text-slate-500">Guests are limited to standard sedan/SUV reference models.</p>
        </div>
      </div>

      {/* Impact Metric Strip */}
      <div className="border-y border-white/5 bg-white/[0.01]">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-center divide-y md:divide-y-0 md:divide-x divide-white/10">
            <div className="p-4">
              <div className="text-5xl font-black text-white mb-2">$4.2M</div>
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

      {/* Features Grid */}
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

    </div>
  );
}
