import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Check, X, Shield, ArrowLeftRight } from 'lucide-react';

export function MonacoDiffViewer({
  filename = 'gateway.py',
  original = '',
  modified = '',
  onAccept,
  onReject
}) {
  return (
    <div className="w-full h-full flex flex-col bg-[#070a12] text-slate-200">
      {/* Diff Review Control Bar */}
      <div className="h-10 px-4 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0 font-mono text-xs">
        <div className="flex items-center gap-2">
          <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-white font-semibold">{filename}</span>
          <span className="text-[10px] text-slate-400">// Unified Diff Hunk Review</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reject Patch</span>
          </button>
          <button
            onClick={onAccept}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-400/40 text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-emerald-500/20"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Apply Hunks</span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Monaco Diff Editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          height="100%"
          language="python"
          original={original}
          modified={modified}
          theme="vs-dark"
          options={{
            fontSize: 13,
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            readOnly: true,
            renderSideBySide: true,
            minimap: { enabled: false },
            automaticLayout: true,
            scrollBeyondLastLine: false
          }}
        />
      </div>
    </div>
  );
}

