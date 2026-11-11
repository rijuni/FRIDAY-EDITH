import { create } from 'zustand';

export const useFridayStore = create((set, get) => ({
  conversations: [
    {
      id: 'conv_welcome',
      title: 'Welcome to F.R.I.D.A.Y.',
      updatedAt: new Date().toISOString()
    }
  ],
  activeConversationId: 'conv_welcome',
  messages: [
    {
      id: 'msg_welcome',
      role: 'assistant',
      content: 'Greetings. F.R.I.D.A.Y. neural core is active. I am initialized in your Nebula workspace. How may I assist your operations today?'
    }
  ],
  selectedModel: 'claude-3-7-sonnet',
  isStreaming: false,
  streamBuffer: '',

  setModel: (model) => set({ selectedModel: model }),
  setActiveConversation: (id) => set({ activeConversationId: id }),

  appendMessage: (message) => set((state) => ({
    messages: [...state.messages, { ...message, id: `msg_${Date.now()}` }]
  })),

  startStreaming: () => set({ isStreaming: true, streamBuffer: '' }),
  updateStreamBuffer: (text) => set((state) => ({ streamBuffer: state.streamBuffer + text })),
  finishStreaming: () => {
    const { streamBuffer, appendMessage } = get();
    if (streamBuffer.trim()) {
      appendMessage({ role: 'assistant', content: streamBuffer });
    }
    set({ isStreaming: false, streamBuffer: '' });
  }
}));
