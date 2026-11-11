import React from 'react';
import { ShieldAlert, Check, X, AlertTriangle, ShieldCheck } from 'lucide-react';

export function CommandApprovalDrawer({
  isOpen = false,
  command = 'npm install @testing-library/react',
  decision = 'CONFIRMATION_REQUIRED',
  reason = 'Mutates package.json dependencies and writes to node_modules directory.',
  riskScore = 65,
  onApprove,
  onDeny
}) {
  if (!isOpen) return null;

  return (
    <div className="absolute bottom-4 right-4 z-50 w-96 frosted-glass-window border border-amber-400/40 p-5 rounded-2xl shadow-2xl shadow-amber-500/20 animate-in fade-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shadow-md">
          <ShieldAlert className="w-4 h-4" />
        </div>
        <div>
          <h4 className="text-xs font-bold text-white tracking-wide uppercase font-mono">
            Policy Gate: Approval Required
          </h4>
          <p className="text-[10px] text-amber-300/80 font-mono">
            Risk Score: {riskScore}/100 // Mutating Command
          </p>
        </div>
      </div>

      <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 mb-3 font-mono text-xs text-amber-200 break-all">
        <code>$ {command}</code>
      </div>

      <p className="text-xs text-slate-300 mb-4 leading-relaxed">
        {reason}
      </p>

      <div className="flex items-center justify-end gap-2.5">
        <button
          onClick={onDeny}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5 text-red-400" />
          <span>Deny</span>
        </button>
        <button
          onClick={onApprove}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
        >
          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
          <span>Authorize Command</span>
        </button>
      </div>
    </div>
  );
}

