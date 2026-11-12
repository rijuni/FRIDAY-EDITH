import React, { useEffect, useState, useCallback } from 'react';
import {
  X,
  HelpCircle,
  Activity,
  RefreshCw,
  Copy,
  Check,
  Send,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Paperclip,
  Terminal
} from 'lucide-react';
import { apiFetch, safeParseJson } from '../../../lib/apiClient.js';
import { useAuthStore } from '../../../stores/authStore.js';
import { useFridayStore } from '../../../stores/fridayStore.js';

const SUBSYSTEM_LABELS = {
  api: 'Node Persistence API',
  database: 'Prisma Database',
  fridayAi: 'F.R.I.D.A.Y. AI (:8001)',
  edithEngine: 'E.D.I.T.H. Engine (:8002)',
  runnerHost: 'Runner Host (:8003)'
};

export function FridayHelpModal({ isOpen, onClose, onOpenEdith }) {
  const { user } = useAuthStore();
  const { selectedModel } = useFridayStore();

  const [diagnostics, setDiagnostics] = useState(null);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [copiedDiag, setCopiedDiag] = useState(false);

  const [category, setCategory] = useState('bug');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchDiagnostics = useCallback(async () => {
    setIsCheckingStatus(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/v1/friday/status', { method: 'GET' });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data) {
        throw new Error(payload?.message || 'Unable to load runtime status.');
      }
      setDiagnostics(payload.data);
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to check subsystem status.');
    } finally {
      setIsCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setSubmitResult(null);
    setErrorMsg(null);
    fetchDiagnostics();
  }, [isOpen, fetchDiagnostics]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleCopyDiagnostics = async () => {
    const summary = {
      platform: 'F.R.I.D.A.Y. + E.D.I.T.H.',
      version: diagnostics?.version || '2.1.0',
      timestamp: diagnostics?.timestamp || new Date().toISOString(),
      userRole: user?.role || 'USER',
      selectedModel,
      subsystems: diagnostics?.subsystems || {}
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(summary, null, 2));
      setCopiedDiag(true);
      setTimeout(() => setCopiedDiag(false), 2000);
    } catch {
      setErrorMsg('Clipboard access was denied by browser.');
    }
  };

  const handleSubmitSupport = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitResult(null);

    if (subject.trim().length < 3 || description.trim().length < 10) {
      setErrorMsg('Please enter a subject (3+ chars) and description (10+ chars).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch('/v1/friday/support', {
        method: 'POST',
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          description: description.trim(),
          includeDiagnostics: true
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data?.report) {
        throw new Error(payload?.message || 'Failed to submit support report.');
      }
      setSubmitResult(payload.data.report);
      setSubject('');
      setDescription('');
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to submit support report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const subsystems = diagnostics?.subsystems || {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="friday-help-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-3xl frosted-glass-window border border-purple-400/25 p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/25 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <HelpCircle className="w-4 h-4" />
            </div>
            <div>
              <h2 id="friday-help-title" className="text-base font-bold text-white">
                Help, Runtime Diagnostics & Support
              </h2>
              <p className="text-[11px] text-slate-400">Platform v2.1.0 live service status, usage guide & support tickets</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close help and support"
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5 text-xs">
          {/* Live Runtime Status */}
          <div className="p-4 rounded-2xl frosted-glass-card space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-purple-300 font-semibold">
                <Activity className="w-3.5 h-3.5" />
                <span>Live Platform Diagnostics</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyDiagnostics}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] text-slate-300 cursor-pointer"
                >
                  {copiedDiag ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedDiag ? 'Copied' : 'Copy JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={fetchDiagnostics}
                  disabled={isCheckingStatus}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/30 text-[11px] text-purple-200 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3 h-3 ${isCheckingStatus ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {Object.entries(SUBSYSTEM_LABELS).map(([key, label]) => {
                const info = subsystems[key];
                const isOnline = info?.status === 'online';
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between px-3 py-2 rounded-xl bg-black/25 border border-white/10"
                  >
                    <span className="text-slate-300">{label}</span>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      {typeof info?.latencyMs === 'number' && info.status !== 'offline' && (
                        <span className="text-slate-500">{info.latencyMs}ms</span>
                      )}
                      <span
                        className={`px-2 py-0.5 rounded-md border ${
                          isOnline
                            ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300'
                            : 'bg-amber-500/15 border-amber-400/30 text-amber-300'
                        }`}
                      >
                        {info?.status || (isCheckingStatus ? 'checking' : 'unknown')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Help Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl frosted-glass-card space-y-1.5">
              <div className="flex items-center gap-2 text-purple-200 font-semibold">
                <Paperclip className="w-3.5 h-3.5 text-purple-400" />
                <span>File Attachments</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Click the paperclip icon to attach UTF-8 text files (<code>.txt</code>, <code>.md</code>, <code>.csv</code>, <code>.json</code> up to 512 KB). Attached documents are parsed by F.R.I.D.A.Y. AI and included in your conversation turn.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl frosted-glass-card space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-200 font-semibold">
                  <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Workspace Coding</span>
                </div>
                {onOpenEdith && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEdith();
                    }}
                    className="text-[11px] text-cyan-300 hover:text-cyan-200 underline cursor-pointer"
                  >
                    Open E.D.I.T.H.
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                For multi-file repository scanning, unified diff patching, and isolated terminal execution, switch to <strong>E.D.I.T.H. // IDE</strong> in the top-right bar.
              </p>
            </div>
          </div>

          {/* Submit Support Ticket */}
          <form onSubmit={handleSubmitSupport} className="p-4 rounded-2xl frosted-glass-card space-y-3">
            <div className="font-semibold text-purple-300">Submit Support or Bug Report</div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label htmlFor="support-category" className="block text-[11px] text-slate-400 mb-1">
                  Category
                </label>
                <select
                  id="support-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-slate-100 focus:outline-none focus:border-purple-400 cursor-pointer"
                >
                  <option value="bug" className="bg-[#120d24]">Bug Report</option>
                  <option value="connectivity" className="bg-[#120d24]">Service Connectivity</option>
                  <option value="account" className="bg-[#120d24]">Account / Auth</option>
                  <option value="feature" className="bg-[#120d24]">Feature Request</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label htmlFor="support-subject" className="block text-[11px] text-slate-400 mb-1">
                  Subject
                </label>
                <input
                  id="support-subject"
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  maxLength={160}
                  placeholder="Brief summary of the issue"
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400"
                />
              </div>
            </div>

            <div>
              <label htmlFor="support-description" className="block text-[11px] text-slate-400 mb-1">
                Details
              </label>
              <textarea
                id="support-description"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={4000}
                placeholder="Describe what happened and what you expected..."
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400 resize-none"
              />
            </div>

            {errorMsg && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/35 text-red-200">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{errorMsg}</span>
              </div>
            )}

            {submitResult && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  Report recorded with reference <strong>{submitResult.id}</strong>.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-purple-600/25 cursor-pointer disabled:opacity-50"
              >
                {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Submit Report</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

