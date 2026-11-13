import React, { useState } from 'react';
import {
  Send,
  Cpu,
  Terminal,
  CheckCircle2,
  FileCode,
  Wand2,
  RefreshCw,
  X,
  ChevronRight,
  AlertCircle
} from 'lucide-react';
import { apiFetch, safeParseJson } from '../../../lib/apiClient';

export function EdithAgentPanel({
  isOpen = true,
  activeFile = null,
  onClose,
  onOpenDiffReview,
  onBusyChange
}) {
  const [prompt, setPrompt] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState(null);
  const [lastPrompt, setLastPrompt] = useState(null);
  const [agentSteps, setAgentSteps] = useState([
    {
      step_id: 'init_1',
      phase: 'complete',
      title: 'E.D.I.T.H. Workflow Agent Ready',
      detail:
        'Workspace analysis and diff previews are available. Patch previews are clearly marked and require your review before applying.',
      status: 'completed'
    }
  ]);

  const quickActions = [
    { label: '/scan', text: 'Inspect active workspace symbols and summarize architecture' },
    { label: '/patch', text: 'Preview a safe diff patch for gateway.py policy checks' },
    { label: '/test', text: 'Prepare pytest verification plan and check command policy' },
    { label: '/audit', text: 'Analyze diff_generator and summarize patch verification' }
  ];

  const updateBusy = (next) => {
    setIsBusy(next);
    if (onBusyChange) onBusyChange(next);
  };

  const handleRunAgent = async (taskText = null) => {
    const textToRun = (typeof taskText === 'string' ? taskText : prompt).trim();
    if (!textToRun || isBusy) return;

    if (typeof taskText !== 'string') {
      setPrompt('');
    }
    setError(null);
    setLastPrompt(textToRun);
    updateBusy(true);

    const pendingId = `step_pending_${Date.now()}`;
    setAgentSteps((prev) => [
      ...prev,
      {
        step_id: pendingId,
        phase: 'thinking',
        title: 'Executing Workspace Workflow...',
        detail: `Sending instruction to E.D.I.T.H. Engine: "${textToRun}"`,
        status: 'running'
      }
    ]);

    try {
      const res = await apiFetch('/v1/edith/agent/run', {
        method: 'POST',
        body: JSON.stringify({
          prompt: textToRun,
          ...(activeFile ? { target_file: activeFile } : {})
        })
      });

      const data = await safeParseJson(res);
      if (!res.ok) {
        const message = data?.message || data?.detail || `Agent request failed (HTTP ${res.status}).`;
        throw new Error(message);
      }

      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('E.D.I.T.H. Engine returned an empty workflow response.');
      }

      setAgentSteps((prev) => [...prev.filter((s) => s.step_id !== pendingId), ...data]);
    } catch (err) {
      setAgentSteps((prev) => prev.filter((s) => s.step_id !== pendingId));
      setError(err?.message || 'Unable to reach E.D.I.T.H. Agent Engine.');
    } finally {
      updateBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="w-80 h-full frosted-glass-sidebar border-l border-white/10 flex flex-col shrink-0 font-sans z-20">
      {/* Agent Header */}
      <div className="h-11 border-b border-white/10 px-3 flex items-center justify-between shrink-0 font-mono">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-400 to-indigo-600 flex items-center justify-center text-black font-bold shadow-sm shadow-cyan-500/30">
            <Wand2 className="w-3.5 h-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-white tracking-wider">AI AGENT</h3>
            <p className="text-[9px] text-cyan-300">
              {activeFile ? `Target: ${activeFile.split('/').pop()}` : 'Workspace Workflow'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Agent Panel"
          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white transition-colors cursor-pointer"
          title="Close Agent Panel"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Quick Action Presets */}
      <div className="p-2 border-b border-white/10 bg-white/[0.02]">
        <div className="grid grid-cols-2 gap-1.5 font-mono text-[10px]">
          {quickActions.map((qa) => (
            <button
              key={qa.label}
              type="button"
              onClick={() => handleRunAgent(qa.text)}
              disabled={isBusy}
              className="p-1.5 rounded-lg bg-white/5 hover:bg-cyan-500/10 border border-white/10 hover:border-cyan-400/40 text-left text-slate-300 hover:text-cyan-200 transition-all truncate cursor-pointer disabled:opacity-50"
              title={qa.text}
            >
              <span className="font-bold text-cyan-400 mr-1">{qa.label}</span>
              <span className="text-slate-400">{qa.text}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Execution Stream Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 font-mono text-xs">
        {agentSteps.map((step, idx) => {
          const isPatch = step.phase === 'patch_proposal';
          const isTool = step.phase === 'tool_call' || step.phase === 'tool_result';
          const isThinking = step.phase === 'thinking';
          const isDone = step.phase === 'complete';

          return (
            <div
              key={step.step_id || idx}
              className={`p-3 rounded-xl border transition-all ${
                isDone
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                  : isPatch
                  ? 'bg-cyan-500/10 border-cyan-400/30 text-cyan-100 shadow-md'
                  : isTool
                  ? 'bg-white/[0.04] border-white/10 text-slate-200'
                  : 'bg-white/[0.02] border-white/10 text-slate-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  {isDone && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                  {isPatch && <FileCode className="w-4 h-4 text-cyan-400 shrink-0" />}
                  {isTool && <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />}
                  {isThinking && <Cpu className="w-4 h-4 text-purple-400 shrink-0" />}
                  <span className="font-bold text-[11px] truncate">{step.title}</span>
                </div>
                {step.is_mock && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 border border-amber-400/35 text-[9px] text-amber-200 shrink-0">
                    Preview
                  </span>
                )}
              </div>

              <p className="text-[10px] text-slate-400 font-sans leading-relaxed">{step.detail}</p>

              {isPatch && onOpenDiffReview && (
                <button
                  type="button"
                  onClick={() => onOpenDiffReview(step)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-1 px-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-[10px] font-bold text-cyan-200 transition-colors cursor-pointer"
                >
                  <span>Review &amp; Apply Patch</span>
                  <ChevronRight className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}

        {isBusy && (
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-400/30 flex items-center gap-2 text-cyan-300">
            <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
            <span className="text-[11px]">Analyzing workspace and preparing previews...</span>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-500/15 border border-red-400/40 text-red-200 space-y-2 font-sans"
          >
            <div className="flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <div className="flex items-center justify-end gap-2">
              {lastPrompt && (
                <button
                  type="button"
                  onClick={() => handleRunAgent(lastPrompt)}
                  className="px-2.5 py-1 rounded bg-red-500/25 hover:bg-red-500/40 text-[11px] font-mono text-white cursor-pointer"
                >
                  Retry
                </button>
              )}
              <button
                type="button"
                onClick={() => setError(null)}
                className="px-2 py-1 rounded hover:bg-white/10 text-[11px] text-slate-300 cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Prompt Input Dock */}
      <div className="p-3 border-t border-white/10 bg-black/40">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleRunAgent();
          }}
          className="flex items-center gap-2 p-1.5 rounded-xl frosted-glass-input"
        >
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isBusy}
            aria-label="Instruct AI Agent"
            placeholder="Instruct AI Agent (e.g. inspect gateway)..."
            className="flex-1 bg-transparent border-0 text-xs text-white placeholder-slate-400 focus:outline-none px-2"
          />
          <button
            type="submit"
            disabled={!prompt.trim() || isBusy}
            aria-label="Run AI Agent"
            className="p-1.5 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-600 hover:opacity-95 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>
    </div>
  );
}
