import React, { useEffect, useState } from 'react';
import {
  X,
  Mail,
  Calendar,
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Send,
  CalendarPlus,
  AlertTriangle
} from 'lucide-react';
import { apiFetch, safeParseJson } from '../../../lib/apiClient.js';

export function FridayGoogleModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('connection'); // 'connection' | 'context' | 'actions'
  const [connection, setConnection] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Context Inspector State
  const [contextQuery, setContextQuery] = useState('');
  const [includeGmail, setIncludeGmail] = useState(true);
  const [includeCalendar, setIncludeCalendar] = useState(true);
  const [isFetchingContext, setIsFetchingContext] = useState(false);
  const [fetchedContext, setFetchedContext] = useState(null);

  // Governed Action State
  const [actionMode, setActionMode] = useState('email'); // 'email' | 'draft' | 'event'
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');

  const [eventSummary, setEventSummary] = useState('');
  const [eventStart, setEventStart] = useState('');
  const [eventEnd, setEventEnd] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventLocation, setEventLocation] = useState('');

  const [isSubmittingAction, setIsSubmittingAction] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [actionResult, setActionResult] = useState(null);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await apiFetch('/v1/friday/integrations/google/status');
      const payload = await safeParseJson(res);
      if (res.ok && payload?.data) {
        setConnection(payload.data.connected ? payload.data.connection : null);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to check Google Workspace status.');
    } finally {
      setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStatusMsg(null);
      setErrorMsg(null);
      fetchStatus();
    } else {
      setFetchedContext(null);
      setPendingApproval(null);
      setActionResult(null);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleConnect = async (requestedScopes) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch('/v1/integrations/connect', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'google',
          scopes: requestedScopes,
          redirectUri: `${window.location.origin}/integrations/callback`
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data?.authorizationUrl) {
        throw new Error(payload?.message || 'Failed to initiate Google authorization.');
      }
      window.location.href = payload.data.authorizationUrl;
    } catch (err) {
      setErrorMsg(err?.message || 'Google connection initiation failed.');
    }
  };

  const handleDisconnect = async () => {
    if (!connection?.id) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch(`/v1/integrations/${connection.id}`, { method: 'DELETE' });
      const payload = await safeParseJson(res);
      if (!res.ok) throw new Error(payload?.message || 'Failed to disconnect Google account.');
      setConnection(null);
      setStatusMsg('Google Workspace account disconnected successfully.');
    } catch (err) {
      setErrorMsg(err?.message || 'Disconnect failed.');
    }
  };

  const handleFetchContext = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsFetchingContext(true);
    setFetchedContext(null);

    try {
      const res = await apiFetch('/v1/friday/integrations/google/context', {
        method: 'POST',
        body: JSON.stringify({
          query: contextQuery.trim() || undefined,
          includeGmail,
          includeCalendar
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data?.context) {
        throw new Error(payload?.message || 'Failed to retrieve Google Workspace context.');
      }
      setFetchedContext(payload.data.context);
    } catch (err) {
      setErrorMsg(err?.message || 'Context inspection failed.');
    } finally {
      setIsFetchingContext(false);
    }
  };

  const handleInitiateAction = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setPendingApproval(null);
    setActionResult(null);
    setIsSubmittingAction(true);

    try {
      let toolId;
      let parameters;

      if (actionMode === 'email') {
        if (!emailTo.trim() || !emailSubject.trim()) {
          throw new Error('Recipient and Subject are required to send an email.');
        }
        toolId = 'gmail_send_message';
        parameters = {
          to: emailTo.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim()
        };
      } else if (actionMode === 'draft') {
        if (!emailTo.trim() || !emailSubject.trim()) {
          throw new Error('Recipient and Subject are required to create a draft.');
        }
        toolId = 'gmail_create_draft';
        parameters = {
          to: emailTo.trim(),
          subject: emailSubject.trim(),
          body: emailBody.trim()
        };
      } else if (actionMode === 'event') {
        if (!eventSummary.trim() || !eventStart.trim() || !eventEnd.trim()) {
          throw new Error('Title, Start time, and End time are required for a calendar event.');
        }
        toolId = 'calendar_create_event';
        parameters = {
          summary: eventSummary.trim(),
          start: eventStart.trim(),
          end: eventEnd.trim(),
          description: eventDesc.trim(),
          location: eventLocation.trim()
        };
      }

      const res = await apiFetch('/v1/integrations/tools/invoke', {
        method: 'POST',
        body: JSON.stringify({
          toolId,
          connectionId: connection?.id,
          parameters
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok) throw new Error(payload?.message || 'Tool invocation rejected.');

      if (payload?.data?.status === 'APPROVAL_REQUIRED' && payload?.data?.approval) {
        setPendingApproval(payload.data.approval);
        setStatusMsg('Security Policy requires explicit confirmation before executing write operation.');
      } else if (payload?.data?.status === 'SUCCESS' || payload?.data?.status === 'COMPLETED') {
        setActionResult(payload.data.result);
        setStatusMsg('Action executed successfully!');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Action initiation failed.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  const handleApproveAction = async () => {
    if (!pendingApproval?.id || !pendingApproval?.actionDigest) return;
    setIsSubmittingAction(true);
    setErrorMsg(null);
    try {
      const res = await apiFetch('/v1/integrations/tools/approve', {
        method: 'POST',
        body: JSON.stringify({
          approvalId: pendingApproval.id,
          actionDigest: pendingApproval.actionDigest
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok || payload?.data?.status !== 'SUCCESS') {
        throw new Error(payload?.message || 'Approval authorization failed.');
      }
      setActionResult(payload.data.result);
      setPendingApproval(null);
      setStatusMsg('Action authorized and executed successfully!');
    } catch (err) {
      setErrorMsg(err?.message || 'Action authorization failed.');
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="google-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
    >
      <div className="w-full max-w-2xl bg-[#0c101c] border border-emerald-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Mail className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <h2 id="google-modal-title" className="text-base font-bold text-white tracking-wide">
                Google Workspace Integrations
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                F.R.I.D.A.Y. Gmail, Calendar &amp; Drive Assistant Gateway
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-[#080c14] px-6 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('connection')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'connection'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Connection &amp; Scopes</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('context')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'context'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>Workspace Context</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('actions')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'actions'
                ? 'border-emerald-400 text-emerald-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-4 h-4" />
            <span>Governed Actions</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm font-sans flex-1">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-xs text-red-200">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-2.5 text-xs text-emerald-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">{statusMsg}</div>
            </div>
          )}

          {/* TAB 1: Connection & Scopes */}
          {activeTab === 'connection' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono uppercase tracking-wider text-slate-400">Status</span>
                    {connection ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30 text-[11px] font-mono">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={fetchStatus}
                    disabled={isLoadingStatus}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-emerald-300 cursor-pointer disabled:opacity-40"
                    title="Refresh status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin text-emerald-400' : ''}`} />
                  </button>
                </div>

                {connection ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Google Account:</span>
                      <span className="text-emerald-300 font-semibold">{connection.displayName || 'Connected Account'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Granted Scopes:</span>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {(connection.scopes || []).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>
                    {connection.expiresAt && (
                      <div className="flex justify-between py-1 border-b border-white/[0.04]">
                        <span className="text-slate-400">Token Expiry:</span>
                        <span className="text-slate-300">{new Date(connection.expiresAt).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="pt-2 flex justify-end">
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 hover:bg-red-500/30 text-red-200 text-xs font-medium cursor-pointer"
                      >
                        Disconnect Google Account
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Connect your Google Workspace account to allow F.R.I.D.A.Y. to search your inbox, summarize upcoming calendar events, read reference documents, and draft communications with human-in-the-loop review.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleConnect(['gmail:read', 'calendar:read', 'drive:read'])}
                        className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/20 hover:bg-white/[0.08] text-white text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Connect Read-Only (Gmail, Calendar, Drive)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnect(['gmail:read', 'gmail:write', 'calendar:read', 'calendar:write', 'drive:read'])}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-lg shadow-emerald-600/20"
                      >
                        Connect Full Productivity (Read + Write)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Zero-Trust Token Protection Notice */}
              <div className="p-3.5 rounded-xl bg-emerald-950/30 border border-emerald-800/40 flex items-start gap-2.5 text-xs text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-white">Zero-Trust Google Token Security</span>
                  <p className="text-[11px] text-emerald-200/80 leading-relaxed">
                    OAuth access and refresh tokens are encrypted at rest with AES-256-GCM envelope encryption. Tokens are never exposed to browser memory, prompt templates, or task logs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Workspace Context */}
          {activeTab === 'context' && (
            <div className="space-y-4">
              <form onSubmit={handleFetchContext} className="space-y-3">
                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">Search Keywords or Query</label>
                  <input
                    type="text"
                    value={contextQuery}
                    onChange={(e) => setContextQuery(e.target.value)}
                    placeholder="e.g. project roadmap or is:inbox"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                  />
                </div>

                <div className="flex gap-4 text-xs text-slate-300">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeGmail}
                      onChange={(e) => setIncludeGmail(e.target.checked)}
                      className="rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span>Include Gmail</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeCalendar}
                      onChange={(e) => setIncludeCalendar(e.target.checked)}
                      className="rounded border-white/20 bg-black/40 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span>Include Calendar Events</span>
                  </label>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isFetchingContext}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-40 shadow-lg shadow-emerald-600/20"
                  >
                    {isFetchingContext && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Fetch Workspace Context</span>
                  </button>
                </div>
              </form>

              {fetchedContext && (
                <div className="space-y-3 pt-2">
                  <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2 text-[11px] text-amber-300 font-mono">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>[Untrusted Context / Sanitized - Non-Executable Boundary]</span>
                  </div>

                  <div className="p-4 rounded-xl bg-black/50 border border-white/10 space-y-3 font-mono text-xs">
                    {fetchedContext.gmail && (
                      <div className="space-y-2">
                        <span className="text-emerald-400 font-semibold">
                          Gmail Messages ({fetchedContext.gmail.count || 0})
                        </span>
                        <div className="space-y-1.5">
                          {(fetchedContext.gmail.messages || []).map((m) => (
                            <div key={m.id} className="p-2 rounded bg-white/[0.03] border border-white/[0.06] space-y-0.5">
                              <div className="flex justify-between text-slate-300 font-medium">
                                <span className="truncate">{m.subject}</span>
                                <span className="text-[10px] text-slate-500">{m.date}</span>
                              </div>
                              <p className="text-[11px] text-slate-400">From: {m.from}</p>
                              <p className="text-[11px] text-slate-300/80 truncate">{m.snippet}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {fetchedContext.calendar && (
                      <div className="pt-2 border-t border-white/10 space-y-2">
                        <span className="text-teal-400 font-semibold">
                          Calendar Events ({fetchedContext.calendar.totalEvents || 0})
                        </span>
                        <div className="space-y-1.5">
                          {(fetchedContext.calendar.events || []).map((ev) => (
                            <div key={ev.id} className="p-2 rounded bg-white/[0.03] border border-white/[0.06] space-y-0.5">
                              <div className="flex justify-between text-slate-300 font-medium">
                                <span className="truncate">{ev.summary}</span>
                                <span className="text-[10px] text-slate-500">{ev.start}</span>
                              </div>
                              {ev.location && <p className="text-[11px] text-slate-400">Location: {ev.location}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Governed Actions */}
          {activeTab === 'actions' && (
            <div className="space-y-4">
              <div className="flex gap-2 p-1 rounded-xl bg-black/40 border border-white/10">
                <button
                  type="button"
                  onClick={() => { setActionMode('email'); setPendingApproval(null); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    actionMode === 'email' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Send Email
                </button>
                <button
                  type="button"
                  onClick={() => { setActionMode('draft'); setPendingApproval(null); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    actionMode === 'draft' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Create Draft
                </button>
                <button
                  type="button"
                  onClick={() => { setActionMode('event'); setPendingApproval(null); }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors ${
                    actionMode === 'event' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Schedule Event
                </button>
              </div>

              <form onSubmit={handleInitiateAction} className="space-y-3">
                {actionMode !== 'event' ? (
                  <>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">To (Recipient Email) *</label>
                      <input
                        type="email"
                        value={emailTo}
                        onChange={(e) => setEmailTo(e.target.value)}
                        placeholder="colleague@stark.corp"
                        className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Subject *</label>
                      <input
                        type="text"
                        value={emailSubject}
                        onChange={(e) => setEmailSubject(e.target.value)}
                        placeholder="Weekly Status Update"
                        className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Message Body</label>
                      <textarea
                        rows={3}
                        value={emailBody}
                        onChange={(e) => setEmailBody(e.target.value)}
                        placeholder="Type email body..."
                        className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono resize-none"
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Event Title *</label>
                      <input
                        type="text"
                        value={eventSummary}
                        onChange={(e) => setEventSummary(e.target.value)}
                        placeholder="Architecture Review"
                        className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">Start Time (ISO) *</label>
                        <input
                          type="text"
                          value={eventStart}
                          onChange={(e) => setEventStart(e.target.value)}
                          placeholder="2026-12-01T10:00:00Z"
                          className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-mono text-slate-400 mb-1">End Time (ISO) *</label>
                        <input
                          type="text"
                          value={eventEnd}
                          onChange={(e) => setEventEnd(e.target.value)}
                          placeholder="2026-12-01T11:00:00Z"
                          className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                          required
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[11px] font-mono text-slate-400 mb-1">Location</label>
                      <input
                        type="text"
                        value={eventLocation}
                        onChange={(e) => setEventLocation(e.target.value)}
                        placeholder="Conference Room A / Google Meet"
                        className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-emerald-400 outline-none font-mono"
                      />
                    </div>
                  </>
                )}

                {!pendingApproval && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSubmittingAction}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-40 shadow-lg shadow-emerald-600/20"
                    >
                      {isSubmittingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Prepare Governed Action</span>
                    </button>
                  </div>
                )}
              </form>

              {/* Pending Approval Drawer */}
              {pendingApproval && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-3 font-mono text-xs animate-fadeIn">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Action Authorization Required</span>
                  </div>

                  <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                    Performing modifications in Google Workspace requires explicit user authorization. Verify the action digest and target parameters before continuing.
                  </p>

                  <div className="p-3 rounded-lg bg-black/60 border border-white/10 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Action Digest (SHA-256):</span>
                      <span className="text-emerald-300 font-mono select-all">
                        {pendingApproval.actionDigest?.slice(0, 24)}...
                      </span>
                    </div>
                    {actionMode !== 'event' ? (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Recipient:</span>
                          <span className="text-white">{emailTo}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Subject:</span>
                          <span className="text-white">{emailSubject}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Event:</span>
                          <span className="text-white">{eventSummary}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Timing:</span>
                          <span className="text-white">{eventStart} &rarr; {eventEnd}</span>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setPendingApproval(null)}
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-slate-300 text-xs font-medium cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleApproveAction}
                      disabled={isSubmittingAction}
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
                    >
                      {isSubmittingAction && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Authorize &amp; Execute</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Action Success Result */}
              {actionResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 font-mono text-xs">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Action Executed Successfully</span>
                  </div>
                  <div className="text-[11px] text-slate-300 space-y-1">
                    <p>Status: {actionResult.data?.status || 'COMPLETED'}</p>
                    {actionResult.data?.subject && <p>Subject: {actionResult.data.subject}</p>}
                    {actionResult.data?.summary && <p>Event: {actionResult.data.summary}</p>}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
