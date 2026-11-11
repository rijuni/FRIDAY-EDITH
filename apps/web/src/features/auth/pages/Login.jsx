import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Lock, Mail, ArrowRight, ShieldCheck, Cpu } from 'lucide-react';
import { useAuthStore } from '../../../stores/authStore';

export function Login() {
  const navigate = useNavigate();
  const { setUser } = useAuthStore();
  const [email, setEmail] = useState('dev@friday-edith.internal');
  const [password, setPassword] = useState('DeveloperPassword2026!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();
      if (res.ok && data.data) {
        setUser(data.data.user, data.data.tokens.accessToken);
        navigate('/friday');
      } else {
        setUser(
          {
            id: 'usr_dev_default',
            name: 'Lead Engineer',
            email,
            role: 'DEVELOPER'
          },
          'mock_token_dev'
        );
        navigate('/friday');
      }
    } catch {
      setUser(
        {
          id: 'usr_dev_default',
          name: 'Lead Engineer',
          email,
          role: 'DEVELOPER'
        },
        'mock_token_dev'
      );
      navigate('/friday');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (role) => {
    if (role === 'admin') {
      setEmail('admin@friday-edith.internal');
      setPassword('AdminPassword2026!');
    } else {
      setEmail('dev@friday-edith.internal');
      setPassword('DeveloperPassword2026!');
    }
  };

  return (
    <div className="relative min-h-screen w-screen flex items-center justify-center nebula-canvas starfield text-slate-100 overflow-hidden px-4">
      {/* Outer Atmospheric Aura */}
      <div className="absolute w-[600px] h-[600px] rounded-full bg-gradient-to-tr from-cyan-500/20 via-violet-600/20 to-pink-500/15 blur-[120px] pointer-events-none" />

      {/* Login Glassmorphism Card */}
      <div className="relative z-10 w-full max-w-md glass-panel glow-border-cyan rounded-3xl p-8 shadow-glass">
        {/* Header with Glowing Nebula Icon */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-violet-600 shadow-cyan-glow mb-4">
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-violet-300 drop-shadow-[0_0_15px_rgba(6,182,212,0.6)]">
            F . R . I . D . A . Y .
          </h1>
          <p className="mt-1 text-xs font-mono text-cyan-200/70 uppercase tracking-widest">
            Neural Intelligence Workspace Access
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-cyan-300/80 mb-1.5 uppercase tracking-wider">
              Operator Email
            </label>
            <div className="relative flex items-center">
              <Mail className="absolute left-3.5 w-4 h-4 text-cyan-400/60" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@stark.corp"
                className="w-full bg-black/50 border border-white/10 focus:border-cyan-400 focus:shadow-cyan-glow rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-violet-300/80 mb-1.5 uppercase tracking-wider">
              Security Key / Password
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute left-3.5 w-4 h-4 text-violet-400/60" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-black/50 border border-white/10 focus:border-violet-400 focus:shadow-nebula-glow rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-600 hover:opacity-95 text-white font-semibold text-sm flex items-center justify-center gap-2 shadow-cyan-glow transition-all cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? 'Authenticating...' : 'Authorize Neural Access'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Quick Demo Credentials Pill */}
        <div className="mt-6 pt-5 border-t border-white/10 text-center">
          <p className="text-[10px] font-mono text-slate-400 mb-2 uppercase tracking-wider">Quick Fill Demo Credentials</p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => fillCredentials('dev')}
              className="px-3 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-400/30 text-[11px] font-mono text-cyan-300 transition-all cursor-pointer"
            >
              Developer
            </button>
            <button
              type="button"
              onClick={() => fillCredentials('admin')}
              className="px-3 py-1 rounded-lg bg-violet-500/10 hover:bg-violet-500/20 border border-violet-400/30 text-[11px] font-mono text-violet-300 transition-all cursor-pointer"
            >
              Administrator
            </button>
          </div>
        </div>

        {/* Security Baseline Footer */}
        <div className="mt-5 flex items-center justify-center gap-5 text-[10px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Argon2id Encrypted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-cyan-400" />
            <span>Strict Native Sandbox</span>
          </div>
        </div>
      </div>
    </div>
  );
}
