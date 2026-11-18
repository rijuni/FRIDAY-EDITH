import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Sparkles,
  Terminal,
  Paperclip,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
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
  Search,
  Pin,
  Pencil,
  Archive,
  Download,
  Copy,
  Brain,
  BookOpen,
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
import { FridayMemoryModal } from '../components/FridayMemoryModal';
import { FridayKnowledgeModal } from '../components/FridayKnowledgeModal';

const MAX_ATTACHMENT_BYTES = 1024 * 1024 * 1024;
const EXTENSION_MIME_MAP = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.csv': 'text/csv',
  '.json': 'application/json',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
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
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const {
    conversations,
    pagination,
    conversationSearch,
    showArchivedConversations,
    activeConversationId,
    activeProjectId,
    projects,
    isLoadingProjects,
    messages,
    selectedModel,
    availableModels,
    providerMode,
    setModel,
    pendingAttachments,
    addPendingAttachment,
    removePendingAttachment,
    isLoadingConversations,
    isLoadingMessages,
    isStreaming,
    streamBuffer,
    uploadStatus,
    isMockResponse,
    error,
    lastFailedPrompt,
    clearError,
    newChat,
    fetchConversations,
    fetchProjects,
    setActiveProjectId,
    selectConversation,
    deleteConversation,
    updateConversation,
    exportConversation,
    cancelStreaming,
    sendMessage,
    retryLastMessage,
    reviseMessage
  } = useFridayStore();

  const [input, setInput] = useState('');
  const [conversationSearchText, setConversationSearchText] = useState(conversationSearch);
  const [actionsConversationId, setActionsConversationId] = useState(null);
  const [featureNotice, setFeatureNotice] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const voiceBaseInputRef = useRef('');
  const speakingMessageRef = useRef(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      fetchConversations({ search: conversationSearchText });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [conversationSearchText, fetchConversations]);

  useEffect(() => {
    useFridayStore.getState().fetchModels();
    fetchProjects();
  }, []);

  useEffect(() => () => {
    speechRecognitionRef.current?.abort?.();
    window.speechSynthesis?.cancel?.();
  }, []);

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
          `Unsupported file "${file.name}". Allowed formats: text, PDF, DOCX, and XLSX.`
        );
        continue;
      }

      if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
        setFeatureNotice(
          `"${file.name}" must be non-empty and no larger than 1 GB for F.R.I.D.A.Y. chat ingestion.`
        );
        continue;
      }

      addPendingAttachment({
        tempId: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
        file
      });
    }
  };

  const handleSend = async (directText = null) => {
    const promptText = (typeof directText === 'string' ? directText : input).trim();
    if ((!promptText && pendingAttachments.length === 0) || isStreaming) return;

    if (typeof directText !== 'string') {
      setInput('');
    }
    speechRecognitionRef.current?.stop?.();
    setIsListening(false);
    setFeatureNotice(null);
    await sendMessage(promptText);
  };

  const toggleVoiceCapture = () => {
    if (speechRecognitionRef.current) {
      speechRecognitionRef.current.stop();
      return;
    }
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setFeatureNotice('Voice input is not supported in this browser. Try a browser with speech recognition enabled.');
      return;
    }
    try {
      const recognition = new Recognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = navigator.language || 'en-US';
      voiceBaseInputRef.current = input;
      recognition.onresult = (event) => {
        const transcript = Array.from(event.results || [])
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript || '')
          .join(' ')
          .trim();
        if (transcript) setInput([voiceBaseInputRef.current.trim(), transcript].filter(Boolean).join(' '));
      };
      recognition.onerror = (event) => {
        const message = event.error === 'not-allowed'
          ? 'Microphone access was denied. Allow microphone access in browser settings.'
          : event.error === 'no-speech'
            ? 'No speech was detected. Try again.'
            : 'Voice input ended unexpectedly.';
        setFeatureNotice(message);
        setIsListening(false);
        speechRecognitionRef.current = null;
      };
      recognition.onend = () => {
        setIsListening(false);
        speechRecognitionRef.current = null;
      };
      speechRecognitionRef.current = recognition;
      recognition.start();
      setIsListening(true);
      setFeatureNotice('Listening… your speech will be added to the message box for review.');
    } catch {
      speechRecognitionRef.current = null;
      setIsListening(false);
      setFeatureNotice('Unable to start voice input. Check microphone permissions and try again.');
    }
  };

  const toggleSpeechOutput = (message) => {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      setFeatureNotice('Speech output is not supported in this browser.');
      return;
    }
    if (speakingMessageRef.current === message.id) {
      window.speechSynthesis.cancel();
      speakingMessageRef.current = null;
      setSpeakingMessageId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new window.SpeechSynthesisUtterance(message.content || '');
    utterance.onend = () => {
      if (speakingMessageRef.current === message.id) {
        speakingMessageRef.current = null;
        setSpeakingMessageId(null);
      }
    };
    utterance.onerror = () => {
      if (speakingMessageRef.current === message.id) {
        speakingMessageRef.current = null;
        setSpeakingMessageId(null);
        setFeatureNotice('Speech output stopped before the response finished.');
      }
    };
    speakingMessageRef.current = message.id;
    setSpeakingMessageId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  const handleRevise = async (messageId) => {
    const revisedText = editDraft.trim();
    if (!revisedText || isStreaming) return;
    const revised = await reviseMessage(messageId, revisedText);
    if (!revised) return;
    setEditingMessageId(null);
    setEditDraft('');
    setFeatureNotice(null);
    await sendMessage(revisedText);
  };

  const handleProjectChange = async (event) => {
    const projectId = event.target.value || null;
    if (activeConversationId) {
      await updateConversation(activeConversationId, { projectId });
    } else {
      setActiveProjectId(projectId);
    }
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
                setConversationSearchText('');
                fetchConversations({ search: '', archived: false });
                setActionsConversationId(null);
                setFeatureNotice(null);
              }}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 via-purple-500 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-xs font-semibold text-white shadow-lg shadow-purple-600/30 border border-white/20 transition-all mb-6 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>New Chat</span>
            </button>

            <button
              type="button"
              onClick={() => setMemoryOpen(true)}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/20 bg-white/5 px-4 py-2 text-xs font-medium text-purple-100 transition-colors hover:bg-purple-500/15"
            >
              <Brain className="h-4 w-4" />
              <span>Manage Memory</span>
            </button>
            <button
              type="button"
              onClick={() => setKnowledgeOpen(true)}
              className="mb-4 -mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-cyan-300/20 bg-white/5 px-4 py-2 text-xs font-medium text-cyan-100 transition-colors hover:bg-cyan-500/15"
            >
              <BookOpen className="h-4 w-4" />
              <span>Knowledge Bases</span>
            </button>

            {/* Recent Transcripts List */}
            <div className="flex-1 overflow-y-auto space-y-1 pr-1">
              <div className="flex items-center justify-between text-[11px] font-semibold text-slate-400 px-2 mb-2">
                <span>{showArchivedConversations ? 'Archived' : 'Recent'}</span>
                {isLoadingConversations && (
                  <Loader2 className="w-3 h-3 text-purple-300 animate-spin" aria-label="Loading conversations" />
                )}
              </div>

              <div className="flex gap-2 px-1 mb-3">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="search"
                    value={conversationSearchText}
                    onChange={(event) => setConversationSearchText(event.target.value)}
                    aria-label="Search conversations"
                    placeholder="Search conversations"
                    className="w-full rounded-lg border border-white/10 bg-black/20 py-1.5 pl-8 pr-2 text-[11px] text-slate-100 placeholder:text-slate-500 focus:border-purple-400 focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => fetchConversations({ search: conversationSearchText, archived: !showArchivedConversations })}
                  aria-label={showArchivedConversations ? 'Show recent conversations' : 'Show archived conversations'}
                  title={showArchivedConversations ? 'Show recent' : 'Show archived'}
                  className="rounded-lg border border-white/10 px-2 text-[10px] text-slate-400 hover:text-white"
                >
                  {showArchivedConversations ? 'Recent' : 'Archive'}
                </button>
              </div>

              {conversations.length === 0 && !isLoadingConversations ? (
                <p className="px-3 py-2 text-[11px] text-slate-500 italic">
                  {conversationSearchText
                    ? 'No conversations match your search.'
                    : showArchivedConversations
                      ? 'No archived conversations.'
                      : 'No saved conversations yet. Start a prompt below.'}
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
                          setActionsConversationId(null);
                          selectConversation(conv.id);
                        }}
                        className="flex-1 min-w-0 flex items-center gap-2.5 px-3 py-2 text-left text-xs truncate cursor-pointer"
                      >
                        <MessageSquare
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isActive ? 'text-purple-300' : 'text-slate-400 group-hover:text-purple-300'
                          }`}
                        />
                        {conv.isPinned && <Pin className="h-3 w-3 shrink-0 fill-current text-amber-300" aria-label="Pinned" />}
                        <span className="min-w-0 flex-1 truncate" title={projects.find((project) => project.id === conv.projectId)?.name || conv.title || 'Untitled Conversation'}>
                          {conv.title || 'Untitled Conversation'}
                          {conv.projectId && <span className="ml-1 text-[9px] text-cyan-200/70">· {projects.find((project) => project.id === conv.projectId)?.name || 'project'}</span>}
                        </span>
                      </button>
                      <div className="relative mr-1">
                        <button
                          type="button"
                          onClick={() => setActionsConversationId((current) => current === conv.id ? null : conv.id)}
                          aria-label={`Actions for ${conv.title || 'conversation'}`}
                          aria-expanded={actionsConversationId === conv.id}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100 focus:opacity-100"
                        >
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </button>
                        {actionsConversationId === conv.id && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-xl border border-white/15 bg-[#171224] p-1 shadow-xl">
                            <button type="button" onClick={() => { updateConversation(conv.id, { isPinned: !conv.isPinned }); setActionsConversationId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                              <Pin className="h-3.5 w-3.5" />{conv.isPinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button type="button" onClick={() => { const title = window.prompt('Rename conversation', conv.title || ''); if (title?.trim()) updateConversation(conv.id, { title: title.trim() }); setActionsConversationId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                              <Pencil className="h-3.5 w-3.5" />Rename
                            </button>
                            <button type="button" onClick={() => { exportConversation(conv.id); setActionsConversationId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                              <Download className="h-3.5 w-3.5" />Export Markdown
                            </button>
                            <button type="button" onClick={() => { updateConversation(conv.id, { isArchived: !conv.isArchived }); setActionsConversationId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-slate-200 hover:bg-white/10">
                              <Archive className="h-3.5 w-3.5" />{conv.isArchived ? 'Restore' : 'Archive'}
                            </button>
                            <button type="button" onClick={() => { deleteConversation(conv.id); setActionsConversationId(null); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] text-red-300 hover:bg-red-500/15">
                              <Trash2 className="h-3.5 w-3.5" />Delete permanently
                            </button>
                          </div>
                        )}
                      </div>
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
                  Friday uses the models configured by the server. Responses are marked when mock mode is active.
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
                    {availableModels.length ? availableModels.map((model) => (
                      <option key={model.id} value={model.id} className="bg-[#120d24] text-white">{model.label}</option>
                    )) : <option value={selectedModel} disabled className="bg-[#120d24] text-white">
                      {providerMode === 'auth_required'
                        ? 'Sign in again to load models'
                        : providerMode === 'forbidden'
                          ? 'AI models are not available for this account'
                          : providerMode === 'unavailable'
                            ? 'AI service unavailable'
                            : 'No provider configured'}
                    </option>}
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
                          {editingMessageId === msg.id ? (
                            <form
                              onSubmit={(event) => { event.preventDefault(); handleRevise(msg.id); }}
                              className="min-w-[min(70vw,24rem)] space-y-2"
                            >
                              <textarea
                                autoFocus
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                                maxLength={32000}
                                aria-label="Edit your message"
                                className="w-full min-h-24 rounded-lg bg-black/25 border border-purple-300/30 p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-purple-400"
                              />
                              <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => { setEditingMessageId(null); setEditDraft(''); }} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-white/10">Cancel</button>
                                <button type="submit" disabled={!editDraft.trim() || isStreaming} className="rounded bg-purple-600 px-2.5 py-1 text-xs text-white disabled:opacity-40">Save and resend</button>
                              </div>
                            </form>
                          ) : (
                            <div>{msg.content}</div>
                          )}
                          {msg.role === 'user' && msg.id === messages.filter((item) => item.role === 'user').at(-1)?.id && !isStreaming && editingMessageId !== msg.id && (
                            <button
                              type="button"
                              onClick={() => { setEditingMessageId(msg.id); setEditDraft(msg.content); }}
                              aria-label="Edit and resend your last message"
                              title="Edit and resend"
                              className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-300 hover:bg-white/10 hover:text-white"
                            >
                              <Pencil className="h-3 w-3" />Edit and resend
                            </button>
                          )}
                          {msg.role === 'assistant' && (
                            <div className="mt-2 flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => toggleSpeechOutput(msg)}
                                aria-label={speakingMessageId === msg.id ? 'Stop reading Friday response' : 'Read Friday response aloud'}
                                aria-pressed={speakingMessageId === msg.id}
                                title={speakingMessageId === msg.id ? 'Stop reading' : 'Read aloud'}
                                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                              >
                                {speakingMessageId === msg.id ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                                {speakingMessageId === msg.id ? 'Stop' : 'Read aloud'}
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await navigator.clipboard.writeText(msg.content || '');
                                    setFeatureNotice('Response copied to clipboard.');
                                  } catch {
                                    setFeatureNotice('Clipboard access is unavailable in this browser.');
                                  }
                                }}
                                aria-label="Copy Friday response"
                                title="Copy response"
                                className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[10px] text-slate-400 hover:bg-white/10 hover:text-white"
                              >
                                <Copy className="h-3 w-3" />Copy
                              </button>
                            </div>
                          )}
                          {msg.role === 'assistant' && Array.isArray(msg.citations) && msg.citations.length > 0 && (
                            <div className="mt-3 border-t border-white/10 pt-2 text-[10px] text-cyan-100/90" aria-label="Sources">
                              <div className="mb-1 font-semibold uppercase tracking-wide text-cyan-200">Sources</div>
                              <ul className="space-y-1">
                                {msg.citations.map((citation) => (
                                  <li key={`${citation.id}-${citation.label}`}>
                                    [{citation.label}] {citation.source} · chunk {citation.chunkIndex + 1}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
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
                          <span>{uploadStatus || streamBuffer || 'Synthesizing response...'}</span>
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

              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                <span className="text-[11px] text-slate-400">Project context</span>
                <select
                  value={activeProjectId || ''}
                  onChange={handleProjectChange}
                  disabled={isStreaming || isLoadingMessages || isLoadingProjects}
                  aria-label="Associate this conversation with an Edith project"
                  className="max-w-[65%] truncate rounded-lg border border-cyan-300/15 bg-[#171224] px-2.5 py-1.5 text-[11px] text-cyan-100 disabled:opacity-50"
                >
                  <option value="">No project</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>{project.name} · {project.defaultBranch}</option>
                  ))}
                </select>
              </div>

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
                  accept=".txt,.md,.markdown,.csv,.json,.pdf,.docx,.xlsx,text/plain,text/markdown,text/csv,application/json,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isStreaming || isLoadingMessages}
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach File"
                  className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer disabled:opacity-40"
                  title="Attach text, PDF, DOCX, or XLSX files (up to 1 GB each)"
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
                  onClick={toggleVoiceCapture}
                  aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
                  aria-pressed={isListening}
                  className={`p-2 rounded-xl hover:bg-white/10 transition-colors cursor-pointer ${isListening ? 'text-red-300 bg-red-500/10' : 'text-slate-400 hover:text-white'}`}
                  title={isListening ? 'Stop voice input' : 'Speak a message'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
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
      <FridayMemoryModal isOpen={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <FridayKnowledgeModal isOpen={knowledgeOpen} onClose={() => setKnowledgeOpen(false)} />
      <FridayHelpModal
        isOpen={helpOpen}
        onClose={() => setHelpOpen(false)}
        onOpenEdith={() => navigate('/edith')}
      />
    </div>
  );
}
