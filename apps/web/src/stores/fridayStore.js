import { create } from 'zustand';
import { apiFetch, safeParseJson } from '../lib/apiClient.js';

const DEFAULT_SYSTEM_PROMPT = 'You are F.R.I.D.A.Y., a high-intelligence AI assistant.';
const LEGACY_MODEL_PROVIDERS = {
  'claude-3-7-sonnet': 'Anthropic',
  'gemini-2-flash': 'Gemini'
};
let modelRequestSequence = 0;
let conversationFetchSequence = 0;

function resolveAvailableModel(modelId, models) {
  if (models.some((model) => model.id === modelId)) return modelId;
  const legacyProvider = LEGACY_MODEL_PROVIDERS[modelId];
  if (legacyProvider) {
    const matchingProvider = models.find((model) => model.label?.startsWith(`${legacyProvider} ·`));
    if (matchingProvider) return matchingProvider.id;
  }
  return models[0]?.id || modelId;
}

const INITIAL_STATE = {
  conversations: [],
  memories: [],
  isLoadingMemories: false,
  pagination: { total: 0, limit: 25, offset: 0, hasMore: false },
  conversationSearch: '',
  showArchivedConversations: false,
  activeConversationId: null,
  messages: [],
  selectedModel: 'claude-3-7-sonnet',
  availableModels: [],
  providerMode: 'unknown',
  isLoadingModels: false,
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
  pendingAttachments: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  isStreaming: false,
  streamBuffer: '',
  uploadStatus: '',
  isMockResponse: false,
  error: null,
  lastFailedPrompt: null,
  activeAbortController: null,
  selectionNonce: 0
};

export const useFridayStore = create((set, get) => ({
  ...INITIAL_STATE,

  setModel: (model) => set({ selectedModel: model }),
  setPreferences: ({ selectedModel, systemPrompt, temperature }) =>
    set((state) => ({
      selectedModel: selectedModel || state.selectedModel,
      systemPrompt:
        typeof systemPrompt === 'string' && systemPrompt.trim()
          ? systemPrompt.trim()
          : DEFAULT_SYSTEM_PROMPT,
      temperature:
        typeof temperature === 'number' && !Number.isNaN(temperature)
          ? Math.min(2, Math.max(0, temperature))
          : state.temperature
    })),
  clearError: () => set({ error: null }),

  addPendingAttachment: (attachment) =>
    set((state) => {
      if (state.pendingAttachments.length >= 5) {
        return { error: 'Maximum of 5 attached files allowed per message.' };
      }
      return {
        error: null,
        pendingAttachments: [...state.pendingAttachments, attachment]
      };
    }),

  removePendingAttachment: (tempId) =>
    set((state) => ({
      pendingAttachments: state.pendingAttachments.filter((a) => a.tempId !== tempId)
    })),

  clearPendingAttachments: () => set({ pendingAttachments: [] }),

  fetchMemories: async () => {
    set({ isLoadingMemories: true });
    try {
      const response = await apiFetch('/v1/friday/memory');
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to load saved memory.');
      set({ memories: payload?.data?.memories || [], isLoadingMemories: false });
      return true;
    } catch (error) {
      set({ isLoadingMemories: false, error: error?.message || 'Unable to load saved memory.' });
      return false;
    }
  },

  saveMemory: async ({ id, category, content }) => {
    try {
      const response = await apiFetch(id ? `/v1/friday/memory/${encodeURIComponent(id)}` : '/v1/friday/memory', {
        method: id ? 'PATCH' : 'POST',
        body: JSON.stringify({ category, content })
      });
      const payload = await safeParseJson(response);
      if (!response.ok || !payload?.data?.memory) throw new Error(payload?.message || 'Unable to save memory.');
      const memory = payload.data.memory;
      set((state) => ({ memories: [memory, ...state.memories.filter((item) => item.id !== memory.id)] }));
      return true;
    } catch (error) {
      set({ error: error?.message || 'Unable to save memory.' });
      return false;
    }
  },

  deleteMemory: async (id) => {
    try {
      const response = await apiFetch(`/v1/friday/memory/${encodeURIComponent(id)}`, { method: 'DELETE' });
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to delete memory.');
      set((state) => ({ memories: state.memories.filter((memory) => memory.id !== id) }));
      return true;
    } catch (error) {
      set({ error: error?.message || 'Unable to delete memory.' });
      return false;
    }
  },

  newChat: () => {
    get().activeAbortController?.abort();
    set({
      activeConversationId: null,
      messages: [],
      conversationSearch: '',
      showArchivedConversations: false,
      pendingAttachments: [],
      streamBuffer: '',
      uploadStatus: '',
      isStreaming: false,
      isMockResponse: false,
      error: null,
      lastFailedPrompt: null,
      activeAbortController: null
    });
  },

  resetState: () => {
    get().activeAbortController?.abort();
    set({ ...INITIAL_STATE });
  },

  fetchConversations: async (options = {}) => {
    const append = options.append === true;
    const current = get();
    const search = typeof options.search === 'string' ? options.search : current.conversationSearch;
    const archived = typeof options.archived === 'boolean' ? options.archived : current.showArchivedConversations;
    const requestSequence = ++conversationFetchSequence;
    set({
      conversationSearch: search,
      showArchivedConversations: archived,
      isLoadingConversations: true
    });
    const { pagination, conversations } = get();
    const limit = pagination.limit || 25;
    const offset = append ? conversations.length : 0;
    try {
      const query = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        search,
        archived: String(archived)
      });
      const res = await apiFetch(`/v1/friday/conversations?${query}`, {
        method: 'GET'
      });
      const payload = await safeParseJson(res);
      if (requestSequence !== conversationFetchSequence) return;
      if (!res.ok || !payload?.data) {
        set({
          error: payload?.message || 'Unable to load conversation history.',
          isLoadingConversations: false
        });
        return;
      }

      const incoming = payload.data.conversations || [];
      set({
        conversations: append ? [...conversations, ...incoming] : incoming,
        pagination: payload.data.pagination || { total: incoming.length, limit, offset, hasMore: false },
        isLoadingConversations: false
      });
    } catch {
      if (requestSequence !== conversationFetchSequence) return;
      set({
        error: 'Unable to reach F.R.I.D.A.Y. API to load conversations.',
        isLoadingConversations: false
      });
    }
  },

  fetchModels: async () => {
    const requestSequence = ++modelRequestSequence;
    set({ isLoadingModels: true });
    try {
      const res = await apiFetch('/v1/friday/models', { method: 'GET' });
      const payload = await safeParseJson(res);
      if (requestSequence !== modelRequestSequence) return;
      if (!res.ok) {
        const providerMode = res.status === 401
          ? 'auth_required'
          : res.status === 403
            ? 'forbidden'
            : 'unavailable';
        set({ availableModels: [], providerMode, isLoadingModels: false });
        return;
      }
      if (!Array.isArray(payload?.data?.models)) {
        set({ availableModels: [], providerMode: 'unavailable', isLoadingModels: false });
        return;
      }
      const models = payload.data.models;
      set((state) => ({
        availableModels: models,
        providerMode: payload.data.provider_mode || 'unknown',
        isLoadingModels: false,
        ...(models.length ? { selectedModel: resolveAvailableModel(state.selectedModel, models) } : {})
      }));
    } catch {
      if (requestSequence !== modelRequestSequence) return;
      set({ availableModels: [], providerMode: 'unavailable', isLoadingModels: false });
    }
  },

  selectConversation: async (id) => {
    if (!id) return;
    get().activeAbortController?.abort();
    const nonce = get().selectionNonce + 1;

    set({
      activeConversationId: id,
      isLoadingMessages: true,
      isStreaming: false,
      streamBuffer: '',
      uploadStatus: '',
      error: null,
      activeAbortController: null,
      selectionNonce: nonce
    });

    try {
      const res = await apiFetch(`/v1/friday/conversations/${encodeURIComponent(id)}`, {
        method: 'GET'
      });
      const payload = await safeParseJson(res);

      // Drop stale response if user selected a different conversation mid-flight
      if (get().selectionNonce !== nonce) return;

      if (!res.ok || !payload?.data?.conversation) {
        set({
          error: payload?.message || 'Failed to load conversation messages.',
          isLoadingMessages: false
        });
        return;
      }

      const conv = payload.data.conversation;
      const loadedMessages = (conv.messages || []).map((message) => {
        let metadata = message.metadata;
        if (typeof metadata === 'string') {
          try { metadata = JSON.parse(metadata); } catch { metadata = {}; }
        }
        return {
          ...message,
          citations: Array.isArray(metadata?.citations) ? metadata.citations : [],
          isMock: metadata?.is_mock === true
        };
      });
      set({
        activeConversationId: conv.id,
        messages: loadedMessages,
        selectedModel: resolveAvailableModel(conv.modelPreference || get().selectedModel, get().availableModels),
        systemPrompt: conv.systemPrompt || get().systemPrompt,
        isLoadingMessages: false
      });
    } catch {
      if (get().selectionNonce !== nonce) return;
      set({
        error: 'Unable to reach API to load conversation.',
        isLoadingMessages: false
      });
    }
  },

  deleteConversation: async (id) => {
    if (!id) return;
    try {
      const res = await apiFetch(`/v1/friday/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const payload = await safeParseJson(res);
        set({ error: payload?.message || 'Failed to delete conversation.' });
        return;
      }

      const { activeConversationId, conversations } = get();
      const updated = conversations.filter((c) => c.id !== id);
      set({
        conversations: updated,
        ...(activeConversationId === id ? { activeConversationId: null, messages: [] } : {})
      });
      await get().fetchConversations();
    } catch {
      set({ error: 'Network error while deleting conversation.' });
    }
  },

  updateConversation: async (id, updates) => {
    if (!id) return null;
    try {
      const res = await apiFetch(`/v1/friday/conversations/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      const payload = await safeParseJson(res);
      if (!res.ok || !payload?.data?.conversation) {
        set({ error: payload?.message || 'Failed to update conversation.' });
        return null;
      }

      const updated = payload.data.conversation;
      set((state) => {
        const belongsInCurrentList = Boolean(updated.isArchived) === state.showArchivedConversations;
        const conversations = (belongsInCurrentList
          ? state.conversations.map((conversation) => conversation.id === id ? updated : conversation)
          : state.conversations.filter((conversation) => conversation.id !== id))
          .sort((left, right) => Number(right.isPinned) - Number(left.isPinned)
            || new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
        return {
          conversations,
          ...(updated.isArchived && state.activeConversationId === id
            ? { activeConversationId: null, messages: [] }
            : {})
        };
      });
      await get().fetchConversations();
      return updated;
    } catch {
      set({ error: 'Network error while updating conversation.' });
      return null;
    }
  },

  exportConversation: async (id) => {
    if (!id) return false;
    try {
      const res = await apiFetch(`/v1/friday/conversations/${encodeURIComponent(id)}`, { method: 'GET' });
      const payload = await safeParseJson(res);
      const conversation = payload?.data?.conversation;
      if (!res.ok || !conversation) {
        set({ error: payload?.message || 'Failed to export conversation.' });
        return false;
      }

      const transcript = [
        `# ${conversation.title || 'Friday conversation'}`,
        '',
        ...(conversation.messages || []).flatMap((message) => [
          `## ${message.role === 'assistant' ? 'Friday' : 'You'}`,
          '',
          message.content || '',
          ...(message.attachments || []).map((attachment) => `\n_Attachment: ${attachment.filename}_`),
          ''
        ])
      ].join('\n');
      const blobUrl = URL.createObjectURL(new Blob([transcript], { type: 'text/markdown;charset=utf-8' }));
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = `${(conversation.title || 'friday-conversation').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100)}.md`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
      return true;
    } catch {
      set({ error: 'Unable to export conversation.' });
      return false;
    }
  },

  cancelStreaming: () => {
    const { activeAbortController, streamBuffer, messages } = get();
    activeAbortController?.abort();
    const partial = streamBuffer.trim();
    const lastUserPrompt = [...messages].reverse().find((message) => message.role === 'user')?.content || null;
    set({
      messages: partial
        ? [...messages, { id: `msg_cancelled_${Date.now()}`, role: 'assistant', content: `${partial} [Stopped]`, cancelled: true }]
        : messages,
      isStreaming: false,
      streamBuffer: '',
      uploadStatus: '',
      activeAbortController: null,
      lastFailedPrompt: lastUserPrompt,
      error: lastUserPrompt ? 'Generation stopped. Retry to regenerate the response.' : null
    });
  },

  sendMessage: async (rawPrompt) => {
    const stagedAttachments = get().pendingAttachments;
    const rawText = String(rawPrompt || '').trim();
    const promptText = rawText || (stagedAttachments.length > 0 ? 'Please analyze the attached file(s).' : '');
    if (!promptText || get().isStreaming) return;

    const { selectedModel, systemPrompt, temperature } = get();
    let convId = get().activeConversationId;
    const abortController = new AbortController();

    set({
      error: null,
      lastFailedPrompt: null,
      isStreaming: true,
      streamBuffer: '',
      uploadStatus: '',
      isMockResponse: false,
      activeAbortController: abortController
    });

    try {
      // 1. Ensure a persisted conversation exists before sending message or uploading attachments
      if (!convId) {
        const createRes = await apiFetch('/v1/friday/conversations', {
          method: 'POST',
          body: JSON.stringify({ modelPreference: selectedModel, systemPrompt }),
          signal: abortController.signal
        });
        const createPayload = await safeParseJson(createRes);
        if (!createRes.ok || !createPayload?.data?.conversation?.id) {
          throw new Error(createPayload?.message || 'Failed to create conversation.');
        }
        convId = createPayload.data.conversation.id;
        set({
          activeConversationId: convId,
          conversations: [createPayload.data.conversation, ...get().conversations]
        });
      }

      // 2. Upload any staged file attachments via API + Python document parser
      const uploadedAttachments = [];
      for (const [index, att] of stagedAttachments.entries()) {
        set({ uploadStatus: `Uploading and scanning ${att.filename} (${index + 1}/${stagedAttachments.length})...` });
        const uploadUrl = new URL(
          `/v1/friday/conversations/${encodeURIComponent(convId)}/attachments/upload`,
          window.location.origin
        );
        uploadUrl.searchParams.set('filename', att.filename);
        const uploadRes = await apiFetch(`${uploadUrl.pathname}${uploadUrl.search}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-File-Mime-Type': att.mimeType
          },
          body: att.file,
          signal: abortController.signal
        });
        const uploadPayload = await safeParseJson(uploadRes);
        if (!uploadRes.ok || !uploadPayload?.data?.attachment?.id) {
          throw new Error(uploadPayload?.message || `Failed to attach ${att.filename}.`);
        }
        uploadedAttachments.push(uploadPayload.data.attachment);
      }
      set({ uploadStatus: stagedAttachments.length ? 'Preparing attached documents...' : '' });

      // 3. Append optimistic user message (with uploaded attachment chips)
      const userMsgId = `msg_user_${Date.now()}`;
      set((state) => {
        const lastMessage = state.messages.at(-1);
        const isVisibleRetry = lastMessage?.role === 'user' && lastMessage.content === promptText;
        return {
          pendingAttachments: [],
          messages: isVisibleRetry ? state.messages : [
            ...state.messages,
            {
              id: userMsgId,
              role: 'user',
              content: promptText,
              attachments: uploadedAttachments
            }
          ]
        };
      });

      // 4. Stream assistant response through Node API persistence proxy
      const streamRes = await apiFetch(
        `/v1/friday/conversations/${encodeURIComponent(convId)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: promptText,
            model: selectedModel,
            temperature,
            systemPrompt,
            ...(uploadedAttachments.length > 0
              ? { attachmentIds: uploadedAttachments.map((a) => a.id) }
              : {})
          }),
          signal: abortController.signal
        }
      );

      if (!streamRes.ok || !streamRes.body) {
        const errPayload = await safeParseJson(streamRes);
        throw new Error(errPayload?.message || 'Failed to receive response from F.R.I.D.A.Y. service.');
      }
      set({ uploadStatus: '' });

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let streamError = null;
      let streamCompleted = false;
      let responseCitations = [];

      const processLines = (lines) => {
        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (!line.startsWith('data: ')) continue;
          try {
            const frame = JSON.parse(line.slice(6));
            if (frame?.metadata?.is_mock) {
              set({ isMockResponse: true });
            }
            if (frame.event === 'citations' && Array.isArray(frame.metadata?.citations)) {
              responseCitations = frame.metadata.citations;
            }
            if (frame.event === 'done') streamCompleted = true;
            if (frame.event === 'chunk' && typeof frame.text === 'string') {
              set((state) => ({ streamBuffer: state.streamBuffer + frame.text }));
            } else if (frame.event === 'error') {
              streamError = frame.message || 'Streaming error occurred.';
            }
          } catch {
            // Ignore non-JSON or partial frame lines
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        sseBuffer += decoder.decode(value, { stream: true });
        const lines = sseBuffer.split('\n');
        sseBuffer = lines.pop() ?? '';
        processLines(lines);
      }

      if (sseBuffer) {
        processLines([sseBuffer]);
      }

      if (streamError) {
        throw new Error(streamError);
      }
      if (!streamCompleted) {
        throw new Error('Response stream ended before Friday completed the answer. You can retry this message.');
      }

      const finalContent = get().streamBuffer.trim();
      set((state) => ({
        messages: finalContent
          ? [
              ...state.messages,
              {
                id: `msg_ast_${Date.now()}`,
                role: 'assistant',
                content: finalContent,
                isMock: state.isMockResponse,
                citations: responseCitations
              }
            ]
          : state.messages,
        isStreaming: false,
        streamBuffer: '',
        uploadStatus: '',
        activeAbortController: null
      }));

      // Refresh conversation list so auto-generated titles stay synchronized
      get().fetchConversations();
    } catch (err) {
      if (err?.name === 'AbortError') {
        return;
      }
      set({
        isStreaming: false,
        streamBuffer: '',
        uploadStatus: '',
        activeAbortController: null,
        lastFailedPrompt: promptText,
        error: err?.message || 'Unable to send message. Verify API and AI services are running.'
      });
    }
  },

  retryLastMessage: async () => {
    const prompt = get().lastFailedPrompt;
    if (!prompt) return;
    set((state) => ({
      messages: state.messages.filter((message) => !message.cancelled),
      error: null
    }));
    await get().sendMessage(prompt);
  },

  reviseMessage: async (messageId, content) => {
    const conversationId = get().activeConversationId;
    if (!conversationId || !String(content || '').trim()) return false;
    try {
      const response = await apiFetch(
        `/v1/friday/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`,
        { method: 'PATCH', body: JSON.stringify({ content: String(content).trim() }) }
      );
      const payload = await safeParseJson(response);
      if (!response.ok) throw new Error(payload?.message || 'Unable to edit this message.');
      await get().selectConversation(conversationId);
      return true;
    } catch (err) {
      set({ error: err?.message || 'Unable to edit this message.' });
      return false;
    }
  }
}));

