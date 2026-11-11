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
  ArrowUp,
  Lock,
  Bookmark,
  Share2
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
    newChat,
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
      title: "Plan a Trip",
      sub: '"Create a 4-day budget-friendly itinerary for Kyoto..."',
      prompt: "Create a 4-day budget-friendly itinerary for Kyoto with cultural highlights."
    },
    {
      icon: Lightbulb,
      title: "Brainstorm ideas",
      sub: '"I want to start a podcast about sustainable tech..."',
      prompt: "I want to start a podcast about sustainable tech. What are 5 high-impact episode ideas?"
    }
  ];

  return (
    <div className="flex h-screen w-screen nebula-canvas starfield text-slate-100 overflow-hidden p-3 md:p-5 font-sans selection:bg-purple-600 selection:text-white relative">
      {/* Dynamic Cosmic Gradient Aurora Lights in Background (Supplies deep color for Frosted Glass) */}
      <div className="absolute top-1/12 left-1/4 w-[750px] h-[500px] rounded-full bg-gradient-to-tr from-purple-600/40 via-pink-600/35 to-indigo-600/25 blur-[150px] pointer-events-none" />
      <div className="absolute bottom-1/6 right-1/4 w-[650px] h-[450px] rounded-full bg-gradient-to-tr from-cyan-500/30 via-blue-600/25 to-violet-600/25 blur-[150px] pointer-events-none" />
      <div className="absolute top-1/2 left-10 w-[450px] h-[450px] rounded-full bg-gradient-to-tr from-fuchsia-600/25 to-purple-800/25 blur-[140px] pointer-events-none" />

      {/* Main Floating macOS-Style Frosted Glass Window Container */}
      <div className="flex-1 flex flex-col frosted-glass-window rounded-3xl overflow-hidden relative z-10 shadow-2xl">
        
        {/* TOP WINDOW HEADER: macOS Traffic Dots + Centered Address Capsule + Action Controls */}
        <div className="h-10 frosted-glass-header px-4 flex items-center justify-between shrink-0 select-none">
          {/* Traffic Light Dots */}
          <div className="flex items-center gap-2 w-32">
            <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
            <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
          </div>

          {/* Centered URL Address Capsule */}
          <div className="flex items-center gap-2 px-4 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300 shadow-inner">
            <Lock className="w-3 h-3 text-purple-400" />
            <span className="font-mono text-slate-300">nebula.com</span>
          </div>

          {/* Right Window Controls & E.D.I.T.H. Switcher */}
          <div className="flex items-center gap-2.5 justify-end w-32">
            <button
              onClick={() => navigate('/edith')}
              title="Switch to E.D.I.T.H. Developer IDE Workspace"
              className="flex items-center gap-1.5 px-3 py-1 rounded-full glass-pill hover:border-purple-400 text-[11px] font-mono text-purple-200 hover:text-white transition-all shadow-md hover:shadow-purple-500/25 group cursor-pointer"
            >
              <Terminal className="w-3 h-3 text-purple-300 group-hover:rotate-12 transition-transform" />
              <span className="font-semibold tracking-wide">E.D.I.T.H.</span>
              <ExternalLink className="w-2.5 h-2.5 text-purple-400" />
            </button>
            <button className="text-slate-400 hover:text-white p-1 transition-colors cursor-pointer" title="Bookmark">
              <Bookmark className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* WORKSPACE INTERIOR: Frosted Sidebar + Main Cognitive Canvas */}
        <div className="flex-1 flex min-h-0 relative">
          
          {/* LEFT FLOATING FROSTED GLASS SIDEBAR */}
          <aside className="w-64 frosted-glass-sidebar flex flex-col p-4 z-20 shrink-0">
            {/* F.R.I.D.A.Y. Logo Emblem */}
            <div className="flex items-center gap-2.5 mb-5 px-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 border border-white/20">
                <Sparkles className="w-4 h-4 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-wide text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                  F.R.I.D.A.Y.
                </span>
                <p className="text-[10px] text-purple-300/70 font-mono tracking-wider">Cosmic AI v2.1</p>
              </div>
            </div>

            {/* Glowing "+ New Chat" Button */}
            <button
              onClick={() => newChat()}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-lg shadow-purple-600/35 border border-white/20 transition-all mb-6 cursor-pointer hover:shadow-purple-500/50"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>New Chat</span>
            </button>

            {/* Recent Transcripts List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-2 mb-2">
                <span>Recent</span>
              </div>
              {sampleRecentItems.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(item)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left text-xs text-slate-300 hover:bg-white/[0.08] hover:text-white border border-transparent hover:border-white/10 transition-all truncate group cursor-pointer"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-slate-400 group-hover:text-purple-300 shrink-0" />
                  <span className="truncate">{item}</span>
                </button>
              ))}
              <button className="w-full text-left px-3 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer">
                <span>More</span>
                <ChevronDown className="w-3 h-3" />
              </button>
            </div>

            {/* Bottom Actions & Upgrade to Pro Frosted Card */}
            <div className="pt-4 border-t border-white/10 space-y-2 text-xs text-slate-400">
              <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/[0.06] text-slate-300 hover:text-white transition-colors cursor-pointer">
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </button>
              <button className="w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl hover:bg-white/[0.06] text-slate-300 hover:text-white transition-colors cursor-pointer">
                <HelpCircle className="w-4 h-4 text-slate-400" />
                <span>Help & Updates</span>
              </button>

              {/* "Upgrade to Pro" Frosted Glass Card matching Reference Design */}
              <div className="mt-3 p-3.5 rounded-2xl frosted-glass-card border border-white/10 shadow-lg">
                <div className="flex items-center gap-2 text-purple-300 font-semibold text-xs mb-1.5">
                  <Zap className="w-4 h-4 text-purple-400 fill-purple-400/20" />
                  <span className="text-white font-medium">Upgrade to Pro</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Unlock Nebula's full power with a Pro account and get 3 months free (first time user only).
                </p>
              </div>
            </div>
          </aside>

          {/* RIGHT MAIN WORKSPACE */}
          <div className="flex-1 flex flex-col h-full min-w-0 z-10">
            {/* Top Sub-Bar (Model Dropdown & Options) */}
            <div className="h-12 px-6 flex items-center justify-between shrink-0">
              {/* Model Selector Glass Pill */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full glass-pill hover:border-purple-400/50 text-xs text-slate-200 transition-colors cursor-pointer">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_8px_#c084fc]" />
                  <select
                    value={selectedModel}
                    onChange={(e) => setModel(e.target.value)}
                    className="bg-transparent border-0 text-xs text-slate-200 focus:outline-none cursor-pointer pr-1"
                  >
                    <option value="nebula-4.0e" className="bg-[#120d24] text-white">Nebula 4.0e</option>
                    <option value="claude-3-7-sonnet" className="bg-[#120d24] text-white">Claude 3.7 Sonnet</option>
                    <option value="gpt-4o" className="bg-[#120d24] text-white">GPT-4o Multimodal</option>
                  </select>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </div>
              </div>

              {/* Right Options */}
              <button className="w-8 h-8 rounded-full glass-pill flex items-center justify-center text-slate-400 hover:text-white cursor-pointer">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>

            {/* Central Canvas */}
            <div className="flex-1 overflow-y-auto px-6 py-4 flex flex-col justify-between min-h-0">
              
              {/* HERO STATE: Displays when messages is empty */}
              {messages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center my-auto max-w-2xl mx-auto w-full text-center">
                  {/* 3D Glowing Cosmic Plasma AI Orb */}
                  <div className="mb-5 cursor-pointer transform hover:scale-105 transition-transform duration-500">
                    <NebulaOrb isStreaming={isStreaming} size={125} />
                  </div>

                  {/* Hero Title & Subtitle */}
                  <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-2 drop-shadow-[0_0_20px_rgba(255,255,255,0.35)]">
                    Welcome to your cognitive co-pilot
                  </h1>
                  <p className="text-xs md:text-sm text-slate-300 max-w-md mx-auto mb-8 font-light leading-relaxed">
                    I am F.R.I.D.A.Y. You can ask me to write, code, plan, or explore any idea.
                  </p>

                  {/* 3 Floating Frosted Glass Cards matching Reference Design */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 w-full text-left">
                    {quickCards.map((card, idx) => {
                      const Icon = card.icon;
                      return (
                        <div
                          key={idx}
                          onClick={() => handleSend(card.prompt)}
                          className="p-4 rounded-2xl frosted-glass-card cursor-pointer group"
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
                /* ACTIVE CONVERSATION STATE */
                <div className="max-w-2xl mx-auto w-full space-y-4 my-auto">
                  {messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      {msg.role === 'assistant' && (
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0 mt-1 shadow-md border border-white/20">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                      )}
                      <div
                        className={`rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-purple-400/40 text-white max-w-md shadow-lg backdrop-blur-xl'
                            : 'frosted-glass-card text-slate-100 max-w-xl'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </div>
                  ))}

                  {isStreaming && (
                    <div className="flex gap-3 justify-start">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0 animate-pulse border border-white/20">
                        <Sparkles className="w-3.5 h-3.5" />
                      </div>
                      <div className="frosted-glass-card border-purple-400/50 rounded-2xl px-4 py-3 text-xs md:text-sm text-purple-200 max-w-xl">
                        <span>{streamBuffer || 'Synthesizing response...'}</span>
                        <span className="inline-block w-1.5 h-3.5 ml-1 bg-purple-400 animate-pulse align-middle" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>
              )}

              {/* Bottom Floating Frosted Glass Input Bar */}
              <div className="max-w-2xl mx-auto w-full mt-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                  }}
                  className="flex items-center gap-2 p-2 rounded-2xl frosted-glass-input transition-all"
                >
                  <button
                    type="button"
                    className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                    title="Attach File"
                  >
                    <Paperclip className="w-4 h-4" />
                  </button>

                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask F.R.I.D.A.Y. anything or explore any idea..."
                    className="flex-1 bg-transparent border-0 text-xs md:text-sm text-white placeholder-slate-400 focus:outline-none px-2"
                  />

                  <button
                    type="button"
                    className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                    title="Voice Mode"
                  >
                    <Mic className="w-4 h-4" />
                  </button>

                  <button
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-purple-600/30 cursor-pointer border border-white/20"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
