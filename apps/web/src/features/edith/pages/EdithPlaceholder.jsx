import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Terminal, Sparkles, ArrowLeft, Code, Play } from 'lucide-react';

export function EdithPlaceholder() {
  const navigate = useNavigate();

  return (
    <div className="flex h-screen w-screen bg-ide-bg text-slate-200 overflow-hidden font-mono flex-col">
      {/* Top Header */}
      <header className="h-12 border-b border-ide-border px-4 flex items-center justify-between bg-ide-surface">
        <div className="flex items-center gap-3">
          <Terminal className="w-4 h-4 text-ide-accent" />
          <span className="font-bold text-sm tracking-wider text-white">E.D.I.T.H. // DEVELOPER IDE</span>
          <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            RUNNER: ONLINE
          </span>
        </div>

        {/* REDIRECT BACK TO F.R.I.D.A.Y. */}
        <button
          onClick={() => navigate('/friday')}
          className="flex items-center gap-2 px-3 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 hover:border-violet-500 text-xs text-slate-300 hover:text-white transition-all cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
          <span>Return to F.R.I.D.A.Y.</span>
        </button>
      </header>

      {/* Main Placeholder Screen */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-ide-surface border border-ide-border flex items-center justify-center text-ide-accent mb-4 shadow-lg">
          <Code className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-white tracking-wide">
          E.D.I.T.H. Autonomous Development Environment
        </h2>
        <p className="mt-2 text-xs text-slate-400 max-w-md">
          Even Dead, I'm The Hero — Dedicated coding agent workbench with Monaco editor, isolated Hyper-V runner terminal, and hunk diff review.
        </p>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={() => navigate('/friday')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-violet-600 text-white text-xs font-semibold shadow-md hover:opacity-90 transition-opacity cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Open F.R.I.D.A.Y. Assistant</span>
          </button>
        </div>
      </div>
    </div>
  );
}
