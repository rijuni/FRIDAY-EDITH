import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../app.js';
import { config } from '../config/index.js';
import { prisma } from '../repositories/prisma.js';
import { authService } from '../modules/auth/auth.service.js';

test('F.R.I.D.A.Y. API: Conversation CRUD, ownership isolation, SSE proxy auth, and persistence', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/v1/friday`;

  // Ephemeral local mock upstream representing Python friday-ai service
  let observedUpstreamHeaders = null;
  const mockAiServer = http.createServer((req, res) => {
    observedUpstreamHeaders = req.headers;
    req.resume();
    req.on('end', () => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      });
      res.write('event: thinking\ndata: {"event":"thinking","text":"Thinking...","metadata":{"is_mock":true}}\n\n');
      // Deliberately split JSON frame across two chunks to verify SSE buffering
      res.write('event: chunk\ndata: {"event":"chunk","te');
      res.write('xt":"Hello from ","metadata":{"is_mock":true}}\n\n');
      res.write('event: chunk\ndata: {"event":"chunk","text":"F.R.I.D.A.Y.","metadata":{"is_mock":true}}\n\n');
      res.write('event: done\ndata: {"event":"done","text":"","metadata":{"is_mock":true}}\n\n');
      res.end();
    });
  });

  await new Promise((resolve) => mockAiServer.listen(0, '127.0.0.1', resolve));
  const aiPort = mockAiServer.address().port;
  const previousAiUrl = process.env.FRIDAY_AI_SERVICE_URL;
  process.env.FRIDAY_AI_SERVICE_URL = `http://127.0.0.1:${aiPort}`;

  const createdUserIds = [];

  try {
    // 1. Register owner (User A) and second user (User B)
    const userA = await authService.register({
      email: `friday_owner_${Date.now()}@friday.corp`,
      password: 'FridayTestSecret123!',
      name: 'Friday Owner'
    });
    createdUserIds.push(userA.user.id);

    const userB = await authService.register({
      email: `friday_other_${Date.now()}@friday.corp`,
      password: 'FridayTestSecret123!',
      name: 'Other User'
    });
    createdUserIds.push(userB.user.id);

    const tokenA = userA.tokens.accessToken;
    const tokenB = userB.tokens.accessToken;

    // 2. Create conversation as User A
    const createRes = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        modelPreference: 'claude-3-7-sonnet'
      })
    });
    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    const convId = createData.data.conversation.id;
    assert.ok(convId);

    // 3. List conversations with pagination metadata
    const listRes = await fetch(`${baseUrl}/conversations?limit=10&offset=0`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.data.conversations.some((c) => c.id === convId));
    assert.equal(typeof listData.data.pagination.total, 'number');

    // 4. Ownership isolation: User B must receive 403 on GET, POST message, DELETE
    const otherGetRes = await fetch(`${baseUrl}/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(otherGetRes.status, 403);

    const otherMsgRes = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({ content: 'Unauthorized probe' })
    });
    assert.equal(otherMsgRes.status, 403);

    const otherDeleteRes = await fetch(`${baseUrl}/conversations/${convId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(otherDeleteRes.status, 403);

    // 5. Send message & verify SSE streaming + internal service auth headers + DB persistence
    const msgRes = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'node-to-py-corr-1',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ content: 'Explain neural streaming architecture' })
    });
    assert.equal(msgRes.status, 200);
    assert.ok(msgRes.headers.get('content-type').includes('text/event-stream'));
    const sseBody = await msgRes.text();
    assert.ok(sseBody.includes('Hello from '));
    assert.ok(sseBody.includes('F.R.I.D.A.Y.'));

    assert.equal(observedUpstreamHeaders['x-internal-service-token'], config.INTERNAL_SERVICE_SECRET);
    assert.equal(observedUpstreamHeaders['x-user-id'], userA.user.id);
    assert.equal(observedUpstreamHeaders['x-request-id'], 'node-to-py-corr-1');

    // 6. Verify both user & assistant messages persisted + title auto-updated
    const getRes = await fetch(`${baseUrl}/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    const conv = getData.data.conversation;
    assert.equal(conv.title, 'Explain neural streaming architecture');
    assert.equal(conv.messages.length, 2);
    assert.equal(conv.messages[0].role, 'user');
    assert.equal(conv.messages[1].role, 'assistant');
    assert.equal(conv.messages[1].content, 'Hello from F.R.I.D.A.Y.');

    // 7. Owner can delete conversation cleanly
    const deleteRes = await fetch(`${baseUrl}/conversations/${convId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(deleteRes.status, 200);

    // 8. Unauthenticated request rejected
    const unauthRes = await fetch(`${baseUrl}/conversations`);
    assert.equal(unauthRes.status, 401);
  } finally {
    if (previousAiUrl === undefined) {
      delete process.env.FRIDAY_AI_SERVICE_URL;
    } else {
      process.env.FRIDAY_AI_SERVICE_URL = previousAiUrl;
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    mockAiServer.close();
    server.close();
  }
});
