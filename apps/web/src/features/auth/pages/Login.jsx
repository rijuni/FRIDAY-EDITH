import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Lock,
  Mail,
  User,
  ArrowRight,
  ShieldCheck,
  Cpu,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';
import { apiFetch, safeParseJson } from '../../../lib/apiClient';
import { NebulaOrb } from '../../friday/components/NebulaOrb';

function extractErrorMessage(payload, fallback) {
  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    return payload.errors.map((e) => e.message).join('. ');
  }
  return payload?.message || fallback;
}

export function Login({ onLoginSuccess }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuthStore();

  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const from = location.state?.from;
  const destination =
    from?.pathname && from.pathname !== '/login' && from.pathname !== '/'
      ? `${from.pathname}${from.search || ''}`
      : '/friday';

  const handleGoogleAuth = () => {
    setError('Google OAuth is not configured yet. Please sign in or create an account with email and password.');
    setSuccessMsg('');
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');
    setSuccessMsg('');

    const endpoint = mode === 'login' ? '/v1/auth/login' : '/v1/auth/register';
    const payload =
      mode === 'login'
        ? { email: email.trim(), password }
        : { email: email.trim(), password, name: name.trim() };

    try {
      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload),
        skipAuthRefresh: true
      });

      const data = await safeParseJson(res);
      if (!res.ok || !data?.data?.user) {
        setError(
          extractErrorMessage(
            data,
            mode === 'login'
              ? 'Authentication failed. Check your email and password.'
              : 'Account creation failed. Verify your details.'
          )
        );
        return;
      }

      if (onLoginSuccess) onLoginSuccess();
      setUser(data.data.user);
      navigate(destination, { replace: true });
    } catch {
      setError('Unable to reach authentication service. Please verify the API server is running.');
    } finally {
      setLoading(false);
    }
  };

  const fillDevCredentials = (type) => {
    if (!import.meta.env.DEV) return;
    setError('');
    if (type === 'admin') {
      setEmail('admin@friday-edith.internal');
      setPassword('AdminPassword2026!');
      setName('System Administrator');
    } else {
      setEmail('dev@friday-edith.internal');
      setPassword('DeveloperPassword2026!');
      setName('Lead Engineer');
    }
  };

  return (
    <div className="relative min-h-screen w-screen flex items-center justify-center nebula-canvas starfield text-slate-100 overflow-hidden px-4 py-8 select-none">
      {/* Dynamic Cosmic Gradient Aurora Lights in Background */}
      <div className="absolute top-1/6 left-1/4 w-[650px] h-[500px] rounded-full bg-gradient-to-tr from-purple-600/35 via-pink-600/30 to-indigo-600/20 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 w-[600px] h-[450px] rounded-full bg-gradient-to-tr from-cyan-500/25 via-blue-600/25 to-violet-600/20 blur-[140px] pointer-events-none" />

      {/* Main Glassmorphic Login/Signup Window */}
      <div className="relative z-10 w-full max-w-md frosted-glass-window rounded-3xl p-7 md:p-8 shadow-2xl">
        
        {/* Top Glowing 3D AI Orb */}
        <div className="flex flex-col items-center justify-center mb-5">
          <div className="mb-2 transform hover:scale-105 transition-transform duration-500">
            <NebulaOrb isStreaming={loading} size={90} />
          </div>
          <h1 className="text-2xl font-extrabold tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-purple-200 via-white to-pink-200 drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]">
            F . R . I . D . A . Y .
          </h1>
          <p className="mt-1 text-[11px] font-mono text-purple-300/80 uppercase tracking-widest text-center">
            Neural Intelligence Workspace Access
          </p>
        </div>

        {/* Mode Toggle Tabs (Sign In / Sign Up) */}
        <div className="grid grid-cols-2 p-1 mb-6 rounded-xl bg-white/[0.04] border border-white/10 text-xs font-semibold">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'login'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(''); setSuccessMsg(''); }}
            className={`py-2 rounded-lg transition-all cursor-pointer ${
              mode === 'signup'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Google Authentication Button (Planned OAuth Integration) */}
        <button
          type="button"
          onClick={handleGoogleAuth}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-xl frosted-glass-card opacity-75 hover:opacity-100 hover:bg-white/[0.08] text-xs font-semibold text-slate-200 transition-all mb-5 cursor-pointer border border-white/15"
        >
          {/* Official Google Multicolored Icon */}
          <svg className="w-4 h-4" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          <span>Continue with Google (OAuth Pending)</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-[1px] bg-white/10" />
          <span className="text-[10px] uppercase font-mono text-slate-400">or with credentials</span>
          <div className="flex-1 h-[1px] bg-white/10" />
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">
          {mode === 'signup' && (
            <div>
              <label className="block text-[11px] font-mono text-purple-300/80 mb-1 uppercase tracking-wider">
                Full Name / Alias
              </label>
              <div className="relative flex items-center">
                <User className="absolute left-3.5 w-4 h-4 text-purple-400/60" />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tony Stark"
                  className="w-full bg-black/40 border border-white/10 focus:border-purple-400 focus:shadow-purple-500/20 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-[11px] font-mono text-purple-300/80 mb-1 uppercase tracking-wider">
              Operator Email
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-purple-400/60" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@stark.corp"
                className="w-full bg-black/40 border border-white/10 focus:border-purple-400 focus:shadow-purple-500/20 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-mono text-purple-300/80 mb-1 uppercase tracking-wider">
              Security Key / Password
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-purple-400/60" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-black/40 border border-white/10 focus:border-purple-400 focus:shadow-purple-500/20 rounded-xl pl-10 pr-4 py-2.5 text-xs md:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-3 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold text-xs md:text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-600/35 border border-white/20 transition-all cursor-pointer disabled:opacity-50"
          >
            <span>
              {loading
                ? 'Authenticating Core...'
                : mode === 'login'
                ? 'Authorize Neural Access'
                : 'Initialize Operator Account'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Credentials Fill Buttons (Development Only) */}
        {import.meta.env.DEV && (
          <div className="mt-5 pt-4 border-t border-white/10 text-center">
            <p className="text-[10px] font-mono text-slate-400 mb-2 uppercase tracking-wider">
              Dev Quick Fill (Local Seeded Accounts)
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => fillDevCredentials('dev')}
                className="px-3 py-1 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 border border-purple-400/30 text-[11px] font-mono text-purple-300 transition-all cursor-pointer"
              >
                Developer
              </button>
              <button
                type="button"
                onClick={() => fillDevCredentials('admin')}
                className="px-3 py-1 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-400/30 text-[11px] font-mono text-pink-300 transition-all cursor-pointer"
              >
                Administrator
              </button>
            </div>
          </div>
        )}

        {/* Security Baseline Footer */}
        <div className="mt-4 flex items-center justify-center gap-5 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5 text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Argon2id Encrypted</span>
          </div>
          <div className="flex items-center gap-1.5 text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-purple-400" />
            <span>Zero-Trust Sandbox</span>
          </div>
        </div>
      </div>
    </div>
  );
}
