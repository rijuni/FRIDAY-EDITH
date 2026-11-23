import React, { useEffect, useState } from 'react';
import {
  X,
  GitBranch,
  GitPullRequest,
  Shield,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ExternalLink,
  Lock,
  Layers,
  FileCode2,
  AlertTriangle
} from 'lucide-react';
import { apiFetch, safeParseJson } from '../../../lib/apiClient.js';

export function GitHubIntegrationModal({ isOpen, onClose }) {
  const [activeTab, setActiveTab] = useState('connection'); // 'connection' | 'context' | 'create_pr'
  const [connection, setConnection] = useState(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Context Inspector State
  const [contextOwner, setContextOwner] = useState('');
  const [contextRepo, setContextRepo] = useState('');
  const [contextPrNumber, setContextPrNumber] = useState('');
  const [contextRef, setContextRef] = useState('');
  const [isFetchingContext, setIsFetchingContext] = useState(false);
  const [fetchedContext, setFetchedContext] = useState(null);

  // Governed PR Creation State
  const [prOwner, setPrOwner] = useState('');
  const [prRepo, setPrRepo] = useState('');
  const [prTitle, setPrTitle] = useState('');
  const [prHead, setPrHead] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [prBody, setPrBody] = useState('');
  const [isSubmittingPr, setIsSubmittingPr] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(null);
  const [createdPrResult, setCreatedPrResult] = useState(null);

  const fetchStatus = async () => {
    setIsLoadingStatus(true);
    try {
      const res = await apiFetch('/v1/edith/integrations/github/status');
      const payload = await safeParseJson(res);
      if (res.ok && payload?.data) {
        setConnection(payload.data.connected ? payload.data.connection : null);
      }
    } catch (err) {
      setErrorMsg(err?.message || 'Unable to load GitHub integration status.');
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
      setCreatedPrResult(null);
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

  const handleConnect = async (requestedScopes = ['repo:read', 'repo:write']) => {
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch('/v1/integrations/connect', {
        method: 'POST',
        body: JSON.stringify({
          provider: 'github',
          scopes: requestedScopes,
          redirectUri: `${window.location.origin}/integrations/callback`
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data?.authorizationUrl) {
        throw new Error(payload?.message || 'Failed to initiate GitHub authorization.');
      }
      // Direct user to provider authorization URL
      window.location.href = payload.data.authorizationUrl;
    } catch (err) {
      setErrorMsg(err?.message || 'Connection initiation failed.');
    }
  };

  const handleDisconnect = async () => {
    if (!connection?.id) return;
    setErrorMsg(null);
    setStatusMsg(null);
    try {
      const res = await apiFetch(`/v1/integrations/${connection.id}`, { method: 'DELETE' });
      const payload = await safeParseJson(res);
      if (!res.ok) throw new Error(payload?.message || 'Failed to disconnect GitHub.');
      setConnection(null);
      setStatusMsg('GitHub connection revoked successfully.');
    } catch (err) {
      setErrorMsg(err?.message || 'Disconnect failed.');
    }
  };

  const handleFetchContext = async (e) => {
    e.preventDefault();
    if (!contextOwner.trim() || !contextRepo.trim()) {
      setErrorMsg('Please specify both Owner and Repository name.');
      return;
    }
    setErrorMsg(null);
    setIsFetchingContext(true);
    setFetchedContext(null);

    try {
      const body = {
        owner: contextOwner.trim(),
        repo: contextRepo.trim()
      };
      if (contextPrNumber.trim()) {
        const num = parseInt(contextPrNumber.trim(), 10);
        if (Number.isFinite(num) && num > 0) body.pullNumber = num;
      }
      if (contextRef.trim()) {
        body.ref = contextRef.trim();
      }

      const res = await apiFetch('/v1/edith/integrations/github/context', {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data?.context) {
        throw new Error(payload?.message || 'Failed to retrieve repository context.');
      }
      setFetchedContext(payload.data.context);
    } catch (err) {
      setErrorMsg(err?.message || 'Context inspection failed.');
    } finally {
      setIsFetchingContext(false);
    }
  };

  const handleInitiatePr = async (e) => {
    e.preventDefault();
    if (!prOwner.trim() || !prRepo.trim() || !prTitle.trim() || !prHead.trim()) {
      setErrorMsg('Owner, Repository, Title, and Head branch are required.');
      return;
    }
    setErrorMsg(null);
    setStatusMsg(null);
    setPendingApproval(null);
    setCreatedPrResult(null);
    setIsSubmittingPr(true);

    try {
      const res = await apiFetch('/v1/integrations/tools/invoke', {
        method: 'POST',
        body: JSON.stringify({
          toolId: 'github_create_pr',
          connectionId: connection?.id,
          parameters: {
            owner: prOwner.trim(),
            repo: prRepo.trim(),
            title: prTitle.trim(),
            head: prHead.trim(),
            base: prBase.trim() || 'main',
            body: prBody.trim()
          }
        })
      });
      const payload = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(payload?.message || 'Tool invocation rejected.');
      }

      if (payload?.data?.status === 'APPROVAL_REQUIRED' && payload?.data?.approval) {
        setPendingApproval(payload.data.approval);
        setStatusMsg('Security Policy requires explicit confirmation before executing write operation.');
      } else if (payload?.data?.status === 'SUCCESS') {
        setCreatedPrResult(payload.data.result);
        setStatusMsg('Pull Request created successfully!');
      }
    } catch (err) {
      setErrorMsg(err?.message || 'PR creation failed.');
    } finally {
      setIsSubmittingPr(false);
    }
  };

  const handleApproveAction = async () => {
    if (!pendingApproval?.id || !pendingApproval?.actionDigest) return;
    setIsSubmittingPr(true);
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
      setCreatedPrResult(payload.data.result);
      setPendingApproval(null);
      setStatusMsg('Pull Request authorized and created successfully!');
    } catch (err) {
      setErrorMsg(err?.message || 'Action authorization failed.');
    } finally {
      setIsSubmittingPr(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="github-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
    >
      <div className="w-full max-w-2xl bg-[#0b101b] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <GitPullRequest className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <h2 id="github-modal-title" className="text-base font-bold text-white tracking-wide">
                GitHub Developer Integration
              </h2>
              <p className="text-xs text-slate-400 font-mono">
                E.D.I.T.H. Governed Repository &amp; PR Gateway
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
                ? 'border-cyan-400 text-cyan-300'
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
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCode2 className="w-4 h-4" />
            <span>Context Inspector</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('create_pr')}
            className={`py-3 px-4 text-xs font-semibold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'create_pr'
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Governed PR Creator</span>
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
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-cyan-300 cursor-pointer disabled:opacity-40"
                    title="Refresh status"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStatus ? 'animate-spin text-cyan-400' : ''}`} />
                  </button>
                </div>

                {connection ? (
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Account:</span>
                      <span className="text-cyan-300 font-semibold">{connection.displayName || 'Authenticated User'}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-white/[0.04]">
                      <span className="text-slate-400">Granted Scopes:</span>
                      <div className="flex gap-1.5 flex-wrap justify-end">
                        {(connection.scopes || []).map((s) => (
                          <span key={s} className="px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 text-[10px]">
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
                        Disconnect GitHub
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Connect your GitHub account to enable E.D.I.T.H. to inspect repository structures, PR diffs, CI status, and prepare governed pull requests with zero-trust safeguards.
                    </p>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => handleConnect(['repo:read'])}
                        className="flex-1 py-2 rounded-xl bg-white/[0.05] border border-white/20 hover:bg-white/[0.08] text-white text-xs font-semibold cursor-pointer transition-colors"
                      >
                        Connect Read-Only (repo:read)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConnect(['repo:read', 'repo:write'])}
                        className="flex-1 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors shadow-lg shadow-cyan-600/20"
                      >
                        Connect Full (repo:read + repo:write)
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Zero trust disclaimer */}
              <div className="p-3.5 rounded-xl bg-cyan-950/30 border border-cyan-800/40 flex items-start gap-2.5 text-xs text-cyan-200">
                <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-white">Zero-Trust Token Protection</span>
                  <p className="text-[11px] text-cyan-200/80 leading-relaxed">
                    Access tokens are encrypted at rest with AES-256-GCM envelope encryption and are never exposed to browser memory, prompt templates, or command logs.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Context Inspector */}
          {activeTab === 'context' && (
            <div className="space-y-4">
              <form onSubmit={handleFetchContext} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Owner / Org *</label>
                    <input
                      type="text"
                      value={contextOwner}
                      onChange={(e) => setContextOwner(e.target.value)}
                      placeholder="e.g. google"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Repository *</label>
                    <input
                      type="text"
                      value={contextRepo}
                      onChange={(e) => setContextRepo(e.target.value)}
                      placeholder="e.g. deepmind-research"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Pull Request # (Optional)</label>
                    <input
                      type="number"
                      value={contextPrNumber}
                      onChange={(e) => setContextPrNumber(e.target.value)}
                      placeholder="e.g. 42"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Ref / Branch for CI (Optional)</label>
                    <input
                      type="text"
                      value={contextRef}
                      onChange={(e) => setContextRef(e.target.value)}
                      placeholder="e.g. main or feature/xyz"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isFetchingContext}
                    className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-40"
                  >
                    {isFetchingContext && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>Fetch Sanitized Context</span>
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
                    {fetchedContext.repository && (
                      <div className="space-y-1">
                        <span className="text-cyan-400 font-semibold">{fetchedContext.repository.fullName}</span>
                        <p className="text-slate-300 text-[11px]">{fetchedContext.repository.description || 'No description provided.'}</p>
                        <div className="flex gap-4 text-[11px] text-slate-400 pt-1">
                          <span>Stars: {fetchedContext.repository.stars ?? 0}</span>
                          <span>Forks: {fetchedContext.repository.forks ?? 0}</span>
                          <span>Branch: {fetchedContext.repository.defaultBranch}</span>
                        </div>
                      </div>
                    )}

                    {fetchedContext.pullRequest && (
                      <div className="pt-2 border-t border-white/10 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400 font-semibold">
                            PR #{fetchedContext.pullRequest.number}: {fetchedContext.pullRequest.title}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px]">
                            {fetchedContext.pullRequest.state}
                          </span>
                        </div>
                        <p className="text-slate-300 text-[11px]">Author: {fetchedContext.pullRequest.author}</p>
                        <div className="flex gap-4 text-[11px] text-slate-400">
                          <span>+{fetchedContext.pullRequest.additions ?? 0} / -{fetchedContext.pullRequest.deletions ?? 0}</span>
                          <span>Changed files: {fetchedContext.pullRequest.changedFiles ?? 0}</span>
                        </div>
                      </div>
                    )}

                    {fetchedContext.ciStatus && (
                      <div className="pt-2 border-t border-white/10 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-indigo-400 font-semibold">CI Status ({fetchedContext.ciStatus.ref})</span>
                          <span className="text-[11px] text-slate-300">State: {fetchedContext.ciStatus.state}</span>
                        </div>
                        <div className="space-y-1 pt-1">
                          {(fetchedContext.ciStatus.checkRuns || []).map((run) => (
                            <div key={run.id || run.name} className="flex justify-between text-[11px] text-slate-400">
                              <span>{run.name}</span>
                              <span className={run.conclusion === 'success' ? 'text-emerald-400' : 'text-amber-400'}>
                                {run.conclusion || run.status}
                              </span>
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

          {/* TAB 3: Governed PR Creator */}
          {activeTab === 'create_pr' && (
            <div className="space-y-4">
              <form onSubmit={handleInitiatePr} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Owner *</label>
                    <input
                      type="text"
                      value={prOwner}
                      onChange={(e) => setPrOwner(e.target.value)}
                      placeholder="e.g. google"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Repository *</label>
                    <input
                      type="text"
                      value={prRepo}
                      onChange={(e) => setPrRepo(e.target.value)}
                      placeholder="e.g. deepmind-research"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">PR Title *</label>
                  <input
                    type="text"
                    value={prTitle}
                    onChange={(e) => setPrTitle(e.target.value)}
                    placeholder="e.g. chore: implement Phase 6 connector"
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Head Branch (Source) *</label>
                    <input
                      type="text"
                      value={prHead}
                      onChange={(e) => setPrHead(e.target.value)}
                      placeholder="e.g. feature/phase6-connector"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-mono text-slate-400 mb-1">Base Branch (Target)</label>
                    <input
                      type="text"
                      value={prBase}
                      onChange={(e) => setPrBase(e.target.value)}
                      placeholder="main"
                      className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-mono text-slate-400 mb-1">PR Description / Body</label>
                  <textarea
                    rows={3}
                    value={prBody}
                    onChange={(e) => setPrBody(e.target.value)}
                    placeholder="Describe the changes introduced in this pull request..."
                    className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-white text-xs focus:border-cyan-400 outline-none font-mono resize-none"
                  />
                </div>

                {!pendingApproval && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      disabled={isSubmittingPr}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold cursor-pointer transition-colors flex items-center gap-2 disabled:opacity-40 shadow-lg shadow-cyan-600/20"
                    >
                      {isSubmittingPr && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <span>Prepare Governed PR</span>
                    </button>
                  </div>
                )}
              </form>

              {/* Pending Policy Approval Drawer */}
              {pendingApproval && (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/40 space-y-3 font-mono text-xs animate-fadeIn">
                  <div className="flex items-center gap-2 text-amber-300 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Tool Approval Required: github_create_pr</span>
                  </div>

                  <p className="text-[11px] text-amber-200/90 leading-relaxed font-sans">
                    Modifying remote repositories requires explicit user approval. Verify the action digest and target arguments before authorizing.
                  </p>

                  <div className="p-3 rounded-lg bg-black/60 border border-white/10 space-y-1.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Action Digest (SHA-256):</span>
                      <span className="text-cyan-300 font-mono select-all">
                        {pendingApproval.actionDigest?.slice(0, 24)}...
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Repository:</span>
                      <span className="text-white">{prOwner}/{prRepo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Branches:</span>
                      <span className="text-white">{prHead} &rarr; {prBase}</span>
                    </div>
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
                      disabled={isSubmittingPr}
                      className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-semibold cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-600/30"
                    >
                      {isSubmittingPr && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      <ShieldCheck className="w-3.5 h-3.5" />
                      <span>Authorize &amp; Submit PR</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Created PR Success Banner */}
              {createdPrResult && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2 font-mono text-xs">
                  <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Pull Request Created Successfully!</span>
                  </div>
                  <div className="text-[11px] text-slate-300 space-y-1">
                    <p>PR #{createdPrResult.number}: {createdPrResult.title}</p>
                    {createdPrResult.url && (
                      <a
                        href={createdPrResult.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-cyan-400 hover:underline"
                      >
                        View on GitHub <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
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
