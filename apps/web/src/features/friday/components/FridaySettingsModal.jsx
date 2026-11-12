import React, { useEffect, useState } from 'react';
import { X, Settings, User, Sliders, Shield, CheckCircle2, AlertCircle, LogOut, Loader2 } from 'lucide-react';
import { apiFetch, safeParseJson } from '../../../lib/apiClient.js';
import { useAuthStore } from '../../../stores/authStore.js';
import { useFridayStore } from '../../../stores/fridayStore.js';

const DEFAULT_SYSTEM_PROMPT = 'You are F.R.I.D.A.Y., a high-intelligence AI assistant.';

export function FridaySettingsModal({ isOpen, onClose }) {
  const { user, setUser } = useAuthStore();
  const { selectedModel, systemPrompt, temperature, setPreferences } = useFridayStore();

  const [displayName, setDisplayName] = useState(user?.name || '');
  const [modelChoice, setModelChoice] = useState(selectedModel || 'claude-3-7-sonnet');
  const [promptText, setPromptText] = useState(systemPrompt || DEFAULT_SYSTEM_PROMPT);
  const [tempValue, setTempValue] = useState(temperature ?? 0.7);
  const [isSaving, setIsSaving] = useState(false);
  const [isRevokingSessions, setIsRevokingSessions] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setDisplayName(user?.name || '');
    setModelChoice(selectedModel || 'claude-3-7-sonnet');
    setPromptText(systemPrompt || DEFAULT_SYSTEM_PROMPT);
    setTempValue(temperature ?? 0.7);
    setStatusMsg(null);
    setErrorMsg(null);
  }, [isOpen, user?.name, selectedModel, systemPrompt, temperature]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const trimmedName = displayName.trim();
    if (trimmedName.length < 2) {
      setErrorMsg('Display name must be at least 2 characters.');
      return;
    }

    setIsSaving(true);
    try {
      if (trimmedName !== (user?.name || '')) {
        const res = await apiFetch('/v1/auth/me', {
          method: 'PATCH',
          body: JSON.stringify({ name: trimmedName })
        });
        const payload = await safeParseJson(res);
        if (!res.ok || !payload?.data?.user) {
          throw new Error(payload?.message || 'Unable to update profile settings.');
        }
        setUser(payload.data.user);
      }

      setPreferences({
        selectedModel: modelChoice,
        systemPrompt: promptText,
        temperature: Number(tempValue)
      });

      setStatusMsg('Settings saved to your account and active workspace.');
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to save settings.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRevokeOtherSessions = async () => {
    setErrorMsg(null);
    setStatusMsg(null);
    setIsRevokingSessions(true);
    try {
      const res = await apiFetch('/v1/auth/sessions/revoke-others', {
        method: 'POST'
      });
      const payload = await safeParseJson(res);
      if (!res.ok) {
        throw new Error(payload?.message || 'Unable to revoke other sessions.');
      }
      const count = payload?.data?.revokedCount ?? 0;
      setStatusMsg(
        count > 0
          ? `Signed out ${count} other active session${count === 1 ? '' : 's'}.`
          : 'No other active sessions found.'
      );
    } catch (err) {
      setErrorMsg(err?.message || 'Failed to revoke other sessions.');
    } finally {
      setIsRevokingSessions(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="friday-settings-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl frosted-glass-window border border-purple-400/25 p-6 text-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-600/25 border border-purple-400/40 flex items-center justify-center text-purple-300">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 id="friday-settings-title" className="text-base font-bold text-white">
                F.R.I.D.A.Y. Settings
              </h2>
              <p className="text-[11px] text-slate-400">Account profile, AI model behavior & session security</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-5 space-y-5 text-xs">
          {/* Profile Section */}
          <div className="p-4 rounded-2xl frosted-glass-card space-y-3">
            <div className="flex items-center gap-2 text-purple-300 font-semibold">
              <User className="w-3.5 h-3.5" />
              <span>Account Profile</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="friday-profile-name" className="block text-[11px] text-slate-400 mb-1">
                  Display Name
                </label>
                <input
                  id="friday-profile-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={80}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-slate-100 focus:outline-none focus:border-purple-400"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Signed-in Email & Role</label>
                <div className="px-3 py-2 rounded-xl bg-black/20 border border-white/10 text-slate-300 flex items-center justify-between gap-2">
                  <span className="truncate">{user?.email || 'Authenticated User'}</span>
                  <span className="px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-400/30 text-[10px] font-mono text-purple-200 shrink-0">
                    {user?.role || 'USER'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Model & Prompt Section */}
          <div className="p-4 rounded-2xl frosted-glass-card space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-purple-300 font-semibold">
                <Sliders className="w-3.5 h-3.5" />
                <span>Intelligence Defaults</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModelChoice('claude-3-7-sonnet');
                  setPromptText(DEFAULT_SYSTEM_PROMPT);
                  setTempValue(0.7);
                }}
                className="text-[11px] text-slate-400 hover:text-purple-200 underline cursor-pointer"
              >
                Reset defaults
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="friday-default-model" className="block text-[11px] text-slate-400 mb-1">
                  Active Model
                </label>
                <select
                  id="friday-default-model"
                  value={modelChoice}
                  onChange={(e) => setModelChoice(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-slate-100 focus:outline-none focus:border-purple-400 cursor-pointer"
                >
                  <option value="claude-3-7-sonnet" className="bg-[#120d24]">F.R.I.D.A.Y. 4.0e (Claude 3.7)</option>
                  <option value="gpt-4o" className="bg-[#120d24]">GPT-4o Multimodal</option>
                  <option value="gemini-2-flash" className="bg-[#120d24]">Gemini 2.0 Flash</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <label htmlFor="friday-temperature">Temperature</label>
                  <span className="font-mono text-purple-200">{Number(tempValue).toFixed(1)}</span>
                </div>
                <input
                  id="friday-temperature"
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={tempValue}
                  onChange={(e) => setTempValue(parseFloat(e.target.value))}
                  className="w-full accent-purple-500 mt-2 cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label htmlFor="friday-system-prompt" className="block text-[11px] text-slate-400 mb-1">
                System Instructions
              </label>
              <textarea
                id="friday-system-prompt"
                rows={3}
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                maxLength={8000}
                placeholder={DEFAULT_SYSTEM_PROMPT}
                className="w-full px-3 py-2 rounded-xl bg-black/30 border border-white/15 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-purple-400 resize-none"
              />
            </div>
          </div>

          {/* Session Security Section */}
          <div className="p-4 rounded-2xl frosted-glass-card flex items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-200">Session Security</div>
                <p className="text-[11px] text-slate-400">
                  Revoke refresh sessions on other browsers or devices while keeping this session active.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRevokeOtherSessions}
              disabled={isRevokingSessions}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-red-500/20 border border-white/15 hover:border-red-400/40 text-slate-200 hover:text-red-200 transition-colors cursor-pointer disabled:opacity-50"
            >
              {isRevokingSessions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LogOut className="w-3.5 h-3.5" />}
              <span>Sign Out Others</span>
            </button>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-red-500/15 border border-red-400/35 text-red-200">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {statusMsg && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/15 border border-emerald-400/35 text-emerald-200">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{statusMsg}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold shadow-lg shadow-purple-600/25 cursor-pointer disabled:opacity-50"
            >
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

