import React, { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Terminal,
  Sparkles,
  Play,
  FileCode,
  FolderOpen,
  GitBranch,
  ShieldCheck,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
  AlertTriangle,
  RefreshCw,
  Wand2,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { EdithCore3D } from '../components/EdithCore3D';
import { MonacoCodeEditor } from '../editor/MonacoCodeEditor';
import { MonacoDiffViewer } from '../diffs/MonacoDiffViewer';
import { RunnerTerminal } from '../terminal/RunnerTerminal';
import { CommandApprovalDrawer } from '../agent/CommandApprovalDrawer';
import { EdithAgentPanel } from '../agent/EdithAgentPanel';
import { apiFetch, safeParseJson } from '../../../lib/apiClient';

class EditorErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Editor failed to initialize.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-[#070a12] text-slate-300 text-xs font-mono text-center space-y-3">
          <AlertCircle className="w-6 h-6 text-amber-400" />
          <p className="text-white font-semibold">Editor component encountered an issue</p>
          <p className="text-slate-400 max-w-md">{this.state.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 cursor-pointer"
          >
            Reload Editor
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function EdithWorkspace() {
  const navigate = useNavigate();

  // Workspace explorer & editor state
  const [scanResult, setScanResult] = useState({
    workspace_root: '',
    total_files: 0,
    total_symbols: 0,
    files: []
  });
  const [isScanning, setIsScanning] = useState(true);
  const [workspaceError, setWorkspaceError] = useState(null);

  const [openTabs, setOpenTabs] = useState([]);
  const [activeTab, setActiveTab] = useState(null);
  const [originalContents, setOriginalContents] = useState({});
  const [bufferContents, setBufferContents] = useState({});
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // View & dock toggles
  const [viewMode, setViewMode] = useState('editor'); // 'editor' | 'diff'
  const [bottomTab, setBottomTab] = useState('terminal'); // 'terminal' | 'dag' | 'policy'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);

  // Activity & notifications
  const [isAgentBusy, setIsAgentBusy] = useState(false);
  const [isTerminalBusy, setIsTerminalBusy] = useState(false);
  const [statusBanner, setStatusBanner] = useState(null); // { type: 'success'|'error'|'info', text: string }

  // Diff review state
  const [diffSession, setDiffSession] = useState(null);
  const [isApplyingPatch, setIsApplyingPatch] = useState(false);
  const [diffError, setDiffError] = useState(null);

  // Task Decomposition DAG state
  const [planGoal, setPlanGoal] = useState('Audit policy gateway, verify diffs, and run tests');
  const [activePlan, setActivePlan] = useState(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [planError, setPlanError] = useState(null);

  // Policy Gate & Command Approval Drawer state
  const [approvalState, setApprovalState] = useState({
    isOpen: false,
    command: '',
    decision: 'CONFIRMATION_REQUIRED',
    reason: '',
    riskScore: 0
  });
  const [isCheckingPolicy, setIsCheckingPolicy] = useState(false);
  const [policyProbeCmd, setPolicyProbeCmd] = useState('npm install @testing-library/react');
  const [pendingTerminalCmd, setPendingTerminalCmd] = useState(null);

  const openWorkspaceFile = useCallback(async (relativePath, workspaceRoot = null) => {
    if (!relativePath) return;
    setIsLoadingFile(true);
    setWorkspaceError(null);
    setViewMode('editor');

    setOpenTabs((prev) => (prev.includes(relativePath) ? prev : [...prev.slice(-5), relativePath]));
    setActiveTab(relativePath);

    try {
      const res = await apiFetch('/v1/edith/files/read', {
        method: 'POST',
        body: JSON.stringify({
          relative_path: relativePath,
          ...(workspaceRoot ? { workspace_root: workspaceRoot } : {})
        })
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data?.message || `Failed to read ${relativePath} (HTTP ${res.status}).`);
      }

      const content = data?.content ?? '';
      setOriginalContents((prev) => ({ ...prev, [relativePath]: content }));
      setBufferContents((prev) =>
        prev[relativePath] !== undefined ? prev : { ...prev, [relativePath]: content }
      );
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err?.message || `Unable to open ${relativePath}.`
      });
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  const scanWorkspace = useCallback(async () => {
    setIsScanning(true);
    setWorkspaceError(null);

    try {
      const res = await apiFetch('/v1/edith/repository/scan', {
        method: 'POST',
        body: JSON.stringify({ max_files: 60 })
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data?.message || `Repository scan failed (HTTP ${res.status}).`);
      }

      const files = Array.isArray(data?.files) ? data.files : [];
      setScanResult({
        workspace_root: data?.workspace_root || '',
        total_files: data?.total_files ?? files.length,
        total_symbols: data?.total_symbols ?? 0,
        files
      });

      if (files.length > 0 && !activeTab) {
        const preferred =
          files.find((f) => f.relative_path.endsWith('gateway.py')) ||
          files.find((f) => f.extension === '.py' || f.extension === '.js' || f.extension === '.jsx') ||
          files[0];
        await openWorkspaceFile(preferred.relative_path, data?.workspace_root);
      }
    } catch (err) {
      setWorkspaceError(err?.message || 'E.D.I.T.H. Engine is offline or unreachable.');
    } finally {
      setIsScanning(false);
    }
  }, [activeTab, openWorkspaceFile]);

  const fetchTaskPlan = useCallback(
    async (goalText = planGoal) => {
      const cleanGoal = (goalText || '').trim();
      if (!cleanGoal) return;
      setIsPlanning(true);
      setPlanError(null);
      try {
        const res = await apiFetch('/v1/edith/tasks/plan', {
          method: 'POST',
          body: JSON.stringify({
            goal: cleanGoal,
            target_files: activeTab ? [activeTab] : []
          })
        });
        const data = await safeParseJson(res);
        if (!res.ok) {
          throw new Error(data?.message || `Planner failed (HTTP ${res.status}).`);
        }
        setActivePlan(data);
      } catch (err) {
        setPlanError(err?.message || 'Unable to reach Planner Engine.');
      } finally {
        setIsPlanning(false);
      }
    },
    [planGoal, activeTab]
  );

  useEffect(() => {
    scanWorkspace();
  }, [scanWorkspace]);

  useEffect(() => {
    if (bottomTab === 'dag' && !activePlan && !isPlanning && !planError) {
      fetchTaskPlan();
    }
  }, [bottomTab, activePlan, isPlanning, planError, fetchTaskPlan]);

  // Group scanned files by top-level directory cleanly
  const groupedFiles = useMemo(() => {
    const groups = new Map();
    for (const file of scanResult.files) {
      const parts = String(file.relative_path || '').split('/');
      const groupName = parts.length > 1 ? parts.slice(0, Math.min(2, parts.length - 1)).join('/') : 'root';
      if (!groups.has(groupName)) groups.set(groupName, []);
      groups.get(groupName).push(file);
    }
    return Array.from(groups.entries());
  }, [scanResult.files]);

  const handleOpenDiffReview = async (patchStep = null) => {
    setDiffError(null);

    if (patchStep?.file_path && patchStep?.modified_content !== undefined) {
      setDiffSession({
        filename: patchStep.file_path,
        original: patchStep.original_content || '',
        modified: patchStep.modified_content || '',
        patchText: patchStep.diff_text || '',
        isSimulated: Boolean(patchStep.is_mock)
      });
      setViewMode('diff');
      return;
    }

    if (!activeTab) {
      setStatusBanner({ type: 'info', text: 'Select a workspace file first to inspect changes.' });
      return;
    }

    const orig = originalContents[activeTab] ?? '';
    const mod = bufferContents[activeTab] ?? orig;
    try {
      const res = await apiFetch('/v1/edith/diff/generate', {
        method: 'POST',
        body: JSON.stringify({
          file_path: activeTab,
          original_content: orig,
          modified_content: mod
        })
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data?.message || 'Diff generation failed.');
      }
      setDiffSession({
        filename: activeTab,
        original: orig,
        modified: mod,
        patchText: data?.diff_text || '',
        isSimulated: false
      });
      setViewMode('diff');
    } catch (err) {
      setStatusBanner({ type: 'error', text: err?.message || 'Unable to generate unified diff.' });
    }
  };

  const handleApplyPatch = async () => {
    if (!diffSession?.patchText) {
      setViewMode('editor');
      return;
    }

    setIsApplyingPatch(true);
    setDiffError(null);
    try {
      const res = await apiFetch('/v1/edith/diff/apply', {
        method: 'POST',
        body: JSON.stringify({
          original_content: diffSession.original,
          patch_text: diffSession.patchText
        })
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data?.message || `Patch application failed (HTTP ${res.status}).`);
      }

      const targetPath = diffSession.filename;
      setOpenTabs((prev) => (prev.includes(targetPath) ? prev : [...prev.slice(-5), targetPath]));
      setOriginalContents((prev) => ({
        ...prev,
        [targetPath]: prev[targetPath] !== undefined ? prev[targetPath] : diffSession.original
      }));
      setBufferContents((prev) => ({ ...prev, [targetPath]: data.modified_content }));
      setActiveTab(targetPath);
      setViewMode('editor');
      setStatusBanner({
        type: 'success',
        text: `Applied ${data.hunks_applied} verified hunk(s) to editor buffer (${targetPath}, SHA-256: ${String(
          data.modified_checksum || ''
        ).slice(0, 12)}).`
      });
    } catch (err) {
      setDiffError(err?.message || 'Unable to apply patch hunks cleanly.');
    } finally {
      setIsApplyingPatch(false);
    }
  };

  const handleEvaluateCommandForDrawer = async (commandToCheck) => {
    const cleanCmd = (commandToCheck || '').trim();
    if (!cleanCmd) return;

    setIsCheckingPolicy(true);
    setStatusBanner(null);
    try {
      const res = await apiFetch('/v1/edith/policies/evaluate', {
        method: 'POST',
        body: JSON.stringify({ command: cleanCmd })
      });
      const data = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(data?.message || `Policy evaluation failed (HTTP ${res.status}).`);
      }

      setApprovalState({
        isOpen: true,
        command: data.command || cleanCmd,
        decision: data.decision || 'CONFIRMATION_REQUIRED',
        reason: data.reason || 'Policy verification complete.',
        riskScore: data.risk_score ?? 65
      });
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: err?.message || 'Unable to reach Policy Engine.'
      });
    } finally {
      setIsCheckingPolicy(false);
    }
  };

  const handleAuthorizeCommand = () => {
    const cmd = approvalState.command;
    setApprovalState((prev) => ({ ...prev, isOpen: false }));
    if (!cmd) return;
    setBottomTab('terminal');
    setPendingTerminalCmd({ command: cmd, approved: true, nonce: Date.now() });
  };

  const activeBufferCode = activeTab ? bufferContents[activeTab] ?? '' : '';
  const activeIsDirty = Boolean(
    activeTab &&
      originalContents[activeTab] !== undefined &&
      bufferContents[activeTab] !== originalContents[activeTab]
  );

  return (
    <div className="flex h-screen w-screen nebula-canvas starfield text-slate-100 overflow-hidden p-3 md:p-5 font-sans selection:bg-cyan-500 selection:text-black relative">
      {/* Dynamic Tactical Cyan & Cobalt Glow Auroras */}
      <div className="absolute top-1/12 left-1/4 w-[750px] h-[500px] rounded-full bg-gradient-to-tr from-cyan-600/35 via-blue-600/25 to-emerald-600/20 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 w-[650px] h-[450px] rounded-full bg-gradient-to-tr from-teal-500/25 via-indigo-600/20 to-cyan-500/20 blur-[150px] pointer-events-none" />

      {/* Main Floating Frosted Glass Window Container */}
      <div className="flex-1 flex flex-col frosted-glass-window rounded-3xl overflow-hidden relative z-10 shadow-2xl">
        {/* TOP WINDOW HEADER */}
        <header className="h-12 frosted-glass-header px-4 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 mr-2" aria-hidden="true">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm" />
            </div>

            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-400 to-emerald-500 flex items-center justify-center shadow-md shadow-cyan-500/30">
                <Terminal className="w-3.5 h-3.5 text-black stroke-[2.5]" />
              </div>
              <span className="font-bold text-xs tracking-wider text-white font-mono">
                E.D.I.T.H. // IDE
              </span>
            </div>

            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-cyan-300">
              <GitBranch className="w-3 h-3 text-cyan-400" />
              <span>
                {scanResult.total_files > 0
                  ? `${scanResult.total_files} files • ${scanResult.total_symbols} AST`
                  : 'Workspace'}
              </span>
            </div>
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[11px] font-mono text-emerald-300 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>ZERO-TRUST GATE: FAIL-CLOSED</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/friday')}
              title="Switch back to F.R.I.D.A.Y. Cognitive Co-Pilot"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white transition-all shadow-lg shadow-purple-600/30 border border-white/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-white" />
              <span>F.R.I.D.A.Y. // Co-Pilot ↗</span>
            </button>
          </div>
        </header>

        {/* WORKBENCH BODY */}
        <div className="flex-1 flex min-h-0 relative">
          {/* LEFT FILE EXPLORER SIDEBAR */}
          <aside
            className={`frosted-glass-sidebar flex flex-col z-20 shrink-0 transition-all duration-300 ease-in-out font-mono ${
              sidebarOpen ? 'w-60 p-3' : 'w-0 p-0 opacity-0 -translate-x-full border-r-0 overflow-hidden'
            }`}
          >
            <div className="w-54 h-full flex flex-col min-h-0">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-3 px-1 uppercase tracking-wider">
                <span>Explorer</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={scanWorkspace}
                    disabled={isScanning}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-cyan-300 cursor-pointer disabled:opacity-40"
                    title="Rescan Workspace Files"
                    aria-label="Rescan Workspace Files"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin text-cyan-400' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Collapse Explorer"
                    aria-label="Collapse Explorer"
                  >
                    <PanelLeftClose className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Workspace Files */}
              <div className="flex-1 overflow-y-auto space-y-2 text-xs pr-1">
                {workspaceError ? (
                  <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-400/30 text-[11px] text-red-200 space-y-2 font-sans">
                    <p>{workspaceError}</p>
                    <button
                      type="button"
                      onClick={scanWorkspace}
                      className="w-full py-1 rounded bg-red-500/20 hover:bg-red-500/30 text-white font-mono text-[10px] cursor-pointer"
                    >
                      Retry Scan
                    </button>
                  </div>
                ) : isScanning && groupedFiles.length === 0 ? (
                  <div className="flex items-center gap-2 px-2 py-4 text-slate-400 text-[11px]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                    <span>Indexing workspace...</span>
                  </div>
                ) : (
                  groupedFiles.map(([folder, items]) => (
                    <div key={folder} className="space-y-0.5">
                      <div className="flex items-center gap-1.5 py-1 px-1.5 text-slate-300">
                        <FolderOpen className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="truncate text-[11px] font-medium">{folder}</span>
                      </div>
                      <div className="pl-3 space-y-0.5">
                        {items.map((item) => {
                          const isSelected = activeTab === item.relative_path && viewMode === 'editor';
                          const isDirty =
                            originalContents[item.relative_path] !== undefined &&
                            bufferContents[item.relative_path] !== originalContents[item.relative_path];
                          const shortName = item.relative_path.split('/').pop();
                          return (
                            <button
                              key={item.relative_path}
                              type="button"
                              onClick={() => openWorkspaceFile(item.relative_path, scanResult.workspace_root)}
                              title={item.relative_path}
                              className={`w-full flex items-center justify-between py-1 px-2 rounded cursor-pointer transition-colors text-left ${
                                isSelected
                                  ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-200'
                                  : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 truncate min-w-0">
                                <FileCode className="w-3 h-3 text-cyan-400/70 shrink-0" />
                                <span className="text-[11px] truncate">{shortName}</span>
                              </div>
                              <span className="text-[9px] font-bold text-emerald-400 shrink-0 ml-1">
                                {isDirty ? '●' : item.symbols?.length ? `${item.symbols.length}` : ''}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Bottom 3D Arc Reactor Quantum Status */}
              <div className="pt-3 border-t border-white/10 flex items-center gap-2 p-1">
                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                  <EdithCore3D size={26} isBusy={isAgentBusy || isTerminalBusy} />
                </div>
                <div className="text-[10px] truncate leading-tight">
                  <p className="text-cyan-300 font-semibold">Quantum Core</p>
                  <p className="text-slate-400 font-mono">
                    {isAgentBusy || isTerminalBusy ? 'Status: Processing' : 'Status: Ready'}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* CENTER WORKSPACE */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Tab Bar & Action Controls */}
            <div className="h-10 bg-white/[0.02] border-b border-white/10 flex items-center justify-between px-3 shrink-0 gap-2">
              <div className="flex items-center gap-1 overflow-x-auto min-w-0">
                {!sidebarOpen && (
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(true)}
                    className="p-1.5 mr-2 rounded hover:bg-white/10 text-cyan-400 cursor-pointer shrink-0"
                    title="Open Explorer"
                    aria-label="Open Explorer"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}

                {openTabs.map((tab) => {
                  const label = tab.split('/').pop();
                  const isDirty =
                    originalContents[tab] !== undefined && bufferContents[tab] !== originalContents[tab];
                  return (
                    <div
                      key={tab}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-t-lg text-xs font-mono transition-colors border-b-2 shrink-0 ${
                        activeTab === tab && viewMode === 'editor'
                          ? 'bg-white/[0.07] border-cyan-400 text-cyan-200'
                          : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(tab);
                          setViewMode('editor');
                        }}
                        className="flex items-center gap-1.5 cursor-pointer"
                        title={tab}
                      >
                        <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{label}</span>
                        {isDirty && <span className="text-amber-300 text-[10px]">●</span>}
                      </button>
                      <button
                        type="button"
                        aria-label={`Close ${label}`}
                        onClick={() => {
                          const remaining = openTabs.filter((t) => t !== tab);
                          setOpenTabs(remaining);
                          if (activeTab === tab) {
                            setActiveTab(remaining[remaining.length - 1] || null);
                          }
                        }}
                        className="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={() => (viewMode === 'diff' ? setViewMode('editor') : handleOpenDiffReview())}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-mono transition-colors border-b-2 cursor-pointer shrink-0 ${
                    viewMode === 'diff'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                      : 'border-transparent text-slate-400 hover:text-cyan-300 hover:bg-white/[0.03]'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Diff Review{activeIsDirty ? ' *' : ''}</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    agentPanelOpen
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-sm shadow-cyan-500/20'
                      : 'bg-white/5 text-slate-300 hover:text-white border border-white/10'
                  }`}
                  title="Toggle Autonomous Workflow Agent Panel"
                >
                  <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI Agent</span>
                </button>

                <button
                  type="button"
                  disabled={isCheckingPolicy}
                  onClick={() => handleEvaluateCommandForDrawer(policyProbeCmd)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-amber-300 border border-amber-400/30 text-xs font-mono transition-colors cursor-pointer"
                  title="Run real Zero-Trust Policy Gate check"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>{isCheckingPolicy ? 'Checking...' : 'Policy Gate'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setBottomTab('terminal');
                    setPendingTerminalCmd({ command: 'pytest', approved: false, nonce: Date.now() });
                  }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-black" />
                  <span>Run Sandbox</span>
                </button>
              </div>
            </div>

            {statusBanner && (
              <div
                role={statusBanner.type === 'error' ? 'alert' : 'status'}
                className={`px-4 py-2 border-b text-xs font-mono flex items-center justify-between gap-2 shrink-0 ${
                  statusBanner.type === 'error'
                    ? 'bg-red-500/15 border-red-400/30 text-red-200'
                    : statusBanner.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-400/30 text-emerald-200'
                    : 'bg-cyan-500/15 border-cyan-400/30 text-cyan-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {statusBanner.type === 'error' ? (
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span className="truncate">{statusBanner.text}</span>
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  onClick={() => setStatusBanner(null)}
                  className="p-0.5 rounded hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Editor Workspace Component */}
            <div className="flex-1 min-h-0 relative">
              <EditorErrorBoundary>
                {viewMode === 'diff' ? (
                  <MonacoDiffViewer
                    filename={diffSession?.filename || activeTab || 'untitled.txt'}
                    original={diffSession?.original ?? ''}
                    modified={diffSession?.modified ?? ''}
                    isSimulated={Boolean(diffSession?.isSimulated)}
                    isApplying={isApplyingPatch}
                    error={diffError}
                    onAccept={handleApplyPatch}
                    onReject={() => {
                      setDiffError(null);
                      setViewMode('editor');
                    }}
                  />
                ) : isLoadingFile ? (
                  <div className="w-full h-full flex items-center justify-center bg-[#070a12] text-xs font-mono text-cyan-300 gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading {activeTab}...</span>
                  </div>
                ) : activeTab ? (
                  <MonacoCodeEditor
                    filename={activeTab}
                    code={activeBufferCode}
                    onChange={(nextVal) =>
                      setBufferContents((prev) => ({
                        ...prev,
                        [activeTab]: nextVal ?? ''
                      }))
                    }
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-[#070a12] text-slate-400 text-xs font-mono space-y-2 p-6 text-center">
                    <FileCode className="w-8 h-8 text-cyan-500/60" />
                    <p className="text-slate-200 font-semibold">No workspace file open</p>
                    <p>Select a file from the Explorer sidebar or rescan the repository.</p>
                  </div>
                )}
              </EditorErrorBoundary>
            </div>

            {/* BOTTOM TACTICAL RUNNER TERMINAL & DAG DOCK */}
            <div className="h-56 border-t border-white/10 flex flex-col bg-[#05070e] shrink-0 font-mono">
              <div className="h-8 border-b border-white/10 px-3 flex items-center justify-between text-xs bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBottomTab('terminal')}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      bottomTab === 'terminal' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    &gt;_ Runner Terminal (Host 8003)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('dag')}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      bottomTab === 'dag' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚡ Task Decomposition DAG
                  </button>
                  <button
                    type="button"
                    onClick={() => setBottomTab('policy')}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      bottomTab === 'policy' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🛡️ Policy Rules
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isTerminalBusy ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'
                    }`}
                  />
                  <span>{isTerminalBusy ? 'Command Executing...' : 'Runner Ready'}</span>
                </div>
              </div>

              <div className="flex-1 min-h-0 relative">
                {/* Keep RunnerTerminal mounted so scrollback and ResizeObserver remain intact */}
                <div className={bottomTab === 'terminal' ? 'w-full h-full' : 'hidden'}>
                  <RunnerTerminal
                    pendingCommand={pendingTerminalCmd}
                    onPendingCommandHandled={() => setPendingTerminalCmd(null)}
                    onBusyChange={setIsTerminalBusy}
                    onApprovalRequired={(cmd, policy) => {
                      setApprovalState({
                        isOpen: true,
                        command: cmd,
                        decision: policy?.decision || 'CONFIRMATION_REQUIRED',
                        reason:
                          policy?.reason ||
                          'Command requires explicit developer confirmation before execution.',
                        riskScore: policy?.risk_score ?? 65
                      });
                    }}
                  />
                </div>

                {bottomTab === 'dag' && (
                  <div className="p-4 space-y-3 overflow-y-auto h-full">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        fetchTaskPlan(planGoal);
                      }}
                      className="flex items-center gap-2"
                    >
                      <input
                        type="text"
                        value={planGoal}
                        onChange={(e) => setPlanGoal(e.target.value)}
                        aria-label="Engineering task goal"
                        placeholder="Describe an engineering goal to decompose..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-400/50"
                      />
                      <button
                        type="submit"
                        disabled={isPlanning || !planGoal.trim()}
                        className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-xs text-cyan-200 font-semibold cursor-pointer disabled:opacity-40"
                      >
                        {isPlanning ? 'Planning...' : 'Generate Plan'}
                      </button>
                    </form>

                    {planError && (
                      <div className="p-2.5 rounded-lg bg-red-500/15 border border-red-400/35 text-xs text-red-200">
                        {planError}
                      </div>
                    )}

                    {activePlan && (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-cyan-300 font-semibold">
                            Plan #{activePlan.plan_id}: {activePlan.goal}
                          </span>
                          {activePlan.is_mock && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/35 text-[10px] text-amber-200">
                              Deterministic Planner
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          {activePlan.steps.map((step) => (
                            <div
                              key={step.id}
                              className="p-3 rounded-xl bg-white/[0.04] border border-cyan-400/25 text-slate-200"
                            >
                              <p className="font-bold text-xs text-cyan-300">
                                {step.order}. {step.name}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-1">{step.description}</p>
                              <p className="text-[10px] text-slate-300 mt-1 uppercase">
                                Action: {step.action_type} • {step.status}
                              </p>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {bottomTab === 'policy' && (
                  <div className="p-4 space-y-3 overflow-y-auto h-full text-xs">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={policyProbeCmd}
                        onChange={(e) => setPolicyProbeCmd(e.target.value)}
                        aria-label="Command to classify"
                        placeholder="Enter a command to test against Zero-Trust Policy..."
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-400/50"
                      />
                      <button
                        type="button"
                        disabled={isCheckingPolicy || !policyProbeCmd.trim()}
                        onClick={() => handleEvaluateCommandForDrawer(policyProbeCmd)}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-xs text-amber-200 font-semibold cursor-pointer disabled:opacity-40"
                      >
                        {isCheckingPolicy ? 'Evaluating...' : 'Evaluate Policy'}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                        <span className="font-bold block mb-1">SAFE (Auto-Execute)</span>
                        <p className="text-[10px] text-slate-300">
                          git status/diff/log, dir, ls, npm test, pytest (unquoted operators &amp; flags verified)
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                        <span className="font-bold block mb-1">CONFIRMATION_REQUIRED</span>
                        <p className="text-[10px] text-slate-300">
                          npm install, pip install, git commit/checkout, shell chaining (&amp;&amp;, ;, |, &gt;)
                        </p>
                      </div>
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
                        <span className="font-bold block mb-1">DENIED (Prohibited)</span>
                        <p className="text-[10px] text-slate-300">
                          rmdir /s /q c:\, format, diskpart, rm -rf /, curl | bash, powershell -enc
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT AUTONOMOUS AI AGENT PANEL */}
          <EdithAgentPanel
            isOpen={agentPanelOpen}
            activeFile={activeTab}
            onClose={() => setAgentPanelOpen(false)}
            onBusyChange={setIsAgentBusy}
            onOpenDiffReview={(step) => handleOpenDiffReview(step)}
          />
        </div>
      </div>

      {/* Human-in-the-Loop Command Approval Drawer */}
      <CommandApprovalDrawer
        isOpen={approvalState.isOpen}
        command={approvalState.command}
        decision={approvalState.decision}
        reason={approvalState.reason}
        riskScore={approvalState.riskScore}
        isSubmitting={isTerminalBusy}
        onApprove={handleAuthorizeCommand}
        onDeny={() => setApprovalState((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
