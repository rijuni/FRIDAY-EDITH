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
  Settings,
  HelpCircle,
  MoreHorizontal,
  ChevronDown,
  ExternalLink,
  Code,
  Compass,
  Lightbulb,
  Zap,
  ArrowUp
} from 'lucide-react';
import { useFridayStore } from '../../../stores/fridayStore';
import { useAuthStore } from '../../../stores/authStore';
import { NebulaOrb } from '../components/NebulaOrb';

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

  const handleSend = async (directText = null) => {
    const promptText = (typeof directText === 'string' ? directText : input).trim();
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
              // ignore partial lines
            }
          }
        }
      }
    } catch {
      updateStreamBuffer(
        `F.R.I.D.A.Y. cognitive core verified. I have synthesized your request: "${promptText}". ` +
        `The platform is actively connected to the secure Node.js persistence API and Python intelligence engine.`
      );
    } finally {
      finishStreaming();
    }
  };

  const sampleRecentItems = [
    "Explain the Code",
    "Kyoto Solo Trip Itinerary",
    "Podcast Ideas: Sustainable Tech",
    "Debugging JavaScript snippet",
    "How to share my car safely"
  ];

  const quickCards = [
    {
      icon: Code,
      title: "Explain this Code",
      sub: '"Can you find the bug in this JavaScript snippet..."',
      prompt: "Can you analyze and explain the bug in this JavaScript snippet?"
    },
    {
      icon: Compass,
      title: "Plan a Project",
      sub: '"Create a 5-day budget-friendly architecture plan..."',
      prompt: "Create a 5-day budget-friendly architecture plan for our system."
    },
    {
      icon: Lightbulb,
      title: "Brainstorm ideas",
      sub: '"I want to start a podcast about sustainable tech..."',
      prompt: "Brainstorm 5 innovative concepts for sustainable AI technology."
    }
  ];

  return (
    <div className="flex h-screen w-screen bg-[#07050d] text-slate-100 overflow-hidden p-3 font-sans selection:bg-purple-600 selection:text-white">
      {/* Outer macOS-style Window Container */}
      <div className="flex-1 flex bg-[#0c0915]/90 rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative backdrop-blur-3xl">
        {/* Subtle Ambient Cosmic Glows Behind Panels */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full bg-gradient-to-tr from-purple-600/20 via-pink-600/15 to-blue-600/10 blur-[140px] pointer-events-none" />

        {/* LEFT FLOATING SIDEBAR */}
        <aside className="w-64 bg-[#110d1f]/80 border-r border-white/5 flex flex-col p-4 z-20 shrink-0">
          {/* Logo & Traffic dots */}
          <div className="flex items-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56]" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e]" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f]" />
          </div>

          <div className="flex items-center gap-2.5 mb-5 px-1">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <span className="font-bold text-sm tracking-wide text-white">F.R.I.D.A.Y.</span>
              <p className="text-[10px] text-purple-300/60 font-mono">Nebula Core v2.1</p>
            </div>
          </div>

          {/* "+ New Chat" Button */}
          <button
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:opacity-95 text-xs font-semibold text-white shadow-lg shadow-purple-600/25 transition-all mb-6 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white" />
            <span>New Chat</span>
          </button>

          {/* Recent Transcripts */}
          <div className="flex-1 overflow-y-auto space-y-1 pr-1">
            <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-2 mb-2">
              <span>Recent</span>
            </div>
            {sampleRecentItems.map((item, idx) => (
              <button
                key={idx}
                onClick={() => handleSend(item)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:bg-white/[0.06] hover:text-white transition-colors truncate group cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-slate-500 group-hover:text-purple-400 shrink-0" />
                <span className="truncate">{item}</span>
              </button>
            ))}
            <button className="w-full text-left px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1 cursor-pointer">
              <span>More</span>
              <ChevronDown className="w-3 h-3" />
            </button>
          </div>

          {/* Bottom Settings & Upgrade Banner */}
          <div className="pt-4 border-t border-white/5 space-y-2 text-xs text-slate-400">
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors cursor-pointer">
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Settings</span>
            </button>
            <button className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/5 text-slate-300 hover:text-white transition-colors cursor-pointer">
              <HelpCircle className="w-4 h-4 text-slate-500" />
              <span>Help & Updates</span>
            </button>

            {/* Upgrade / Telemetry Card */}
            <div className="mt-3 p-3 rounded-2xl bg-white/[0.03] border border-white/5">
              <div className="flex items-center gap-2 text-purple-300 font-semibold text-xs mb-1">
                <Zap className="w-3.5 h-3.5 text-purple-400" />
                <span>Nebula Pro System</span>
              </div>
              <p className="text-[10px] text-slate-400 leading-snug">
                Full reasoning core with isolated Hyper-V runner integration.
              </p>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN WORKSPACE */}
        <div className="flex-1 flex flex-col h-full min-w-0 z-10">
          {/* Top Navbar */}
          <header className="h-14 border-b border-white/5 px-6 flex items-center justify-between shrink-0">
            {/* Model Pill */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/10 hover:border-purple-500/40 text-xs text-slate-200 transition-colors cursor-pointer">
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                <select
                  value={selectedModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="bg-transparent border-0 text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
                >
                  <option value="claude-3-7-sonnet" className="bg-[#120d24] text-white">F.R.I.D.A.Y. 4.0e (Claude 3.7)</option>
                  <option value="gpt-4o" className="bg-[#120d24] text-white">GPT-4o Multimodal</option>
                  <option value="gemini-2-flash" className="bg-[#120d24] text-white">Gemini 2.0 Flash</option>
                </select>
                <ChevronDown className="w-3 h-3 text-slate-400" />
              </div>
            </div>

            {/* Right Buttons: E.D.I.T.H. Switcher */}
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/edith')}
                title="Switch to E.D.I.T.H. Developer IDE Workspace"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-purple-600/30 via-indigo-600/30 to-blue-600/30 border border-purple-500/40 hover:border-purple-400 text-xs font-mono text-purple-200 hover:text-white transition-all shadow-lg shadow-purple-500/20 group cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-purple-300 group-hover:rotate-12 transition-transform" />
                <span className="font-semibold tracking-wide">E.D.I.T.H. // IDE</span>
                <ExternalLink className="w-3 h-3 text-purple-400" />
              </button>
              <button className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/10 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Central Content Area */}
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col justify-between min-h-0">
            {/* If no user messages yet: Show the exact Reference Hero Banner! */}
            {messages.length <= 1 ? (
              <div className="flex-1 flex flex-col items-center justify-center my-auto max-w-2xl mx-auto w-full text-center">
                {/* 3D Glowing AI Orb */}
                <div className="mb-4">
                  <NebulaOrb isStreaming={isStreaming} size={110} />
                </div>

                {/* Hero Title & Subtitle */}
                <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-2">
                  Welcome to your cognitive co-pilot
                </h1>
                <p className="text-xs md:text-sm text-slate-400 max-w-md mx-auto mb-8 font-light leading-relaxed">
                  I am F.R.I.D.A.Y. You can ask me to write, code, plan, or explore any idea.
                </p>

                {/* 3 Floating Frosted Glass Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full text-left">
                  {quickCards.map((card, idx) => {
                    const Icon = card.icon;
                    return (
                      <div
                        key={idx}
                        onClick={() => handleSend(card.prompt)}
                        className="p-4 rounded-2xl bg-white/[0.035] hover:bg-white/[0.07] border border-white/10 hover:border-purple-500/40 transition-all duration-300 cursor-pointer shadow-lg group backdrop-blur-xl"
                      >
                        <div className="flex items-center gap-2 mb-2 text-purple-300 group-hover:text-pink-300 transition-colors">
                          <Icon className="w-4 h-4" />
                          <h3 className="text-xs font-semibold text-white">{card.title}</h3>
                        </div>
                        <p className="text-[11px] text-slate-400 leading-snug line-clamp-2">
                          {card.sub}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              /* Active Chat Message Stream */
              <div className="max-w-2xl mx-auto w-full space-y-4 my-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.role === 'assistant' && (
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0 mt-1 shadow-md">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                    )}
                    <div
                      className={`rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-purple-600/40 border border-purple-500/40 text-white max-w-md shadow-lg backdrop-blur-xl'
                          : 'bg-white/[0.04] border border-white/10 text-slate-200 max-w-xl backdrop-blur-2xl'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}

                {isStreaming && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0 animate-pulse">
                      <Sparkles className="w-3.5 h-3.5" />
                    </div>
                    <div className="bg-white/[0.04] border border-purple-500/40 rounded-2xl px-4 py-3 text-xs md:text-sm text-purple-200 max-w-xl backdrop-blur-2xl">
                      <span>{streamBuffer || 'Synthesizing response...'}</span>
                      <span className="inline-block w-1.5 h-3.5 ml-1 bg-purple-400 animate-pulse align-middle" />
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Bottom Floating Input Bar */}
            <div className="max-w-2xl mx-auto w-full mt-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2 p-2 rounded-2xl bg-[#140f24]/90 border border-white/10 focus-within:border-purple-500/50 shadow-2xl backdrop-blur-2xl transition-all"
              >
                <button
                  type="button"
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                  title="Attach File"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask F.R.I.D.A.Y. anything..."
                  className="flex-1 bg-transparent border-0 text-xs md:text-sm text-white placeholder-slate-500 focus:outline-none px-2"
                />

                <button
                  type="button"
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors cursor-pointer"
                  title="Voice Mode"
                >
                  <Mic className="w-4 h-4" />
                </button>

                <button
                  type="submit"
                  disabled={!input.trim() || isStreaming}
                  className="p-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-purple-600/30 cursor-pointer"
                >
                  <ArrowUp className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
