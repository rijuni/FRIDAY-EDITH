import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, getCookie, safeParseJson } from '../lib/apiClient.js';

describe('Frontend apiClient unit tests', () => {
  it('getCookie decodes cookie values safely', () => {
    const prevDoc = globalThis.document;
    globalThis.document = {
      cookie: 'other=1; friday_csrf_token=tok%2B123%3D; another=2'
    };

    try {
      assert.equal(getCookie('friday_csrf_token'), 'tok+123=');
      assert.equal(getCookie('missing'), null);
    } finally {
      globalThis.document = prevDoc;
    }
  });

  it('apiFetch attaches X-CSRF-Token on POST, skips it on GET, and shares single-flight refresh on 401', async () => {
    const prevDoc = globalThis.document;
    const prevFetch = globalThis.fetch;
    globalThis.document = { cookie: 'friday_csrf_token=csrf_abc' };

    const calls = [];
    let refreshed = false;

    globalThis.fetch = async (url, init = {}) => {
      const headers = new Headers(init.headers);
      calls.push({ url, method: init.method, csrf: headers.get('X-CSRF-Token') });

      if (url === '/v1/auth/refresh') {
        refreshed = true;
        globalThis.document = { cookie: 'friday_csrf_token=csrf_rotated' };
        return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
      }

      if (!refreshed) {
        return new Response(JSON.stringify({ message: 'Expired' }), { status: 401 });
      }

      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    try {
      const [resA, resB] = await Promise.all([
        apiFetch('/v1/friday/conversations', { method: 'GET' }),
        apiFetch('/v1/friday/conversations', { method: 'POST', body: JSON.stringify({ title: 'hi' }) })
      ]);

      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);

      const refreshCalls = calls.filter((c) => c.url === '/v1/auth/refresh');
      assert.equal(refreshCalls.length, 1, 'Concurrent 401 responses should trigger only one refresh');

      const initialGet = calls.find((c) => c.url === '/v1/friday/conversations' && c.method === 'GET');
      assert.equal(initialGet.csrf, null);

      const retriedPost = calls.findLast(
        (c) => c.url === '/v1/friday/conversations' && c.method === 'POST'
      );
      assert.equal(retriedPost.csrf, 'csrf_rotated');
    } finally {
      globalThis.fetch = prevFetch;
      globalThis.document = prevDoc;
    }
  });

  it('safeParseJson returns null for empty or non-JSON responses', async () => {
    assert.equal(await safeParseJson(new Response(null, { status: 204 })), null);
    assert.equal(await safeParseJson(new Response('not-json', { status: 500 })), null);
    assert.deepEqual(await safeParseJson(new Response('{"a":1}', { status: 200 })), { a: 1 });
  });
});
