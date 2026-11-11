import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, Cpu, Sparkles } from 'lucide-react';

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
    }, 2800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onComplete]);

  return (
    <div
      onClick={onComplete}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-nebula-space cursor-pointer select-none overflow-hidden"
    >
      {/* Background Cosmic Ignition Burst */}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.8, 0.4], scale: [0.5, 1.8, 2] }}
        transition={{ duration: 2.2, ease: "easeOut" }}
        className="absolute w-[500px] h-[500px] rounded-full bg-gradient-to-tr from-cyan-600/30 via-violet-600/30 to-pink-600/20 blur-[100px] pointer-events-none"
      />

      {/* Holographic Ring Reticles */}
      <div className="relative flex items-center justify-center mb-8">
        <motion.div
          initial={{ opacity: 0, rotate: 0, scale: 0.8 }}
          animate={{ opacity: 0.6, rotate: 360, scale: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          className="absolute w-48 h-48 rounded-full border border-cyan-400/30 border-dashed"
        />
        <motion.div
          initial={{ opacity: 0, rotate: 360, scale: 0.9 }}
          animate={{ opacity: 0.8, rotate: 0, scale: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          className="absolute w-36 h-36 rounded-full border border-violet-400/40 border-t-transparent"
        />

        {/* Central Luminous Core */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-16 h-16 rounded-full bg-gradient-to-tr from-cyan-400 to-violet-500 shadow-nebula-glow flex items-center justify-center"
        >
          <Sparkles className="w-8 h-8 text-white animate-pulse" />
        </motion.div>
      </div>

      {/* Stylized Acronym Reveal */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.5 }}
        className="text-center"
      >
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-violet-300 drop-shadow-[0_0_20px_rgba(6,182,212,0.6)]">
          F . R . I . D . A . Y .
        </h1>
        <p className="mt-2 text-xs md:text-sm font-medium tracking-widest text-cyan-200/60 uppercase">
          Female Replacement Intelligent Digital Assistant Youth
        </p>
      </motion.div>

      {/* System Diagnostic Status Badges */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: stage >= 1 ? 1 : 0 }}
        transition={{ duration: 0.5 }}
        className="mt-8 flex items-center gap-6 text-xs text-slate-400 font-mono"
      >
        <div className="flex items-center gap-1.5 text-cyan-400">
          <Cpu className="w-3.5 h-3.5" />
          <span>NEURAL CORE: ONLINE</span>
        </div>
        <div className="flex items-center gap-1.5 text-emerald-400">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>SECURITY: ISOLATED</span>
        </div>
      </motion.div>

      <p className="absolute bottom-6 text-[10px] text-slate-500 tracking-wider">
        CLICK ANYWHERE TO ENTER WORKSPACE
      </p>
    </div>
  );
}

