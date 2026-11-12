import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
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
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Trash2,
  Square,
  RotateCcw,
  AlertCircle,
  X,
  Loader2,
  FileText
} from 'lucide-react';
import { useFridayStore } from '../../../stores/fridayStore';
import { useAuthStore } from '../../../stores/authStore';
import { NebulaOrb } from '../components/NebulaOrb';
import { FridaySettingsModal } from '../components/FridaySettingsModal';
import { FridayHelpModal } from '../components/FridayHelpModal';

const MAX_ATTACHMENT_BYTES = 512 * 1024;
const EXTENSION_MIME_MAP = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json'
};

function resolveAttachmentMime(filename, rawType) {
  const dotIdx = filename.lastIndexOf('.');
  const ext = dotIdx >= 0 ? filename.slice(dotIdx).toLowerCase() : '';
  if (EXTENSION_MIME_MAP[ext]) return EXTENSION_MIME_MAP[ext];
  if (rawType && Object.values(EXTENSION_MIME_MAP).includes(rawType)) return rawType;
  return null;
}

export function FridayDashboard() {
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const {
    conversations,
    pagination,
    activeConversationId,
    messages,
    selectedModel,
    setModel,
    pendingAttachments,
    addPendingAttachment,
    removePendingAttachment,
    isLoadingConversations,
    isLoadingMessages,
    isStreaming,
    streamBuffer,
    isMockResponse,
    error,
    lastFailedPrompt,
    clearError,
    newChat,
    fetchConversations,
    selectConversation,
    deleteConversation,
    cancelStreaming,
    sendMessage,
    retryLastMessage
  } = useFridayStore();

  const [input, setInput] = useState('');
  const [featureNotice, setFeatureNotice] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamBuffer, isLoadingMessages]);

  const handleFileSelect = async (e) => {
    const selectedFiles = Array.from(e.target.files || []);
    e.target.value = '';
    if (selectedFiles.length === 0) return;

    setFeatureNotice(null);
    for (const file of selectedFiles) {
      const mimeType = resolveAttachmentMime(file.name, file.type);
      if (!mimeType) {
        setFeatureNotice(
          `Unsupported file "${file.name}". Allowed formats: .txt, .md, .csv, .json.`
        );
        continue;
      }

      if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
        setFeatureNotice(
          `"${file.name}" must be non-empty and under 512 KB for F.R.I.D.A.Y. chat ingestion.`
        );
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        if (bytes.includes(0)) {
          setFeatureNotice(`"${file.name}" appears to contain binary data and cannot be attached.`);
          continue;
        }
        const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        addPendingAttachment({
          tempId: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          filename: file.name,
          mimeType,
          sizeBytes: file.size,
          content
        });
      } catch {
        setFeatureNotice(`"${file.name}" is not valid UTF-8 text.`);
      }
    }
  };

  const handleSend = async (directText = null) => {
    const promptText = (typeof directText === 'string' ? directText : input).trim();
    if ((!promptText && pendingAttachments.length === 0) || isStreaming) return;

    if (typeof directText !== 'string') {
      setInput('');
    }
    setFeatureNotice(null);
    await sendMessage(promptText);
  };

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
    <div className="flex h-screen w-screen nebula-canvas starfield text-slate-100 overflow-hidden p-3 font-sans selection:bg-purple-600 selection:text-white relative">
      {/* Dynamic Cosmic Gradient Aurora Lights in Background */}
      <div className="absolute top-1/6 left-1/3 w-[650px] h-[450px] rounded-full bg-gradient-to-tr from-purple-600/35 via-pink-600/30 to-indigo-600/20 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[550px] h-[400px] rounded-full bg-gradient-to-tr from-cyan-500/25 via-blue-600/25 to-violet-600/20 blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-10 w-[400px] h-[400px] rounded-full bg-gradient-to-tr from-fuchsia-600/20 to-purple-800/20 blur-[120px] pointer-events-none" />

      {/* Outer macOS-style Glass Window Container */}
      <div className="flex-1 flex frosted-glass-window rounded-3xl overflow-hidden relative z-10">
        
        {/* LEFT FLOATING FROSTED GLASS SIDEBAR (Collapsible Hide In / Hide Out) */}
        <aside
          className={`frosted-glass-sidebar flex flex-col z-20 shrink-0 transition-all duration-300 ease-in-out ${
            sidebarOpen
              ? 'w-64 p-4 opacity-100 translate-x-0'
              : 'w-0 p-0 opacity-0 -translate-x-full border-r-0 pointer-events-none overflow-hidden'
          }`}
        >
          <div className="w-56 h-full flex flex-col">
            {/* Window Traffic Dots & Sidebar Collapse Toggle */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
                <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
                <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm hover:opacity-80 transition-opacity cursor-pointer" />
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                title="Hide Sidebar"
                className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>

            {/* F.R.I.D.A.Y. Brand Logo with Specular Ring */}
            <div className="flex items-center gap-2.5 mb-5 px-1">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 via-pink-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 border border-white/20">
                <Sparkles className="w-4 h-4 text-white drop-shadow-[0_0_6px_rgba(255,255,255,0.7)]" />
              </div>
              <div>
                <span className="font-extrabold text-sm tracking-wide text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]">
                  F.R.I.D.A.Y.
                </span>
                <p className="text-[10px] text-purple-300/70 font-mono tracking-wider">Nebula Core v2.1</p>
              </div>
            </div>

            {/* Glowing "+ New Chat" Button */}
            <button
              type="button"
              onClick={() => {
                newChat();
                setFeatureNotice(null);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-lg shadow-purple-600/30 border border-white/20 transition-all mb-6 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>New Chat</span>
            </button>

            {/* Recent Transcripts List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-2 mb-2">
                <span>Recent</span>
                {isLoadingConversations && (
                  <Loader2 className="w-3 h-3 text-purple-300 animate-spin" aria-label="Loading conversations" />
                )}
              </div>

              {conversations.length === 0 && !isLoadingConversations ? (
                <p className="px-3 py-2 text-[11px] text-slate-500 italic">
                  No saved conversations yet. Start a prompt below.
                </p>
              ) : (
                conversations.map((conv) => {
                  const isActive = conv.id === activeConversationId;
                  return (
                    <div
                      key={conv.id}
                      role="group"
                      className={`w-full flex items-center gap-1.5 rounded-xl border transition-all group ${
                        isActive
                          ? 'bg-purple-500/20 border-purple-400/40 text-white'
                          : 'border-transparent hover:bg-white/[0.08] hover:border-white/10 text-slate-300 hover:text-white'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFeatureNotice(null);
                          selectConversation(conv.id);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 text-left text-xs truncate cursor-pointer"
                      >
                        <MessageSquare
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-purple-300' : 'text-slate-400 group-hover:text-purple-300'
                          }`}
                        />
                        <span className="truncate">{conv.title || 'Untitled Conversation'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteConversation(conv.id)}
                        aria-label={`Delete ${conv.title || 'conversation'}`}
                        title="Delete conversation"
                        className="p-1.5 mr-1 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/15 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}

              {pagination?.hasMore && (
                <button
                  type="button"
                  disabled={isLoadingConversations}
                  onClick={() => fetchConversations({ append: true })}
                  className="w-full text-left px-3 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                >
                  <span>{isLoadingConversations ? 'Loading...' : 'Load more'}</span>
                  <ChevronDown className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Bottom Settings & Glass Telemetry Banner */}
            <div className="pt-4 border-t border-white/10 space-y-2 text-xs text-slate-400">
              <button
                type="button"
                onClick={() => {
                  setFeatureNotice(null);
                  setSettingsOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.06] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFeatureNotice(null);
                  setHelpOpen(true);
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-white/[0.06] text-slate-300 hover:text-white transition-colors cursor-pointer"
              >
                <HelpCircle className="w-4 h-4 text-slate-400" />
                <span>Help & Support</span>
              </button>
              <button
                onClick={async () => {
                  await logout();
                  navigate('/login', { replace: true });
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-red-500/15 text-slate-400 hover:text-red-300 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-slate-400 group-hover:text-red-400" />
                <span>Sign Out</span>
              </button>

              {/* Nebula Pro System Glass Card */}
              <div className="mt-3 p-3 rounded-2xl glass-pill border border-white/10 shadow-lg">
                <div className="flex items-center gap-2 text-purple-300 font-semibold text-xs mb-1">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>Nebula Pro System</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-snug">
                  Full reasoning core with isolated Hyper-V runner integration.
                </p>
              </div>
            </div>
          </div>
        </aside>

        {/* RIGHT MAIN WORKSPACE */}
        <div className="flex-1 flex flex-col h-full min-w-0 z-10">
          {/* Top Navbar */}
          <header className="h-14 border-b border-white/10 px-6 flex items-center justify-between shrink-0">
            {/* Left Controls & Model Selector */}
            <div className="flex items-center gap-3">
              {!sidebarOpen && (
                <div className="flex items-center gap-3 mr-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-[#ff5f56] shadow-sm hover:opacity-80 transition-opacity" />
                    <div className="w-3 h-3 rounded-full bg-[#ffbd2e] shadow-sm hover:opacity-80 transition-opacity" />
                    <div className="w-3 h-3 rounded-full bg-[#27c93f] shadow-sm hover:opacity-80 transition-opacity" />
                  </div>
                  <button
                    onClick={() => setSidebarOpen(true)}
                    title="Show Sidebar"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full glass-pill hover:border-purple-400 text-xs text-purple-200 hover:text-white transition-all cursor-pointer shadow-md"
                  >
                    <PanelLeftOpen className="w-3.5 h-3.5 text-purple-400" />
                    <span className="text-[11px] font-mono">Sidebar</span>
                  </button>
                </div>
              )}

              {/* Model Selector Glass Pill */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-pill hover:border-purple-400/50 text-xs text-slate-200 transition-colors cursor-pointer">
                  <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse shadow-[0_0_8px_#c084fc]" />
                  <select
                    aria-label="Select model"
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

                {(isMockResponse || messages.some((m) => m.isMock)) && (
                  <span
                    className="px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-400/35 text-[10px] font-mono text-amber-200 tracking-wide"
                    title="Responses are currently generated by the local MockProvider because no live upstream LLM API key is configured."
                  >
                    Local Simulation
                  </span>
                )}
              </div>
            </div>

            {/* Right Action Buttons: E.D.I.T.H. Switcher */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate('/edith')}
                title="Switch to E.D.I.T.H. Developer IDE Workspace"
                className="flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-pill hover:border-purple-400 text-xs font-mono text-purple-200 hover:text-white transition-all shadow-lg hover:shadow-purple-500/25 group cursor-pointer"
              >
                <Terminal className="w-3.5 h-3.5 text-purple-300 group-hover:rotate-12 transition-transform" />
                <span className="font-semibold tracking-wide">E.D.I.T.H. // IDE</span>
                <ExternalLink className="w-3 h-3 text-purple-400" />
              </button>
              <button
                type="button"
                aria-label="Conversation options"
                title="Session status"
                onClick={() =>
                  setFeatureNotice(
                    activeConversationId
                      ? `Active conversation persisted (${messages.length} messages). Use the sidebar trash icon to delete it.`
                      : 'Start typing below to create and persist a new conversation.'
                  )
                }
                className="w-8 h-8 rounded-full glass-pill flex items-center justify-center text-slate-400 hover:text-white cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Central Content Area */}
          <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col justify-between min-h-0">
            {/* Show Hero Banner only before the first message or while starting a fresh chat */}
            {messages.length === 0 && !isStreaming && !isLoadingMessages ? (
              <div className="flex-1 flex flex-col items-center justify-center my-auto max-w-2xl mx-auto w-full text-center">
                {/* 3D Glowing Cosmic AI Orb */}
                <div className="mb-4">
                  <NebulaOrb isStreaming={isStreaming} size={115} />
                </div>

                {/* Hero Title & Subtitle */}
                <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight mb-2 drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                  Welcome to your cognitive co-pilot
                </h1>
                <p className="text-xs md:text-sm text-slate-300 max-w-md mx-auto mb-8 font-light leading-relaxed">
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
              /* Active Chat Message Stream */
              <div className="max-w-2xl mx-auto w-full space-y-4 my-auto">
                {isLoadingMessages ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="frosted-glass-card rounded-2xl px-4 py-3 flex items-center gap-2.5 text-xs text-purple-200">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                      <span>Loading conversation transcript...</span>
                    </div>
                  </div>
                ) : (
                  <>
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
                          className={`rounded-2xl px-4 py-3 text-xs md:text-sm leading-relaxed whitespace-pre-wrap ${
                            msg.role === 'user'
                              ? 'bg-gradient-to-r from-purple-600/40 to-indigo-600/40 border border-purple-400/40 text-white max-w-md shadow-lg backdrop-blur-xl'
                              : 'frosted-glass-card text-slate-100 max-w-xl'
                          }`}
                        >
                          {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {msg.attachments.map((att) => (
                                <span
                                  key={att.id || att.filename}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/25 border border-white/15 text-[11px] font-mono text-purple-100"
                                >
                                  <FileText className="w-3 h-3 text-purple-300 shrink-0" />
                                  <span className="truncate max-w-[160px]">{att.filename}</span>
                                </span>
                              ))}
                            </div>
                          )}
                          <div>{msg.content}</div>
                          {msg.role === 'assistant' && msg.isMock && (
                            <div className="mt-2 pt-1.5 border-t border-white/10 text-[10px] font-mono text-amber-300/90">
                              Simulated Provider Output
                            </div>
                          )}
                        </div>
                      </div>
                    ))}

                    {isStreaming && (
                      <div className="flex gap-3 justify-start">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center text-white shrink-0 animate-pulse border border-white/20">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <div className="frosted-glass-card border-purple-400/50 rounded-2xl px-4 py-3 text-xs md:text-sm text-purple-200 max-w-xl whitespace-pre-wrap">
                          <span>{streamBuffer || 'Synthesizing response...'}</span>
                          <span className="inline-block w-1.5 h-3.5 ml-1 bg-purple-400 animate-pulse align-middle" />
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Bottom Floating Frosted Glass Input Bar & Status Banners */}
            <div className="max-w-2xl mx-auto w-full mt-4 space-y-2">
              {error && (
                <div
                  role="alert"
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-red-500/15 border border-red-400/35 text-xs text-red-200 backdrop-blur-xl"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                    <span className="truncate">{error}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {lastFailedPrompt && !isStreaming && (
                      <button
                        type="button"
                        onClick={() => retryLastMessage()}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/25 hover:bg-red-500/40 text-white text-[11px] font-medium transition-colors cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Retry</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearError}
                      aria-label="Dismiss error"
                      className="p-1 rounded-lg hover:bg-white/10 text-red-200 hover:text-white cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {featureNotice && (
                <div
                  role="status"
                  className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl glass-pill border border-purple-400/30 text-xs text-purple-100"
                >
                  <span className="truncate">{featureNotice}</span>
                  <button
                    type="button"
                    onClick={() => setFeatureNotice(null)}
                    aria-label="Dismiss notice"
                    className="p-1 rounded-lg hover:bg-white/10 text-purple-200 hover:text-white shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1">
                  {pendingAttachments.map((att) => (
                    <div
                      key={att.tempId}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-pill border border-purple-400/35 text-xs text-purple-100"
                    >
                      <FileText className="w-3.5 h-3.5 text-purple-300 shrink-0" />
                      <span className="truncate max-w-[180px] font-medium">{att.filename}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {Math.max(1, Math.round(att.sizeBytes / 1024))} KB
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingAttachment(att.tempId)}
                        aria-label={`Remove ${att.filename}`}
                        className="p-0.5 rounded hover:bg-white/10 text-slate-300 hover:text-white cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex items-center gap-2 p-2 rounded-2xl frosted-glass-input transition-all"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".txt,.md,.markdown,.csv,.json,text/plain,text/markdown,text/csv,application/json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isStreaming || isLoadingMessages}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach File"
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
                  title="Attach .txt, .md, .csv, or .json file (max 512 KB)"
                >
                  <Paperclip className="w-4 h-4" />
                </button>

                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={isLoadingMessages}
                  placeholder="Ask F.R.I.D.A.Y. anything..."
                  className="flex-1 bg-transparent border-0 text-xs md:text-sm text-white placeholder-slate-400 focus:outline-none px-2 disabled:opacity-50"
                />

                <button
                  type="button"
                  onClick={() =>
                    setFeatureNotice('Voice capture is not enabled in this browser build.')
                  }
                  aria-label="Voice Mode"
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer"
                  title="Voice Mode"
                >
                  <Mic className="w-4 h-4" />
                </button>

                {isStreaming ? (
                  <button
                    type="button"
                    onClick={cancelStreaming}
                    aria-label="Stop generating"
                    title="Stop generating"
                    className="p-2 rounded-xl bg-red-500/80 hover:bg-red-500 text-white transition-all shadow-md shadow-red-600/30 cursor-pointer border border-white/20"
                  >
                    <Square className="w-4 h-4 fill-current" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={(!input.trim() && pendingAttachments.length === 0) || isLoadingMessages}
                    aria-label="Send message"
                    title="Send message"
                    className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-all shadow-md shadow-purple-600/30 cursor-pointer border border-white/20"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>

      <FridaySettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FridayHelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenEdith={() => navigate('/edith')}
      />
    </div>
  );
}
