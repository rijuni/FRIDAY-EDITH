import React from 'react';
import { Sparkles, Activity } from 'lucide-react';

export function NebulaCore3D({ isStreaming }) {
  return (
    <div className="relative w-64 h-56 flex flex-col items-center justify-center select-none my-2">
      {/* Outer Atmospheric Aura */}
      <div
        className={`absolute w-52 h-52 rounded-full blur-3xl transition-all duration-1000 ${
          isStreaming
            ? 'bg-gradient-to-tr from-cyan-500/50 via-violet-500/40 to-pink-500/40 scale-125'
            : 'bg-gradient-to-tr from-cyan-500/25 via-violet-600/25 to-blue-600/20 scale-100'
        }`}
      />

      {/* Holographic Concentric Rings (Rotating in 3D perspective) */}
      <div className="relative w-44 h-44 flex items-center justify-center">
        {/* Ring 1 - Outer Cyan Dashed Reticle */}
        <div
          className={`absolute inset-0 rounded-full border border-cyan-400/40 border-dashed motion-reduce:animate-none ${
            isStreaming ? 'animate-spin' : 'animate-spin-slow'
          }`}
          style={{ animationDuration: isStreaming ? '8s' : '28s' }}
        />

        {/* Ring 2 - Reverse Violet Tilted Ring */}
        <div
          className="absolute w-36 h-36 rounded-full border-2 border-violet-500/40 border-t-transparent border-b-cyan-400/60 animate-spin motion-reduce:animate-none"
          style={{ animationDuration: isStreaming ? '5s' : '18s', animationDirection: 'reverse' }}
        />

        {/* Ring 3 - Innermost Glowing Accent Ring */}
        <div
          className="absolute w-28 h-28 rounded-full border border-pink-400/30 border-l-transparent animate-spin motion-reduce:animate-none"
          style={{ animationDuration: '12s' }}
        />

        {/* Central Luminous Core (Energy Orb) */}
        <div
          className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-700 ${
            isStreaming
              ? 'bg-gradient-to-tr from-cyan-400 via-indigo-400 to-violet-500 shadow-cyan-glow scale-110'
              : 'bg-gradient-to-tr from-cyan-500/80 via-violet-600/80 to-purple-800/80 shadow-nebula-glow'
          }`}
        >
          {/* Inner Light Pulse */}
          <div className="absolute inset-1 rounded-full bg-white/20 blur-sm animate-pulse motion-reduce:animate-none" />
          <Sparkles className="relative z-10 w-9 h-9 text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.8)]" />
        </div>
      </div>

      {/* Futuristic Telemetry & Real-time Waveform Bars */}
      <div className="mt-4 flex flex-col items-center gap-1.5 z-10">
        <div className="flex items-center gap-2">
          {/* Audio/Cognitive Waveform Frequency Bars */}
          <div className="flex items-center gap-1 h-3">
            {[40, 75, 50, 90, 60, 100, 70, 45, 85, 30].map((h, i) => (
              <span
                key={i}
                className={`w-0.5 rounded-full transition-all duration-300 ${
                  isStreaming ? 'bg-cyan-400 animate-pulse' : 'bg-violet-400/50'
                }`}
                style={{
                  height: isStreaming ? `${h}%` : `${Math.max(20, h * 0.4)}%`,
                  animationDelay: `${i * 80}ms`
                }}
              />
            ))}
          </div>

          <span className="text-[11px] font-mono tracking-widest text-cyan-300 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)] font-semibold">
            {isStreaming ? 'STREAMING SYNAPSE...' : 'F.R.I.D.A.Y. CORE ACTIVE'}
          </span>
        </div>

        <p className="text-[10px] font-mono text-slate-400 tracking-wider">
          NEBULA QUANTUM ENGINE // LATENCY: 24MS // OWASP ASVS SECURED
        </p>
      </div>
    </div>
  );
}
