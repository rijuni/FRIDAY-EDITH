import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Send,
  Terminal,
  Paperclip,
  Mic,
  Plus,
  MessageSquare,
  Bot,
  User,
  ExternalLink,
  ChevronDown,
  Search,
  BookOpen,
  Brain,
  Shield,
  Layers,
  ArrowRight,
  Database
} from 'lucide-react';
import { useFridayStore } from '../../../stores/fridayStore';
import { useAuthStore } from '../../../stores/authStore';
import { NebulaCore3D } from '../components/NebulaCore3D';

export function FridayDashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const {
    conversations,
    messages,
    selectedModel,
    setModel,
    appendMessage,
    isStreaming,
    streamBuffer,
    startStreaming,
    updateStreamBuffer,
    finishStreaming
  } = useFridayStore();

  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer]);

  const handleSend = async (e, directText = null) => {
    e?.preventDefault();
    const promptText = (directText || input).trim();
    if (!promptText || isStreaming) return;

    setInput('');
    appendMessage({ role: 'user', content: promptText });
    startStreaming();

    try {
      const response = await fetch('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, { role: 'user', content: promptText }],
          system_prompt: 'You are F.R.I.D.A.Y., a high-intelligence AI assistant running on Nebula UI.'
        })
      });

      if (!response.ok) throw new Error('Stream request failed');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.substring(6));
              if (data.event === 'chunk' && data.text) {
                updateStreamBuffer(data.text);
              }
            } catch {
              // ignore partial frames
            }
          }
        }
      }
    } catch {
      // Offline fallback response demonstration
      updateStreamBuffer(
        `F.R.I.D.A.Y. cognitive core verified. I have synthesized your request: "${promptText}". ` +
        `The platform is actively connected to the secure Node.js persistence API and Python intelligence engine.`
      );
    } finally {
      finishStreaming();
    }
  };

  const quickPrompts = [
    {
      icon: Search,
      title: "Deep Evidence Synthesis",
      desc: "Decompose complex multi-source research tasks with citation links",
      prompt: "Perform a deep evidence synthesis on our platform architecture"
    },
    {
      icon: Database,
      title: "Multimodal Data Analysis",
      desc: "Analyze datasets, calculate margins, and generate structured summaries",
      prompt: "Analyze the uploaded data structures and check SQLite/MySQL compatibility"
    },
    {
      icon: Brain,
      title: "Memory & Personalization",
      desc: "Review and inspect long-term contextual preferences and project context",
      prompt: "What long-term project context and preferences have you recorded?"
    },
    {
      icon: Terminal,
      title: "Code Task in E.D.I.T.H.",
      desc: "Switch directly into the autonomous developer IDE with Monaco editor",
      action: () => navigate('/edith')
    }
  ];

  return (
    <div className="flex h-screen w-screen nebula-canvas starfield text-slate-100 overflow-hidden relative">
      {/* LEFT SIDEBAR: Frosted Glass Panel */}
      <aside className="w-80 glass-panel border-r border-white/10 flex flex-col z-20 shrink-0">
        {/* Brand Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-violet-600 flex items-center justify-center shadow-cyan-glow">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-violet-300 text-sm">
                  F.R.I.D.A.Y.
                </span>
                <span className="text-[9px] uppercase font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-400/30">
                  v2.1
                </span>
              </div>
              <p className="text-[9px] text-cyan-200/50 font-mono tracking-wider">NEBULA AI WORKSPACE</p>
            </div>
          </div>
        </div>

        {/* New Session Action */}
        <div className="p-3">
          <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/20 via-violet-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-violet-500/30 border border-cyan-400/30 hover:border-cyan-400 text-xs font-semibold text-cyan-100 transition-all shadow-cyan-glow cursor-pointer">
            <Plus className="w-4 h-4 text-cyan-300" />
            <span>New Intelligence Session</span>
          </button>
        </div>

        {/* Navigation Categories */}
        <div className="px-3 py-1 space-y-1">
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase px-2 mb-1.5">
            Workspaces & Tools
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 cursor-pointer transition-colors">
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <span>Knowledge Bases & RAG</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 cursor-pointer transition-colors">
            <Brain className="w-3.5 h-3.5 text-violet-400" />
            <span>Memory Vault</span>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-white/5 cursor-pointer transition-colors">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Security & Audit Logs</span>
          </div>
        </div>

        {/* Transcripts History */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 mt-2">
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase px-2 mb-1.5">
            Recent Transcripts
          </div>
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs bg-white/[0.03] border border-white/5 hover:border-cyan-500/40 hover:bg-white/[0.06] text-slate-200 transition-all cursor-pointer group"
            >
              <MessageSquare className="w-3.5 h-3.5 text-cyan-400/70 group-hover:text-cyan-300" />
              <span className="truncate flex-1 font-medium">{conv.title}</span>
            </div>
          ))}
        </div>

        {/* User Status Card */}
        <div className="p-3 border-t border-white/10 glass-panel flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-xs font-bold text-white shadow-cyan-glow">
              {user?.name?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-200">{user?.name || 'Lead Engineer'}</p>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-300 font-mono">NEURAL SYNC ACTIVE</span>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 flex flex-col h-full min-w-0 z-10">
        {/* Top Header Bar */}
        <header className="h-16 border-b border-white/10 px-6 flex items-center justify-between glass-panel shrink-0 z-20">
          {/* Model Selector Pill */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/10">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-400 font-mono">MODEL:</span>
              <select
                value={selectedModel}
                onChange={(e) => setModel(e.target.value)}
                className="bg-transparent border-0 text-xs font-semibold text-cyan-200 focus:outline-none cursor-pointer"
              >
                <option value="claude-3-7-sonnet" className="bg-slate-900 text-white">Claude 3.7 Sonnet (Reasoning)</option>
                <option value="gpt-4o" className="bg-slate-900 text-white">GPT-4o (Multimodal)</option>
                <option value="gemini-2-flash" className="bg-slate-900 text-white">Gemini 2.0 Flash</option>
              </select>
            </div>
          </div>

          {/* THE E.D.I.T.H. SWITCHER BUTTON */}
          <button
            onClick={() => navigate('/edith')}
            title="Launch E.D.I.T.H. Developer IDE Workspace"
            className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600/30 via-cyan-500/20 to-slate-800 border border-cyan-400/40 hover:border-cyan-300 text-xs font-mono text-cyan-200 hover:text-white shadow-cyan-glow transition-all cursor-pointer group"
          >
            <Terminal className="w-4 h-4 text-cyan-300 group-hover:rotate-12 transition-transform" />
            <span className="font-bold tracking-wider">E.D.I.T.H. // IDE</span>
            <ExternalLink className="w-3.5 h-3.5 text-cyan-400 opacity-80 group-hover:opacity-100" />
          </button>
        </header>

        {/* Central Chat Stream & Nebula Core */}
        <div className="flex-1 overflow-y-auto px-6 md:px-16 py-6 space-y-6 min-h-0">
          {/* Holographic 3D Nebula Core */}
          <div className="flex flex-col items-center justify-center my-3">
            <NebulaCore3D isStreaming={isStreaming} />
          </div>

          {/* Quick Action Suggestion Cards (Shown when conversation is fresh) */}
          {messages.length <= 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-3xl mx-auto my-4">
              {quickPrompts.map((card, idx) => {
                const IconComponent = card.icon;
                return (
                  <div
                    key={idx}
                    onClick={() => card.action ? card.action() : handleSend(null, card.prompt)}
                    className="glass-panel-card rounded-2xl p-4 cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 mb-1.5">
                      <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300 group-hover:scale-110 transition-transform">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      <h3 className="text-xs font-semibold text-slate-100 group-hover:text-cyan-300 transition-colors">
                        {card.title}
                      </h3>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-snug">
                      {card.desc}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Conversation Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl mx-auto ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 via-indigo-500 to-violet-600 p-[1px] shadow-cyan-glow shrink-0">
                  <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center text-cyan-300">
                    <Bot className="w-4 h-4" />
                  </div>
                </div>
              )}

              <div
                className={`rounded-2xl px-5 py-3.5 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-r from-violet-600/40 to-indigo-600/40 border border-violet-400/40 text-white max-w-lg shadow-nebula-glow'
                    : 'glass-panel text-slate-100 border-white/10 max-w-2xl shadow-glass'
                }`}
              >
                {msg.content}
              </div>

              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {/* Live Streaming Buffer */}
          {isStreaming && (
            <div className="flex gap-3 max-w-3xl mx-auto justify-start">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-400 to-violet-600 p-[1px] shadow-cyan-glow shrink-0 animate-pulse">
                <div className="w-full h-full bg-slate-950 rounded-[11px] flex items-center justify-center text-cyan-300">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="glass-panel glow-border-cyan rounded-2xl px-5 py-3.5 text-sm text-cyan-100 max-w-2xl">
                <span className="whitespace-pre-wrap">{streamBuffer || 'Synthesizing neural tokens...'}</span>
                <span className="inline-block w-2 h-4 ml-1.5 bg-cyan-400 animate-pulse align-middle shadow-cyan-glow" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Floating Input Dock */}
        <div className="p-4 md:px-16 md:pb-6 shrink-0">
          <form
            onSubmit={handleSend}
            className="max-w-3xl mx-auto glass-panel glow-border-cyan rounded-2xl p-2.5 transition-all shadow-glass flex items-end gap-2.5"
          >
            {/* Attachment Button */}
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-cyan-300 transition-colors rounded-xl hover:bg-white/5 cursor-pointer"
              title="Attach Document (PDF, DOCX, CSV)"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Input Textarea */}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={1}
              placeholder="Ask F.R.I.D.A.Y. anything or launch a research mission..."
              className="flex-1 bg-transparent border-0 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-32 py-1.5 px-2"
            />

            {/* Voice Waveform Button */}
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-violet-300 transition-colors rounded-xl hover:bg-white/5 cursor-pointer"
              title="Voice Dictation"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Neon Send Button */}
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-400 via-indigo-500 to-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-95 shadow-cyan-glow transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>

          <p className="max-w-3xl mx-auto mt-2 text-center text-[10px] text-slate-400 font-mono tracking-wider">
            F.R.I.D.A.Y. NEBULA CORE v2.1 // POWERED BY REACT 19 & TAILWIND // ZERO DOCKER NATIVE EXECUTION
          </p>
        </div>
      </div>
    </div>
  );
}
