import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../app.js';
import { authService } from '../modules/auth/auth.service.js';

test('F.R.I.D.A.Y. API: Conversation lifecycle and authorization', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/v1/friday`;

  try {
    // 1. Register test user
    const userRes = await authService.register({
      email: `friday_tester_${Date.now()}@friday.corp`,
      password: 'FridayTestSecret123!',
      name: 'Friday Tester'
    });
    const token = userRes.tokens.accessToken;

    // 2. Create conversation
    const createRes = await fetch(`${baseUrl}/conversations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        title: 'Nebula UI Research Session',
        modelPreference: 'claude-3-7-sonnet'
      })
    });

    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.status, 'success');
    const convId = createData.data.conversation.id;
    assert.ok(convId);

    // 3. List conversations
    const listRes = await fetch(`${baseUrl}/conversations`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.ok(listData.data.conversations.length >= 1);

    // 4. Get conversation by ID
    const getRes = await fetch(`${baseUrl}/conversations/${convId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.data.conversation.id, convId);
    assert.equal(getData.data.conversation.title, 'Nebula UI Research Session');

    // 5. Unauthenticated rejection
    const unauthRes = await fetch(`${baseUrl}/conversations`);
    assert.equal(unauthRes.status, 401);
  } finally {
    server.close();
  }
});

