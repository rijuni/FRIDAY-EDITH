import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useAuthStore } from '../stores/authStore.js';
import { useFridayStore } from '../stores/fridayStore.js';

function createSseStream(chunks) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}

describe('Frontend Zustand stores (authStore & fridayStore)', () => {
  beforeEach(() => {
    useFridayStore.getState().resetState();
    useAuthStore.setState({ user: null, isAuthenticated: false, isCheckingSession: false });
  });

  it('useAuthStore.logout resets both auth state and useFridayStore conversation state', async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      assert.equal(url, '/v1/auth/logout');
      return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
    };

    try {
      useAuthStore.getState().setUser({ id: 'u1', email: 'u1@example.com', role: 'USER' });
      useFridayStore.setState({
        activeConversationId: 'conv_1',
        messages: [{ id: 'm1', role: 'user', content: 'secret prompt' }]
      });

      await useAuthStore.getState().logout();

      assert.equal(useAuthStore.getState().isAuthenticated, false);
      assert.equal(useAuthStore.getState().user, null);
      assert.equal(useFridayStore.getState().activeConversationId, null);
      assert.deepEqual(useFridayStore.getState().messages, []);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('useFridayStore reassembles split SSE chunks cleanly and surfaces isMock metadata', async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (url === '/v1/friday/conversations' && init.method === 'POST') {
        return new Response(
          JSON.stringify({
            data: { conversation: { id: 'conv_123', title: 'New F.R.I.D.A.Y. Session' } }
          }),
          { status: 201 }
        );
      }

      if (url === '/v1/friday/conversations/conv_123/messages') {
        const stream = createSseStream([
          'data: {"event":"meta","metadata":{"is_mock":true}}\n\n',
          'data: {"event":"chunk","text":"Hel',
          'lo from "}\n\ndata: {"event":"chunk","text":"F.R.I.D.A.Y."}\n\n',
          'data: {"event":"done"}\n\n'
        ]);
        return new Response(stream, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' }
        });
      }

      if (url.startsWith('/v1/friday/conversations?')) {
        return new Response(
          JSON.stringify({
            data: {
              conversations: [{ id: 'conv_123', title: 'Test streaming prompt' }],
              pagination: { total: 1, limit: 25, offset: 0, hasMore: false }
            }
          }),
          { status: 200 }
        );
      }

      return new Response('{}', { status: 404 });
    };

    try {
      await useFridayStore.getState().sendMessage('Test streaming prompt');
      const state = useFridayStore.getState();

      assert.equal(state.isStreaming, false);
      assert.equal(state.error, null);
      assert.equal(state.isMockResponse, true);
      assert.equal(state.messages.length, 2);
      assert.equal(state.messages[0].role, 'user');
      assert.equal(state.messages[1].role, 'assistant');
      assert.equal(state.messages[1].content, 'Hello from F.R.I.D.A.Y.');
      assert.equal(state.messages[1].isMock, true);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });

  it('useFridayStore preserves lastFailedPrompt and emits honest error without fake assistant fallback', async () => {
    const prevFetch = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      if (url === '/v1/friday/conversations' && init.method === 'POST') {
        return new Response(
          JSON.stringify({ data: { conversation: { id: 'conv_err', title: 'New' } } }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ message: 'Python AI service offline' }), { status: 502 });
    };

    try {
      await useFridayStore.getState().sendMessage('Diagnose failure');
      const state = useFridayStore.getState();

      assert.equal(state.isStreaming, false);
      assert.match(state.error || '', /Python AI service offline/);
      assert.equal(state.lastFailedPrompt, 'Diagnose failure');
      assert.equal(state.messages.filter((m) => m.role === 'assistant').length, 0);
    } finally {
      globalThis.fetch = prevFetch;
    }
  });
});
