import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { Check, X, ArrowLeftRight, AlertCircle, Loader2 } from 'lucide-react';
import { getMonacoLanguage } from '../utils/language';

export function MonacoDiffViewer({
  filename = 'untitled.txt',
  original = '',
  modified = '',
  isSimulated = false,
  isApplying = false,
  error = null,
  onAccept,
  onReject
}) {
  const hasChanges = original !== modified;

  return (
    <div className="w-full h-full flex flex-col bg-[#070a12] text-slate-200">
      {/* Diff Review Control Bar */}
      <div className="h-10 px-4 border-b border-white/10 bg-white/[0.03] flex items-center justify-between shrink-0 font-mono text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className="text-white font-semibold truncate">{filename}</span>
          <span className="text-[10px] text-slate-400 shrink-0">// Unified Diff Hunk Review</span>
          {isSimulated && (
            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/35 text-[10px] text-amber-200 shrink-0">
              Preview Patch
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onReject}
            disabled={isApplying}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-300 border border-red-500/30 text-xs transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            <span>Reject Patch</span>
          </button>
          <button
            type="button"
            onClick={onAccept}
            disabled={isApplying || !hasChanges}
            className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-40 disabled:cursor-not-allowed text-emerald-300 border border-emerald-400/40 text-xs font-semibold transition-colors cursor-pointer shadow-md shadow-emerald-500/20"
          >
            {isApplying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
            <span>{isApplying ? 'Applying...' : 'Apply Hunks'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="px-4 py-2 bg-red-500/15 border-b border-red-400/30 text-xs text-red-200 flex items-center gap-2 font-mono"
        >
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Side-by-Side Monaco Diff Editor */}
      <div className="flex-1 min-h-0">
        <DiffEditor
          height="100%"
          language={getMonacoLanguage(filename)}
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
