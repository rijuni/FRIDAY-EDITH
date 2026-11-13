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
  let observedChatPayload = null;
  let failRetryOnce = true;
  const mockAiServer = http.createServer((req, res) => {
    observedUpstreamHeaders = req.headers;
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const rawBody = Buffer.concat(chunks).toString('utf8');
      if (req.url === '/v1/health/ready' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ready' }));
        return;
      }

      if (req.url === '/v1/chat/models' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'success', data: { provider_mode: 'mock', models: [{ id: 'claude-3-7-sonnet', label: 'Mock · Claude-style' }] } }));
        return;
      }

      if (req.url === '/v1/documents/parse' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            status: 'success',
            data: {
              filename: 'notes.md',
              mime_type: 'text/markdown',
              total_chars: 76,
              chunk_count: 1,
              chunks: [{ chunk_index: 0, text: '# Authentication\nSecure tokens and neural streaming architecture.', char_count: 66 }]
            }
          })
        );
        return;
      }

      try {
        observedChatPayload = JSON.parse(rawBody || '{}');
      } catch {
        observedChatPayload = null;
      }

      if (req.url === '/v1/chat/stream' && failRetryOnce && observedChatPayload?.messages?.at(-1)?.content?.includes('Retry after temporary provider outage')) {
        failRetryOnce = false;
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'error', errorCode: 'PROVIDER_UNAVAILABLE', message: 'Provider unavailable' }));
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache'
      });
      res.write('event: citations\ndata: {"event":"citations","metadata":{"citations":[{"id":"chunk-1","source":"Personal/notes.md","knowledgeBaseId":"kb-test","chunkIndex":0,"label":"S1"}]}}\n\n');
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

    const modelsRes = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${tokenA}` } });
    assert.equal(modelsRes.status, 200);
    assert.equal((await modelsRes.json()).data.provider_mode, 'mock');

    const kbRes = await fetch(`${baseUrl}/knowledge-bases`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ name: 'Personal', description: 'Private test corpus' })
    });
    assert.equal(kbRes.status, 201);
    const knowledgeBaseId = (await kbRes.json()).data.knowledgeBase.id;
    const ingestRes = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBaseId}/documents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ filename: 'notes.md', mimeType: 'text/markdown', content: Buffer.from('# Authentication\nSecure tokens remain private.').toString('base64'), encoding: 'base64' })
    });
    assert.equal(ingestRes.status, 201);
    assert.equal((await ingestRes.json()).data.document.chunkCount, 1);
    const documentsRes = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBaseId}/documents`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal((await documentsRes.json()).data.documents[0].filename, 'notes.md');
    const crossUserKbRes = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBaseId}/documents`, {
      headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(crossUserKbRes.status, 404);

    const memoryRes = await fetch(`${baseUrl}/memory`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ category: 'user_preference', content: 'Prefers concise answers.' })
    });
    assert.equal(memoryRes.status, 201);
    const memoryId = (await memoryRes.json()).data.memory.id;

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

    // 5a. Profile update, runtime status & support report endpoints
    const profileRes = await fetch(`http://localhost:${port}/v1/auth/me`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({ name: 'Tony Updated' })
    });
    assert.equal(profileRes.status, 200);
    const profileData = await profileRes.json();
    assert.equal(profileData.data.user.name, 'Tony Updated');

    const statusRes = await fetch(`${baseUrl}/status`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.data.subsystems.api.status, 'online');
    assert.equal(statusData.data.subsystems.database.status, 'online');
    assert.equal(statusData.data.subsystems.fridayAi.status, 'online');

    const supportRes = await fetch(`${baseUrl}/support`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        category: 'bug',
        subject: 'Sample verification issue',
        description: 'Testing support ticket persistence in Prisma AuditLog.'
      })
    });
    assert.equal(supportRes.status, 201);
    const supportData = await supportRes.json();
    assert.match(supportData.data.report.id, /^SUP-/);

    // 5b. Attach file cleanly through document parser & reject cross-user upload
    const otherAttachRes = await fetch(`${baseUrl}/conversations/${convId}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenB}`
      },
      body: JSON.stringify({
        filename: 'notes.md',
        mimeType: 'text/markdown',
        content: Buffer.from('# Test Notes\nAttach content.').toString('base64'),
        encoding: 'base64'
      })
    });
    assert.equal(otherAttachRes.status, 403);

    const attachRes = await fetch(`${baseUrl}/conversations/${convId}/attachments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        filename: 'notes.md',
        mimeType: 'text/markdown',
        content: '# Test Notes\nAttach content.'
      })
    });
    assert.equal(attachRes.status, 201);
    const attachData = await attachRes.json();
    const attachmentId = attachData.data.attachment.id;
    assert.equal(attachData.data.attachment.filename, 'notes.md');

    // 5c. Send message with attachmentIds & verify SSE streaming + internal service auth headers + DB persistence
    const msgRes = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': 'node-to-py-corr-1',
        Authorization: `Bearer ${tokenA}`
      },
      body: JSON.stringify({
        content: 'Explain neural streaming architecture',
        attachmentIds: [attachmentId]
      })
    });
    assert.equal(msgRes.status, 200);
    assert.ok(msgRes.headers.get('content-type').includes('text/event-stream'));
    const sseBody = await msgRes.text();
    assert.ok(sseBody.includes('Hello from '));
    assert.ok(sseBody.includes('F.R.I.D.A.Y.'));

    assert.equal(observedUpstreamHeaders['x-internal-service-token'], config.INTERNAL_SERVICE_SECRET);
    assert.equal(observedUpstreamHeaders['x-user-id'], userA.user.id);
    assert.equal(observedUpstreamHeaders['x-request-id'], 'node-to-py-corr-1');
    assert.match(observedChatPayload.messages.at(-1).content, /\[Attached File: notes\.md/);
    assert.equal(observedChatPayload.knowledge_chunks.length, 1);
    assert.equal(observedChatPayload.knowledge_chunks[0].knowledge_base_id, knowledgeBaseId);
    assert.equal(observedChatPayload.memories[0].id, memoryId);

    // 6. Verify both user & assistant messages + attachments persisted + title auto-updated
    const getRes = await fetch(`${baseUrl}/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    const conv = getData.data.conversation;
    assert.equal(conv.title, 'Explain neural streaming architecture');
    assert.equal(conv.messages.length, 2);
    assert.equal(conv.messages[0].role, 'user');
    assert.equal(conv.messages[0].attachments.length, 1);
    assert.equal(conv.messages[0].attachments[0].filename, 'notes.md');
    assert.equal(conv.messages[1].role, 'assistant');
    assert.equal(conv.messages[1].content, 'Hello from F.R.I.D.A.Y.');
    assert.equal(JSON.parse(conv.messages[1].metadata).citations[0].label, 'S1');

    const retryPrompt = 'Retry after temporary provider outage';
    const failedSend = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ content: retryPrompt })
    });
    assert.equal(failedSend.status, 503);
    const retrySend = await fetch(`${baseUrl}/conversations/${convId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ content: retryPrompt })
    });
    assert.equal(retrySend.status, 200);
    const retryTranscript = await retrySend.text();
    assert.ok(retryTranscript.includes('Hello from '));
    const retryConversation = await prisma.conversation.findUnique({
      where: { id: convId }, include: { messages: { orderBy: { createdAt: 'asc' } } }
    });
    assert.equal(retryConversation.messages.length, 4, 'retry must reuse the saved user message instead of duplicating it');

    const otherMemoryDelete = await fetch(`${baseUrl}/memory/${memoryId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${tokenB}` }
    });
    assert.equal(otherMemoryDelete.status, 404);
    const deleteMemoryRes = await fetch(`${baseUrl}/memory/${memoryId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(deleteMemoryRes.status, 200);
    const deleteDocumentRes = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBaseId}/documents`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenA}` },
      body: JSON.stringify({ filename: 'notes.md' })
    });
    assert.equal(deleteDocumentRes.status, 200);
    const documentsAfterDelete = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBaseId}/documents`, {
      headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal((await documentsAfterDelete.json()).data.documents.length, 0);
    const deleteKbRes = await fetch(`${baseUrl}/knowledge-bases/${knowledgeBaseId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${tokenA}` }
    });
    assert.equal(deleteKbRes.status, 200);

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
