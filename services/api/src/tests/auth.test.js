import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { app } from '../app.js';
import { prisma } from '../repositories/prisma.js';
import { config } from '../config/index.js';
import { hashPassword, verifyPassword } from '../security/crypto.js';

function extractCookieMap(res) {
  const rawList = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : [];
  const map = {};
  for (const raw of rawList) {
    const [pair] = raw.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) {
      map[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim());
    }
  }
  return map;
}

function buildCookieHeader(cookieMap) {
  return Object.entries(cookieMap)
    .filter(([, val]) => Boolean(val))
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('; ');
}

test('Security: Argon2id hashes and verifies passwords correctly', async () => {
  const password = 'SuperSecurePassword123!';
  const hash = await hashPassword(password);

  assert.ok(hash.startsWith('$argon2id$'), 'Hash should use the Argon2id variant');
  assert.equal(await verifyPassword(hash, password), true, 'Valid password must verify');
  assert.equal(await verifyPassword(hash, 'WrongPassword'), false, 'Invalid password must be rejected');
});

test('Auth API: Signup forces USER role, cookie/CSRF session lifecycle, refresh rotation, and RBAC', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/v1/auth`;
  const userEmail = `tony_${Date.now()}@stark.corp`;
  const adminEmail = `admin_${Date.now()}@stark.corp`;
  const createdUserIds = [];

  try {
    // 1. Validation failure: short password
    const badRegRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'short',
        name: 'Tony Stark'
      })
    });
    assert.equal(badRegRes.status, 400);

    // 2. Role escalation rejected on public registration
    const escalationRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'QuantumEncryption2026!',
        name: 'Tony Stark',
        role: 'ADMIN'
      })
    });
    assert.equal(escalationRes.status, 400, 'Public signup must reject role field');

    // 3. Valid public registration forces USER role
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'QuantumEncryption2026!',
        name: 'Tony Stark'
      })
    });
    assert.equal(regRes.status, 201);
    const regData = await regRes.json();
    assert.equal(regData.data.user.role, 'USER');
    const userId = regData.data.user.id;
    createdUserIds.push(userId);

    // 4. Mock & forged JWT tokens must be rejected with 401
    for (const badToken of [
      'mock_token_dev',
      'jwt_token_new',
      jwt.sign({ sub: userId, role: 'ADMIN', type: 'access' }, config.JWT_SECRET, {
        issuer: 'wrong-issuer',
        audience: config.JWT_AUDIENCE
      })
    ]) {
      const mockRes = await fetch(`${baseUrl}/me`, {
        headers: { Authorization: `Bearer ${badToken}` }
      });
      assert.equal(mockRes.status, 401, 'Mock or mismatched-issuer token must be rejected');
    }

    // 5. Login issues HttpOnly cookies + CSRF token
    const loginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userEmail,
        password: 'QuantumEncryption2026!'
      })
    });
    assert.equal(loginRes.status, 200);
    const cookies = extractCookieMap(loginRes);
    assert.ok(cookies[config.ACCESS_COOKIE_NAME], 'Access HttpOnly cookie should be set');
    assert.ok(cookies[config.REFRESH_COOKIE_NAME], 'Refresh HttpOnly cookie should be set');
    assert.ok(cookies[config.CSRF_COOKIE_NAME], 'CSRF cookie should be set');

    // 6. Session bootstrap (/me) succeeds via cookie alone
    const cookieMeRes = await fetch(`${baseUrl}/me`, {
      headers: { Cookie: buildCookieHeader(cookies) }
    });
    assert.equal(cookieMeRes.status, 200);
    const cookieMeData = await cookieMeRes.json();
    assert.equal(cookieMeData.data.user.email, userEmail);
    assert.equal(cookieMeData.data.user.role, 'USER');

    // 7. Cookie-based refresh without X-CSRF-Token is rejected with 403
    const oldRefreshToken = cookies[config.REFRESH_COOKIE_NAME];
    const noCsrfRefresh = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        Cookie: buildCookieHeader(cookies)
      }
    });
    assert.equal(noCsrfRefresh.status, 403);

    // 8. Cookie-based refresh WITH X-CSRF-Token rotates refresh token
    const refreshRes = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: {
        Cookie: buildCookieHeader(cookies),
        'X-CSRF-Token': cookies[config.CSRF_COOKIE_NAME]
      }
    });
    assert.equal(refreshRes.status, 200);
    const rotatedCookies = { ...cookies, ...extractCookieMap(refreshRes) };
    assert.notEqual(
      rotatedCookies[config.REFRESH_COOKIE_NAME],
      oldRefreshToken,
      'Refresh token must rotate on use'
    );

    // 9. Replay of previously rotated refresh token is rejected
    const replayRes = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: oldRefreshToken })
    });
    assert.equal(replayRes.status, 401);

    // 10. Non-admin cannot assign roles
    const nonAdminRoleRes = await fetch(`${baseUrl}/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: buildCookieHeader(rotatedCookies),
        'X-CSRF-Token': rotatedCookies[config.CSRF_COOKIE_NAME]
      },
      body: JSON.stringify({ role: 'DEVELOPER' })
    });
    assert.equal(nonAdminRoleRes.status, 403);

    // 11. Admin can assign roles via protected endpoint
    const adminPasswordHash = await hashPassword('AdminPassword2026!');
    const adminUser = await prisma.user.create({
      data: { email: adminEmail, name: 'Admin', passwordHash: adminPasswordHash, role: 'ADMIN' }
    });
    createdUserIds.push(adminUser.id);

    const adminLoginRes = await fetch(`${baseUrl}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: adminEmail, password: 'AdminPassword2026!' })
    });
    const adminData = await adminLoginRes.json();
    const adminToken = adminData.data.tokens.accessToken;

    const promoteRes = await fetch(`${baseUrl}/users/${userId}/role`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`
      },
      body: JSON.stringify({ role: 'DEVELOPER' })
    });
    assert.equal(promoteRes.status, 200);
    const promoteData = await promoteRes.json();
    assert.equal(promoteData.data.user.role, 'DEVELOPER');

    // 12. Logout revokes session so refresh fails afterwards
    const logoutRes = await fetch(`${baseUrl}/logout`, {
      method: 'POST',
      headers: {
        Cookie: buildCookieHeader(rotatedCookies),
        'X-CSRF-Token': rotatedCookies[config.CSRF_COOKIE_NAME]
      }
    });
    assert.equal(logoutRes.status, 200);

    const postLogoutRefresh = await fetch(`${baseUrl}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rotatedCookies[config.REFRESH_COOKIE_NAME] })
    });
    assert.equal(postLogoutRefresh.status, 401);
  } finally {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    server.close();
  }
});
