import React, { useEffect } from 'react';
import { ShieldAlert, ShieldBan, ShieldCheck, Check, X, Loader2 } from 'lucide-react';

export function CommandApprovalDrawer({
  isOpen = false,
  command = '',
  decision = 'CONFIRMATION_REQUIRED',
  reason = '',
  riskScore = 0,
  isSubmitting = false,
  onApprove,
  onDeny
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting && onDeny) {
        onDeny();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onDeny]);

  if (!isOpen) return null;

  const isDenied = decision === 'DENIED';
  const isSafe = decision === 'SAFE';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="policy-gate-title"
      className={`absolute bottom-4 right-4 z-50 w-96 frosted-glass-window p-5 rounded-2xl shadow-2xl border ${
        isDenied
          ? 'border-red-400/50 shadow-red-500/20'
          : isSafe
          ? 'border-emerald-400/40 shadow-emerald-500/20'
          : 'border-amber-400/40 shadow-amber-500/20'
      }`}
    >
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`w-8 h-8 rounded-xl border flex items-center justify-center shadow-md ${
            isDenied
              ? 'bg-red-500/20 border-red-400/40 text-red-300'
              : isSafe
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-300'
              : 'bg-amber-500/20 border-amber-400/40 text-amber-300'
          }`}
        >
          {isDenied ? (
            <ShieldBan className="w-4 h-4" />
          ) : isSafe ? (
            <ShieldCheck className="w-4 h-4" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}
        </div>
        <div>
          <h4 id="policy-gate-title" className="text-xs font-bold text-white tracking-wide uppercase font-mono">
            Policy Gate: {decision.replace(/_/g, ' ')}
          </h4>
          <p className="text-[10px] text-amber-300/80 font-mono">
            Risk Score: {riskScore}/100 // Zero-Trust Classifier
          </p>
        </div>
      </div>

      <div className="p-2.5 rounded-xl bg-black/60 border border-white/10 mb-3 font-mono text-xs text-amber-200 break-all">
        <code>$ {command}</code>
      </div>

      <p className="text-xs text-slate-300 mb-4 leading-relaxed">{reason}</p>

      <div className="flex items-center justify-end gap-2.5">
        <button
          type="button"
          onClick={onDeny}
          disabled={isSubmitting}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5 text-red-400" />
          <span>{isDenied ? 'Dismiss' : 'Deny'}</span>
        </button>

        {!isDenied && (
          <button
            type="button"
            onClick={onApprove}
            disabled={isSubmitting}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 disabled:opacity-50 text-black text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
            <span>{isSubmitting ? 'Executing...' : 'Authorize Command'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
