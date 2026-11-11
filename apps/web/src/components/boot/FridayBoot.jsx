import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, Cpu } from 'lucide-react';
import { NebulaOrb } from '../../features/friday/components/NebulaOrb';

export function FridayBoot({ onComplete }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Check user preference for reduced motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    const t1 = setTimeout(() => setStage(1), 600);
    const t2 = setTimeout(() => setStage(2), 1400);
    const t3 = setTimeout(() => {
      onComplete();
    }, 3200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center nebula-canvas starfield cursor-pointer select-none overflow-hidden"
    >
      {/* Background Cosmic Deep Auroras */}
      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: [0, 0.9, 0.6], scale: [0.6, 1.6, 1.8] }}
        transition={{ duration: 2.5, ease: "easeOut" }}
        className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-purple-600/40 via-pink-600/35 to-cyan-500/30 blur-[130px] pointer-events-none"
      />

      {/* Holographic Concentric Rings Framing the 3D Orb */}
      <div className="relative flex items-center justify-center mb-6">
        <motion.div
          initial={{ opacity: 0, rotate: 0, scale: 0.8 }}
          animate={{ opacity: 0.45, rotate: 360, scale: 1 }}
          transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
          className="absolute w-64 h-64 rounded-full border border-purple-400/30 border-dashed"
        />
        <motion.div
          initial={{ opacity: 0, rotate: 360, scale: 0.9 }}
          animate={{ opacity: 0.6, rotate: 0, scale: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut", repeat: Infinity }}
          className="absolute w-52 h-52 rounded-full border border-pink-400/40 border-t-transparent"
        />

        {/* Central 3D Glowing Cosmic Plasma AI Orb */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.1, 1], opacity: 1 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
          className="relative z-10 drop-shadow-[0_0_35px_rgba(236,72,153,0.65)]"
        >
          <NebulaOrb isStreaming={true} size={140} />
        </motion.div>
      </div>

      {/* Stylized Acronym Reveal */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.4 }}
        className="text-center relative z-10"
      >
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-white to-pink-200 drop-shadow-[0_0_25px_rgba(168,85,247,0.7)]">
          F . R . I . D . A . Y .
        </h1>
        <p className="mt-2 text-xs md:text-sm font-medium tracking-widest text-purple-200/70 uppercase">
          Female Replacement Intelligent Digital Assistant Youth
        </p>
      </motion.div>

      {/* System Diagnostic Status Badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: stage >= 1 ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        className="mt-8 flex items-center gap-6 text-xs text-slate-300 font-mono relative z-10"
      >
        <div className="flex items-center gap-1.5 text-purple-400 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]">
          <Cpu className="w-3.5 h-3.5" />
          <span>NEURAL CORE: ONLINE</span>
        </div>
        <div className="flex items-center gap-1.5 text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.5)]">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SECURITY: ISOLATED</span>
        </div>
      </motion.div>

      <p className="absolute bottom-6 text-[10px] text-slate-400 font-mono tracking-wider animate-pulse">
        CLICK ANYWHERE TO ENTER WORKSPACE
      </p>
    </div>
  );
}
