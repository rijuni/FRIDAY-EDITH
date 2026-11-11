import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Terminal, ShieldCheck, Cpu, Code2, Sparkles, Layers, ArrowRight } from 'lucide-react';
import { EdithCore3D } from '../../features/edith/components/EdithCore3D';

export function EdithBoot({ onComplete }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    const t1 = setTimeout(() => setStage(1), 500);
    const t2 = setTimeout(() => setStage(2), 1200);
    const t3 = setTimeout(() => onComplete(), 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center nebula-canvas starfield text-slate-100 cursor-pointer select-none overflow-hidden font-sans"
    >
      {/* Background Deep Cyan & Emerald Tactical Aurora Glows */}
      <div className="absolute top-1/6 left-1/4 w-[700px] h-[550px] rounded-full bg-gradient-to-tr from-cyan-600/35 via-blue-600/25 to-emerald-600/20 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 w-[650px] h-[450px] rounded-full bg-gradient-to-tr from-teal-500/30 via-indigo-600/20 to-cyan-500/25 blur-[150px] pointer-events-none" />

      {/* Cyber Grid Pattern Overlay */}
      <div 
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(6, 182, 212, 0.2) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(6, 182, 212, 0.2) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px'
        }}
      />

      {/* Sweeping Laser Scan Line */}
      <motion.div
        initial={{ top: '-10%' }}
        animate={{ top: '110%' }}
        transition={{ duration: 2.4, ease: "linear", repeat: Infinity }}
        className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_20px_#22d3ee] pointer-events-none opacity-75"
      />

      {/* Central 3D Holographic Arc Reactor Core */}
      <div className="relative flex items-center justify-center mb-6 z-10">
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.1, 1], opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="relative drop-shadow-[0_0_40px_rgba(6,182,212,0.65)]"
        >
          <EdithCore3D size={145} isBusy={true} />
        </motion.div>
      </div>

      {/* Stylized Acronym Reveal */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.3 }}
        className="text-center relative z-10"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full frosted-glass-card text-[11px] font-mono text-cyan-300 tracking-widest uppercase mb-3 border border-cyan-400/30 shadow-lg shadow-cyan-500/20">
          <Terminal className="w-3.5 h-3.5 text-cyan-400" />
          <span>Tactical IDE Environment</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-black tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 via-white to-emerald-200 drop-shadow-[0_0_30px_rgba(6,182,212,0.8)]">
          E . D . I . T . H .
        </h1>
        <p className="mt-2 text-xs md:text-sm font-medium tracking-widest text-cyan-300/80 uppercase font-mono">
          Even Dead, I'm The Hero
        </p>
      </motion.div>

      {/* 3 Floating Frosted Glass Telemetry Badges */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: stage >= 1 ? 1 : 0, y: stage >= 1 ? 0 : 10 }}
        transition={{ duration: 0.5 }}
        className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3 max-w-xl mx-auto w-full px-4 relative z-10"
      >
        <div className="p-3 rounded-2xl frosted-glass-card border border-cyan-400/30 text-left">
          <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold mb-1">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Reasoning Engine</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Claude 3.7 / GPT-4o DAG Planner</p>
        </div>

        <div className="p-3 rounded-2xl frosted-glass-card border border-emerald-400/30 text-left">
          <div className="flex items-center gap-2 text-emerald-300 text-xs font-semibold mb-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Sandbox Boundary</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Native Runner Port 8003</p>
        </div>

        <div className="p-3 rounded-2xl frosted-glass-card border border-blue-400/30 text-left">
          <div className="flex items-center gap-2 text-blue-300 text-xs font-semibold mb-1">
            <Code2 className="w-3.5 h-3.5 text-blue-400" />
            <span>AST Indexer</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono">Multi-Language Code Graph</p>
        </div>
      </motion.div>

      {/* Bottom Dismiss */}
      <p className="absolute bottom-6 text-[10px] text-cyan-400/70 font-mono tracking-widest animate-pulse">
        [ INITIALIZING WORKSPACE // CLICK ANYWHERE TO ENTER ]
      </p>
    </div>
  );
}
