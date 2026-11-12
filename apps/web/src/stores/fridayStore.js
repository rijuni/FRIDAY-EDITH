import { create } from 'zustand';
import { apiFetch, safeParseJson } from '../lib/apiClient.js';

const DEFAULT_SYSTEM_PROMPT = 'You are F.R.I.D.A.Y., a high-intelligence AI assistant.';

const INITIAL_STATE = {
  conversations: [],
  pagination: { total: 0, limit: 25, offset: 0, hasMore: false },
  activeConversationId: null,
  messages: [],
  selectedModel: 'claude-3-7-sonnet',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  temperature: 0.7,
  pendingAttachments: [],
  isLoadingConversations: false,
  isLoadingMessages: false,
  isStreaming: false,
  streamBuffer: '',
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

  newChat: () => {
    get().activeAbortController?.abort();
    set({
      activeConversationId: null,
      messages: [],
      pendingAttachments: [],
      streamBuffer: '',
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

  fetchConversations: async ({ append = false } = {}) => {
    const { pagination, conversations } = get();
    const limit = pagination.limit || 25;
    const offset = append ? conversations.length : 0;

    set({ isLoadingConversations: true });
    try {
      const res = await apiFetch(`/v1/friday/conversations?limit=${limit}&offset=${offset}`, {
        method: 'GET'
      });
      const payload = await safeParseJson(res);
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
      set({
        error: 'Unable to reach F.R.I.D.A.Y. API to load conversations.',
        isLoadingConversations: false
      });
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
      set({
        activeConversationId: conv.id,
        messages: conv.messages || [],
        selectedModel: conv.modelPreference || get().selectedModel,
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
    } catch {
      set({ error: 'Network error while deleting conversation.' });
    }
  },

  cancelStreaming: () => {
    const { activeAbortController, streamBuffer, messages } = get();
    activeAbortController?.abort();
    const partial = streamBuffer.trim();
    set({
      messages: partial
        ? [...messages, { id: `msg_cancelled_${Date.now()}`, role: 'assistant', content: `${partial} [Cancelled]` }]
        : messages,
      isStreaming: false,
      streamBuffer: '',
      activeAbortController: null
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
      for (const att of stagedAttachments) {
        const uploadRes = await apiFetch(
          `/v1/friday/conversations/${encodeURIComponent(convId)}/attachments`,
          {
            method: 'POST',
            body: JSON.stringify({
              filename: att.filename,
              mimeType: att.mimeType,
              content: att.content
            }),
            signal: abortController.signal
          }
        );
        const uploadPayload = await safeParseJson(uploadRes);
        if (!uploadRes.ok || !uploadPayload?.data?.attachment?.id) {
          throw new Error(uploadPayload?.message || `Failed to attach ${att.filename}.`);
        }
        uploadedAttachments.push(uploadPayload.data.attachment);
      }

      // 3. Append optimistic user message (with uploaded attachment chips)
      const userMsgId = `msg_user_${Date.now()}`;
      set((state) => ({
        pendingAttachments: [],
        messages: [
          ...state.messages,
          {
            id: userMsgId,
            role: 'user',
            content: promptText,
            attachments: uploadedAttachments
          }
        ]
      }));

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

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let sseBuffer = '';
      let streamError = null;

      const processLines = (lines) => {
        for (const rawLine of lines) {
          const line = rawLine.replace(/\r$/, '');
          if (!line.startsWith('data: ')) continue;
          try {
            const frame = JSON.parse(line.slice(6));
            if (frame?.metadata?.is_mock) {
              set({ isMockResponse: true });
            }
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

      const finalContent = get().streamBuffer.trim();
      set((state) => ({
        messages: finalContent
          ? [
              ...state.messages,
              {
                id: `msg_ast_${Date.now()}`,
                role: 'assistant',
                content: finalContent,
                isMock: state.isMockResponse
              }
            ]
          : state.messages,
        isStreaming: false,
        streamBuffer: '',
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
        activeAbortController: null,
        lastFailedPrompt: promptText,
        error: err?.message || 'Unable to send message. Verify API and AI services are running.'
      });
    }
  },

  retryLastMessage: async () => {
    const prompt = get().lastFailedPrompt;
    if (!prompt) return;
    await get().sendMessage(prompt);
  }
}));

