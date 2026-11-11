import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Terminal,
  Sparkles,
  Play,
  FileCode,
  FolderOpen,
  GitBranch,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowLeftRight,
  PanelLeftClose,
  PanelLeftOpen,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Code2,
  FileText
} from 'lucide-react';
import { EdithCore3D } from '../components/EdithCore3D';
import { MonacoCodeEditor } from '../editor/MonacoCodeEditor';
import { MonacoDiffViewer } from '../diffs/MonacoDiffViewer';
import { RunnerTerminal } from '../terminal/RunnerTerminal';
import { CommandApprovalDrawer } from '../agent/CommandApprovalDrawer';
import { EdithAgentPanel } from '../agent/EdithAgentPanel';
import { Wand2 } from 'lucide-react';

export function EdithWorkspace() {
  const navigate = useNavigate();

  // State
  const [activeTab, setActiveTab] = useState('decomposer.py');
  const [viewMode, setViewMode] = useState('editor'); // 'editor' | 'diff'
  const [bottomTab, setBottomTab] = useState('terminal'); // 'terminal' | 'dag' | 'policy'
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [agentPanelOpen, setAgentPanelOpen] = useState(true);
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [approvalCmd, setApprovalCmd] = useState('npm install @friday-edith/contracts');

  const files = {
    'decomposer.py': `from typing import List, Dict, Any
from pydantic import BaseModel, Field
import uuid

class TaskDecomposer:
    """Decomposes high-level engineering tasks into ordered deterministic execution steps."""

    def decompose(self, goal: str, workspace_root: str = "") -> DecomposedPlan:
        steps: List[ExecutionStep] = []
        lower_goal = goal.lower()

        # Step 1: Survey context & index AST symbols
        steps.append(ExecutionStep(
            order=1,
            name="Survey Context & Index Symbols",
            action_type="inspect",
            description=f"Inspect repository AST structure relevant to: {goal}"
        ))

        # Step 2: Code patching & generation step
        steps.append(ExecutionStep(
            order=2,
            name="Synthesize Code Modifications",
            action_type="patch",
            description="Draft hunk patches and generate unified diffs"
        ))

        # Step 3: Run isolated verification
        if any(w in lower_goal for w in ["test", "build", "verify"]):
            steps.append(ExecutionStep(
                order=3,
                name="Execute Automated Verification in Isolated Runner",
                action_type="verify",
                command="pytest"
            ))

        return DecomposedPlan(goal=goal, total_steps=len(steps), steps=steps)`,

    'gateway.py': `import re
from pydantic import BaseModel

class CommandPolicyGateway:
    """Enforces zero-trust command classification for E.D.I.T.H. execution."""

    SAFE_PATTERNS = [
        r"^(git\\s+(status|diff|log|branch|show))(\\s+.*)?$",
        r"^(dir|ls|pwd|echo)(\\s+.*)?$",
        r"^(npm\\s+(test|run\\s+test))(\\s+.*)?$",
        r"^(pytest)(\\s+.*)?$"
    ]

    DENIED_PATTERNS = [
        r"(rmdir\\s+/s\\s+/q\\s+[c-zC-Z]:\\\\)",
        r"(format\\s+[c-zC-Z]:)",
        r"(sudo\\s+rm\\s+-rf\\s+/)"
    ]

    def evaluate(self, command: str) -> PolicyDecision:
        cmd_clean = command.strip()
        for pattern in self.DENIED_PATTERNS:
            if re.search(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(command=cmd_clean, decision="DENIED", risk_score=100)

        for pattern in self.SAFE_PATTERNS:
            if re.match(pattern, cmd_clean, re.IGNORECASE):
                return PolicyDecision(command=cmd_clean, decision="SAFE", risk_score=10)

        return PolicyDecision(
            command=cmd_clean,
            decision="CONFIRMATION_REQUIRED",
            reason="Mutating command requires explicit developer authorization.",
            risk_score=65
        )`,

    'diff_generator.py': `import difflib
import hashlib
from pydantic import BaseModel

class DiffEngine:
    """Generates standard unified diffs and individual hunks for Monaco editor review."""

    def generate_diff(self, file_path: str, original: str, modified: str) -> UnifiedDiffResult:
        orig_lines = original.splitlines(keepends=True)
        mod_lines = modified.splitlines(keepends=True)

        diff = list(difflib.unified_diff(
            orig_lines,
            mod_lines,
            fromfile=f"a/{file_path}",
            tofile=f"b/{file_path}"
        ))

        return UnifiedDiffResult(
            file_path=file_path,
            diff_text="".join(diff),
            hunks_count=sum(1 for line in diff if line.startswith("@@"))
        )`,

    'server.js': `import http from 'http';
import { spawn } from 'child_process';

const PORT = 8003;
const HOST = '127.0.0.1';

// Native execution daemon without Docker
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/v1/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy', port: PORT, isolation: 'Native Hyper-V / OS User' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(\`[runner-host] Active on http://\${HOST}:\${PORT}\`);
});`
  };

  const diffExamples = {
    original: `class CommandPolicyGateway:
    SAFE_PATTERNS = [
        r"^(git\\s+(status|diff))(\\s+.*)?$",
        r"^(dir|ls)(\\s+.*)?$"
    ]`,
    modified: `class CommandPolicyGateway:
    SAFE_PATTERNS = [
        r"^(git\\s+(status|diff|log|branch|show))(\\s+.*)?$",
        r"^(dir|ls|pwd|echo)(\\s+.*)?$",
        r"^(npm\\s+(test|run\\s+test))(\\s+.*)?$",
        r"^(pytest)(\\s+.*)?$"
    ]`
  };

  return (
    <div className="flex h-screen w-screen nebula-canvas starfield text-slate-100 overflow-hidden p-3 md:p-5 font-sans selection:bg-cyan-500 selection:text-black relative">
      {/* Dynamic Tactical Cyan & Cobalt Glow Auroras */}
      <div className="absolute top-1/12 left-1/4 w-[750px] h-[500px] rounded-full bg-gradient-to-tr from-cyan-600/35 via-blue-600/25 to-emerald-600/20 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 w-[650px] h-[450px] rounded-full bg-gradient-to-tr from-teal-500/25 via-indigo-600/20 to-cyan-500/20 blur-[150px] pointer-events-none" />

      {/* Main Floating macOS-Style Frosted Glass Window Container */}
      <div className="flex-1 flex flex-col frosted-glass-window rounded-3xl overflow-hidden relative z-10 shadow-2xl">
        
        {/* TOP WINDOW HEADER: Traffic Dots + Branch + Sandbox Badge + Switcher */}
        <header className="h-12 frosted-glass-header px-4 flex items-center justify-between shrink-0 select-none">
          <div className="flex items-center gap-3">
            {/* Traffic Dots */}
            <div className="flex items-center gap-2 mr-2">
              <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
              <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
            </div>

            {/* Brand Logo & Name */}
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-400 to-emerald-500 flex items-center justify-center shadow-md shadow-cyan-500/30">
                <Terminal className="w-3.5 h-3.5 text-black stroke-[2.5]" />
              </div>
              <span className="font-bold text-xs tracking-wider text-white font-mono">
                E.D.I.T.H. // IDE
              </span>
            </div>

            {/* Git Branch Pill */}
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] font-mono text-cyan-300">
              <GitBranch className="w-3 h-3 text-cyan-400" />
              <span>main</span>
            </div>
          </div>

          {/* Sandbox Status Badge */}
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/30 text-[11px] font-mono text-emerald-300 shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>SANDBOX: RUNNER 8003 ARMED</span>
          </div>

          {/* Right Action: Return to F.R.I.D.A.Y. */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate('/friday')}
              title="Switch back to F.R.I.D.A.Y. Cognitive Co-Pilot"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white transition-all shadow-lg shadow-purple-600/30 border border-white/20 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-white" />
              <span>F.R.I.D.A.Y. // Co-Pilot ↗</span>
            </button>
          </div>
        </header>

        {/* WORKBENCH BODY: Left File Explorer + Center Editor + Bottom Terminal */}
        <div className="flex-1 flex min-h-0 relative">
          
          {/* LEFT FILE EXPLORER SIDEBAR */}
          <aside
            className={`frosted-glass-sidebar flex flex-col z-20 shrink-0 transition-all duration-300 ease-in-out font-mono ${
              sidebarOpen ? 'w-56 p-3' : 'w-0 p-0 opacity-0 -translate-x-full border-r-0 overflow-hidden'
            }`}
          >
            <div className="w-50 h-full flex flex-col">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 mb-3 px-1 uppercase tracking-wider">
                <span>Explorer</span>
                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                  title="Collapse Explorer"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Folders and Files */}
              <div className="flex-1 overflow-y-auto space-y-1 text-xs">
                {/* Services/edith-engine */}
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 py-1 px-1.5 text-slate-300 hover:bg-white/[0.06] rounded cursor-pointer">
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="truncate text-[11px] font-medium">services/edith-engine</span>
                  </div>

                  <div className="pl-4 space-y-0.5">
                    {['decomposer.py', 'gateway.py', 'diff_generator.py'].map(fname => (
                      <div
                        key={fname}
                        onClick={() => { setActiveTab(fname); setViewMode('editor'); }}
                        className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer transition-colors ${
                          activeTab === fname && viewMode === 'editor'
                            ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-200'
                            : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          <FileCode className="w-3 h-3 text-cyan-400/70" />
                          <span className="text-[11px] truncate">{fname}</span>
                        </div>
                        <span className="text-[9px] font-bold text-emerald-400">A</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Runner Host */}
                <div className="space-y-0.5 pt-1">
                  <div className="flex items-center gap-1.5 py-1 px-1.5 text-slate-300 hover:bg-white/[0.06] rounded cursor-pointer">
                    <FolderOpen className="w-3.5 h-3.5 text-cyan-400" />
                    <span className="truncate text-[11px] font-medium">runner-host</span>
                  </div>
                  <div className="pl-4 space-y-0.5">
                    <div
                      onClick={() => { setActiveTab('server.js'); setViewMode('editor'); }}
                      className={`flex items-center justify-between py-1 px-2 rounded cursor-pointer transition-colors ${
                        activeTab === 'server.js' && viewMode === 'editor'
                          ? 'bg-cyan-500/15 border border-cyan-400/40 text-cyan-200'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <FileCode className="w-3 h-3 text-cyan-400/70" />
                        <span className="text-[11px] truncate">server.js</span>
                      </div>
                      <span className="text-[9px] font-bold text-cyan-400">M</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom 3D Arc Reactor Quantum Status */}
              <div className="pt-3 border-t border-white/10 flex items-center gap-2 p-1">
                <div className="w-7 h-7 flex items-center justify-center shrink-0">
                  <EdithCore3D size={26} isBusy={false} />
                </div>
                <div className="text-[10px] truncate leading-tight">
                  <p className="text-cyan-300 font-semibold">Quantum Core</p>
                  <p className="text-slate-400 font-mono">Status: Ready</p>
                </div>
              </div>
            </div>
          </aside>

          {/* CENTER WORKSPACE: Monaco Code Editor or Diff Viewer */}
          <div className="flex-1 flex flex-col min-w-0">
            
            {/* Tab Bar & Action Controls */}
            <div className="h-10 bg-white/[0.02] border-b border-white/10 flex items-center justify-between px-3 shrink-0">
              <div className="flex items-center gap-1 overflow-x-auto">
                {!sidebarOpen && (
                  <button
                    onClick={() => setSidebarOpen(true)}
                    className="p-1.5 mr-2 rounded hover:bg-white/10 text-cyan-400"
                    title="Open Explorer"
                  >
                    <PanelLeftOpen className="w-4 h-4" />
                  </button>
                )}

                {Object.keys(files).map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setActiveTab(tab); setViewMode('editor'); }}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-t-lg text-xs font-mono transition-colors border-b-2 cursor-pointer ${
                      activeTab === tab && viewMode === 'editor'
                        ? 'bg-white/[0.07] border-cyan-400 text-cyan-200'
                        : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5 text-cyan-400" />
                    <span>{tab}</span>
                  </button>
                ))}

                {/* Diff Review Tab Button */}
                <button
                  onClick={() => setViewMode(viewMode === 'diff' ? 'editor' : 'diff')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-mono transition-colors border-b-2 cursor-pointer ${
                    viewMode === 'diff'
                      ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 font-bold'
                      : 'border-transparent text-slate-400 hover:text-cyan-300 hover:bg-white/[0.03]'
                  }`}
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Diff Review</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setAgentPanelOpen(!agentPanelOpen)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer ${
                    agentPanelOpen
                      ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40 shadow-sm shadow-cyan-500/20'
                      : 'bg-white/5 text-slate-300 hover:text-white border border-white/10'
                  }`}
                  title="Toggle Claude Code / Codex Autonomous Agent Panel"
                >
                  <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>AI Agent</span>
                </button>

                <button
                  onClick={() => {
                    setApprovalCmd('npm install @testing-library/react');
                    setApprovalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-400/30 text-xs font-mono transition-colors cursor-pointer"
                  title="Simulate Policy Check for Mutating Command"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  <span>Test Policy Gate</span>
                </button>

                <button
                  onClick={() => setBottomTab('terminal')}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-black font-semibold text-xs transition-all shadow-md shadow-cyan-500/20 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-black" />
                  <span>Run Sandbox</span>
                </button>
              </div>
            </div>

            {/* Editor Workspace Component */}
            <div className="flex-1 min-h-0 relative">
              {viewMode === 'editor' ? (
                <MonacoCodeEditor
                  filename={activeTab}
                  code={files[activeTab] || ''}
                />
              ) : (
                <MonacoDiffViewer
                  filename="gateway.py"
                  original={diffExamples.original}
                  modified={diffExamples.modified}
                  onAccept={() => {
                    alert('Hunk patch accepted and written to workspace!');
                    setViewMode('editor');
                  }}
                  onReject={() => {
                    setViewMode('editor');
                  }}
                />
              )}
            </div>

            {/* BOTTOM TACTICAL RUNNER TERMINAL & DAG DOCK */}
            <div className="h-56 border-t border-white/10 flex flex-col bg-[#05070e] shrink-0 font-mono">
              {/* Bottom Dock Header Tabs */}
              <div className="h-8 border-b border-white/10 px-3 flex items-center justify-between text-xs bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBottomTab('terminal')}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      bottomTab === 'terminal' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    &gt;_ Runner Terminal (Host 8003)
                  </button>
                  <button
                    onClick={() => setBottomTab('dag')}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      bottomTab === 'dag' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚡ Task Decomposition DAG
                  </button>
                  <button
                    onClick={() => setBottomTab('policy')}
                    className={`px-2.5 py-1 rounded text-[11px] transition-colors cursor-pointer ${
                      bottomTab === 'policy' ? 'bg-cyan-500/20 text-cyan-300 font-bold' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🛡️ Policy Rules
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Port 8003 Active</span>
                </div>
              </div>

              {/* Bottom Dock Content Area */}
              <div className="flex-1 min-h-0">
                {bottomTab === 'terminal' && (
                  <RunnerTerminal />
                )}

                {bottomTab === 'dag' && (
                  <div className="p-4 space-y-3 overflow-y-auto h-full">
                    <p className="text-cyan-300 text-xs font-semibold">Active Execution Plan: #plan_edith_2026</p>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                        <p className="font-bold text-xs">1. Survey AST Context</p>
                        <p className="text-[10px] text-slate-400 mt-1">Status: Completed (1,935 symbols parsed)</p>
                      </div>
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                        <p className="font-bold text-xs">2. Synthesize Patch</p>
                        <p className="text-[10px] text-slate-400 mt-1">Status: Completed (Unified Diff ready)</p>
                      </div>
                      <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300">
                        <p className="font-bold text-xs">3. Test in Sandbox</p>
                        <p className="text-[10px] text-slate-400 mt-1">Status: Passed (4/4 tests clean)</p>
                      </div>
                      <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-slate-400">
                        <p className="font-bold text-xs">4. Human Review</p>
                        <p className="text-[10px] text-slate-400 mt-1">Status: Pending Verification</p>
                      </div>
                    </div>
                  </div>
                )}

                {bottomTab === 'policy' && (
                  <div className="p-4 space-y-2 overflow-y-auto h-full text-xs">
                    <p className="text-cyan-300 font-semibold mb-2">Policy Gate Classification Rules:</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                        <span className="font-bold block mb-1">SAFE (Auto-Execute)</span>
                        <p className="text-[10px] text-slate-300">git status, git diff, dir, ls, npm test, pytest</p>
                      </div>
                      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300">
                        <span className="font-bold block mb-1">CONFIRMATION_REQUIRED</span>
                        <p className="text-[10px] text-slate-300">npm install, pip install, rm, del, git checkout</p>
                      </div>
                      <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300">
                        <span className="font-bold block mb-1">DENIED (Prohibited)</span>
                        <p className="text-[10px] text-slate-300">rmdir /s /q c:\, format, diskpart, sudo rm -rf /</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* RIGHT CLAUDE CODE & CODEX AUTONOMOUS AI AGENT PANEL */}
          <EdithAgentPanel
            isOpen={agentPanelOpen}
            onClose={() => setAgentPanelOpen(false)}
            onOpenDiffReview={() => setViewMode('diff')}
          />
        </div>
      </div>

      {/* Human-in-the-Loop Command Approval Drawer */}
      <CommandApprovalDrawer
        isOpen={approvalOpen}
        command={approvalCmd}
        onApprove={() => {
          setApprovalOpen(false);
          alert('Authorized! Executing mutating command in isolated sandbox.');
        }}
        onDeny={() => {
          setApprovalOpen(false);
        }}
      />
    </div>
  );
}

