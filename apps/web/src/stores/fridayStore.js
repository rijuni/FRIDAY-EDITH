import { create } from 'zustand';

export const useFridayStore = create((set, get) => ({
  conversations: [
    {
      id: 'conv_1',
      title: 'Explain the Code',
      updatedAt: new Date().toISOString()
    },
    {
      id: 'conv_2',
      title: 'Kyoto Solo Trip Itinerary',
      updatedAt: new Date(Date.now() - 3600000).toISOString()
    },
    {
      id: 'conv_3',
      title: 'Podcast Ideas: Sustainable Tech',
      updatedAt: new Date(Date.now() - 7200000).toISOString()
    }
  ],
  activeConversationId: null,
  messages: [], // Starts empty so the iconic Hero screen with 3D Orb & 3 Quick Cards is displayed!
  selectedModel: 'nebula-4.0e',
  isStreaming: false,
  streamBuffer: '',

  setModel: (model) => set({ selectedModel: model }),
  setActiveConversation: (id) => set({ activeConversationId: id }),
  newChat: () => set({ messages: [], activeConversationId: null, streamBuffer: '', isStreaming: false }),

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

