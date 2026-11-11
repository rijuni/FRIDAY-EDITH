import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../app.js';
import { hashPassword, verifyPassword } from '../security/crypto.js';

test('Security: Argon2id hashes and verifies passwords correctly', async () => {
  const password = 'SuperSecurePassword123!';
  const hash = await hashPassword(password);

  assert.ok(hash.startsWith('$argon2id$'), 'Hash should use the Argon2id variant');

  const isValid = await verifyPassword(hash, password);
  assert.equal(isValid, true, 'Valid password must verify');

  const isInvalid = await verifyPassword(hash, 'WrongPassword');
  assert.equal(isInvalid, false, 'Invalid password must be rejected');
});

test('Auth API: Registration, Login and Protected Profile flow', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/v1/auth`;

  try {
    // 1. Validation failure: Short password
    const badRegRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dev@friday.ai',
        password: 'short',
        name: 'Tony Stark'
      })
    });
    assert.equal(badRegRes.status, 400);

    // 2. Successful Registration
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tony@stark.corp',
        password: 'QuantumEncryption2026!',
        name: 'Tony Stark',
        role: 'DEVELOPER'
      })
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.equal(regData.status, 'success');
    assert.equal(regData.data.user.email, 'tony@stark.corp');
    assert.ok(regData.data.tokens.accessToken);

    // 3. Successful Login
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'tony@stark.corp',
        password: 'QuantumEncryption2026!'
      })
    });
    assert.equal(loginRes.status, 200);
    const loginData = await loginRes.json();
    const token = loginData.data.tokens.accessToken;
    assert.ok(token);

    // 4. Access Protected Route with Bearer Token
    const meRes = await fetch(`${baseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.data.user.email, 'tony@stark.corp');
    assert.equal(meData.data.user.role, 'DEVELOPER');

    // 5. Unauthenticated request rejected
    const unauthRes = await fetch(`${baseUrl}/me`);
    assert.equal(unauthRes.status, 401);
  } finally {
    server.close();
  }
});
