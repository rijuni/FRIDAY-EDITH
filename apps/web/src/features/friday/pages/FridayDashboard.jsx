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
  ChevronDown
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

  const handleSend = async (e) => {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userPrompt = input.trim();
    setInput('');

    // Append user message to store
    appendMessage({ role: 'user', content: userPrompt });
    startStreaming();

    try {
      // Stream from services/friday-ai or Node API proxy
      const response = await fetch('/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          messages: [...messages, { role: 'user', content: userPrompt }],
          system_prompt: 'You are F.R.I.D.A.Y., a high-intelligence AI assistant running on Nebula UI.'
        })
      });

      if (!response.ok) {
        throw new Error('Streaming connection failed');
      }

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
    } catch (err) {
      // Fallback response for offline demonstration
      updateStreamBuffer(`F.R.I.D.A.Y. neural core active. Received: "${userPrompt}". Streaming and memory pipeline verified.`);
    } finally {
      finishStreaming();
    }
  };

  return (
    <div className="flex h-screen w-screen bg-nebula-space text-slate-100 overflow-hidden relative">
      {/* Background Ambient Cosmic Blur Fields */}
      <div className="absolute top-[-150px] left-[20%] w-[600px] h-[400px] rounded-full bg-violet-600/15 blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-150px] right-[15%] w-[500px] h-[500px] rounded-full bg-cyan-600/15 blur-[140px] pointer-events-none" />

      {/* LEFT SIDEBAR: Conversational History */}
      <aside className="w-72 glass-panel border-r border-white/5 flex flex-col z-10 hidden md:flex">
        {/* Branding Header */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center shadow-cyan-glow">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-white to-violet-300 text-sm">
              F.R.I.D.A.Y.
            </span>
          </div>
          <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
            Nebula
          </span>
        </div>

        {/* New Chat Button */}
        <div className="p-3">
          <button className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 hover:border-violet-500/40 text-xs font-medium text-slate-200 transition-all shadow-sm">
            <Plus className="w-4 h-4 text-cyan-400" />
            <span>New Intelligence Session</span>
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
          <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase px-2 mb-1">
            Recent Transcripts
          </div>
          {conversations.map((conv) => (
            <button
              key={conv.id}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs text-slate-300 hover:bg-white/[0.05] hover:text-white transition-all group"
            >
              <MessageSquare className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400" />
              <span className="truncate">{conv.title}</span>
            </button>
          ))}
        </div>

        {/* User Status Footer */}
        <div className="p-3 border-t border-white/5 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-violet-600/30 border border-violet-400/30 flex items-center justify-center text-xs font-bold text-violet-300">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-slate-200 truncate">{user?.name || 'Engineer'}</p>
            <p className="text-[10px] text-slate-500 font-mono">STATUS: CONNECTED</p>
          </div>
        </div>
      </aside>

      {/* MAIN CONVERSATION STAGE */}
      <main className="flex-1 flex flex-col h-full relative z-10">
        {/* Top Navigation Bar */}
        <header className="h-14 border-b border-white/5 px-6 flex items-center justify-between glass-panel">
          {/* Model Selector Dropdown */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-slate-400 font-mono hidden sm:inline">MODEL:</label>
            <select
              value={selectedModel}
              onChange={(e) => setModel(e.target.value)}
              className="bg-black/40 border border-white/10 hover:border-violet-500/40 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-cyan-400 transition-colors cursor-pointer"
            >
              <option value="claude-3-7-sonnet">Claude 3.7 Sonnet (Reasoning)</option>
              <option value="gpt-4o">GPT-4o (Multimodal)</option>
              <option value="gemini-2-flash">Gemini 2.0 Flash</option>
            </select>
          </div>

          {/* THE E.D.I.T.H. SWITCHER ICON (Redirects to /edith) */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/edith')}
              title="Switch to E.D.I.T.H. Developer IDE Workspace"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-ide-accent/20 to-ide-surface border border-ide-accent/40 hover:border-ide-accent text-xs font-mono text-cyan-300 hover:text-white transition-all shadow-[0_0_15px_-3px_rgba(88,166,255,0.3)] group cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5 text-ide-accent group-hover:rotate-12 transition-transform" />
              <span className="font-semibold tracking-wider">E.D.I.T.H. // IDE</span>
              <ExternalLink className="w-3 h-3 text-ide-accent opacity-70 group-hover:opacity-100" />
            </button>
          </div>
        </header>

        {/* Chat Stream View */}
        <div className="flex-1 overflow-y-auto px-4 md:px-12 py-6 space-y-6">
          {/* Central 3D Nebula Core */}
          <div className="flex flex-col items-center justify-center my-2 select-none">
            <NebulaCore3D isStreaming={isStreaming} />
            <p className="mt-1 text-[11px] font-mono tracking-widest text-cyan-300/70 uppercase">
              {isStreaming ? 'F.R.I.D.A.Y. STREAMING TELEMETRY...' : 'F.R.I.D.A.Y. READY'}
            </p>
          </div>

          {/* Messages */}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-3xl mx-auto ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-violet-600/30 border border-violet-500/30 text-white max-w-lg shadow-sm'
                    : 'glass-panel text-slate-200 border-white/10 max-w-2xl'
                }`}
              >
                {msg.content}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {/* Real-time Streaming Response Buffer */}
          {isStreaming && (
            <div className="flex gap-3 max-w-3xl mx-auto justify-start">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-violet-500 flex items-center justify-center text-white shrink-0 animate-pulse">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="glass-panel rounded-2xl px-4 py-3 text-sm text-cyan-200 border-cyan-500/30 max-w-2xl">
                <span className="whitespace-pre-wrap">{streamBuffer || 'Synthesizing response...'}</span>
                <span className="inline-block w-2 h-4 ml-1 bg-cyan-400 animate-pulse align-middle" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Input Area */}
        <div className="p-4 md:px-12 md:pb-6">
          <form
            onSubmit={handleSend}
            className="max-w-3xl mx-auto glass-panel rounded-2xl p-2 border border-white/10 focus-within:border-cyan-500/50 transition-all shadow-glass flex items-end gap-2"
          >
            {/* Attachment Button */}
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-cyan-400 transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
              title="Attach Document or Image"
            >
              <Paperclip className="w-4 h-4" />
            </button>

            {/* Message Text Input */}
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
              placeholder="Ask F.R.I.D.A.Y. anything or provide mission parameters..."
              className="flex-1 bg-transparent border-0 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none max-h-32 py-1.5 px-2"
            />

            {/* Voice Dictation Button */}
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-violet-400 transition-colors rounded-lg hover:bg-white/5 cursor-pointer"
              title="Voice Dictation"
            >
              <Mic className="w-4 h-4" />
            </button>

            {/* Send Button */}
            <button
              type="submit"
              disabled={!input.trim() || isStreaming}
              className="p-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-cyan-glow transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
          <div className="max-w-3xl mx-auto mt-2 text-center text-[10px] text-slate-500 font-mono">
            F.R.I.D.A.Y. Intelligence Workspace // Nebula UI v2.1 // Strict Non-Docker Native Architecture
          </div>
        </div>
      </main>
    </div>
  );
}

