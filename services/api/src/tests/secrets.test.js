import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../app.js';
import { prisma } from '../repositories/prisma.js';
import { config } from '../config/index.js';
import { encryptSecret, decryptSecret, maskSecret, deriveSecretKey } from '../security/crypto.js';
import { providerKeyService } from '../modules/secrets/providerKey.service.js';

function extractCookieMap(res) {
  const rawList = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
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

test('Secret Vault: AES-256-GCM authenticated encryption round-trip and tamper resistance', async () => {
  const plaintext = 'sk-ant-api03-live-test-super-secret-key-12345';
  
  // 1. Successful round-trip
  const envelope = encryptSecret(plaintext);
  assert.ok(envelope.startsWith('v1:'), 'Envelope must start with v1 version tag');
  const parts = envelope.split(':');
  assert.equal(parts.length, 5, 'Envelope must contain 5 segments (version, salt, iv, authTag, ciphertext)');
  
  const decrypted = decryptSecret(envelope);
  assert.equal(decrypted, plaintext, 'Decrypted secret must match original plaintext');

  // 2. Custom key encryption round-trip
  const customKey = 'my_super_secure_vault_passphrase_32_chars!';
  const customEnvelope = encryptSecret(plaintext, customKey);
  const customDecrypted = decryptSecret(customEnvelope, customKey);
  assert.equal(customDecrypted, plaintext);

  // 3. Key mismatch must fail closed
  assert.throws(
    () => decryptSecret(customEnvelope, 'different_wrong_key_for_testing_123'),
    /Secret decryption failed/i,
    'Decryption with wrong key must fail closed'
  );

  // 4. Tampered ciphertext must fail authenticated tag verification
  const [v, salt, iv, tag, ct] = parts;
  const flippedCt = (ct.startsWith('aa') ? 'bb' : 'aa') + ct.slice(2);
  const tamperedCtEnvelope = `${v}:${salt}:${iv}:${tag}:${flippedCt}`;
  assert.throws(
    () => decryptSecret(tamperedCtEnvelope),
    /Secret decryption failed/i,
    'Tampered ciphertext must fail authentication tag check'
  );

  // 5. Tampered auth tag must fail
  const flippedTag = (tag.startsWith('00') ? 'ff' : '00') + tag.slice(2);
  const tamperedTagEnvelope = `${v}:${salt}:${iv}:${flippedTag}:${ct}`;
  assert.throws(
    () => decryptSecret(tamperedTagEnvelope),
    /Secret decryption failed/i,
    'Tampered auth tag must fail verification'
  );

  // 6. Malformed envelopes must throw format error
  assert.throws(() => decryptSecret('not-an-envelope'), /Invalid secret envelope format/i);
  assert.throws(() => decryptSecret('v1:short'), /corrupt segments/i);
});

test('Secret Vault: Masking safeguards secrets in logs and UI', () => {
  assert.equal(maskSecret(''), '***');
  assert.equal(maskSecret(null), '***');
  assert.equal(maskSecret('12345'), '********');
  assert.equal(maskSecret('sk-ant-live-token-987654321'), 'sk-...4321');
  assert.equal(maskSecret('gemini_api_key_secure_9999'), '...9999');
});

test('Secret Vault: ProviderKeyService user isolation, persistence, and audit logging', async () => {
  const nonce = Date.now();
  const user1 = await prisma.user.create({
    data: {
      email: `vault_user1_${nonce}@stark.corp`,
      name: 'Vault Tester 1',
      passwordHash: 'dummy_hash',
      role: 'DEVELOPER'
    }
  });

  const user2 = await prisma.user.create({
    data: {
      email: `vault_user2_${nonce}@stark.corp`,
      name: 'Vault Tester 2',
      passwordHash: 'dummy_hash',
      role: 'DEVELOPER'
    }
  });

  try {
    const rawKey = 'sk-ant-api03-user1-live-secret-key-12345';
    
    // 1. User 1 saves a key
    const saved = await providerKeyService.setProviderKey({
      userId: user1.id,
      provider: 'anthropic',
      apiKey: rawKey,
      isDefault: true
    });
    assert.equal(saved.provider, 'anthropic');
    assert.equal(saved.isDefault, true);
    assert.equal(saved.maskedKey, 'sk-...2345');

    // 2. DB verification: stored value must be encrypted, NEVER plaintext
    const dbRecord = await prisma.providerKey.findUnique({
      where: { userId_provider: { userId: user1.id, provider: 'anthropic' } }
    });
    assert.ok(dbRecord);
    assert.ok(dbRecord.encryptedKey.startsWith('v1:'));
    assert.ok(!dbRecord.encryptedKey.includes(rawKey), 'Database must never contain plaintext API keys');

    // 3. User 1 can decrypt their key
    const decrypted = await providerKeyService.getDecryptedKey({
      userId: user1.id,
      provider: 'anthropic'
    });
    assert.equal(decrypted, rawKey);

    // 4. User 2 cannot access or list User 1's keys
    const user2Keys = await providerKeyService.listUserKeys({ userId: user2.id });
    assert.equal(user2Keys.length, 0);

    const user2Decrypted = await providerKeyService.getDecryptedKey({
      userId: user2.id,
      provider: 'anthropic'
    });
    assert.equal(user2Decrypted, null);

    // 5. Active key resolution preference (Vault over Env)
    process.env.ANTHROPIC_API_KEY = 'server_env_fallback_key';
    const resolvedUser1 = await providerKeyService.resolveActiveKey({
      userId: user1.id,
      provider: 'anthropic'
    });
    assert.equal(resolvedUser1.source, 'user_vault');
    assert.equal(resolvedUser1.key, rawKey);

    const resolvedUser2 = await providerKeyService.resolveActiveKey({
      userId: user2.id,
      provider: 'anthropic'
    });
    assert.equal(resolvedUser2.source, 'server_env');
    assert.equal(resolvedUser2.key, 'server_env_fallback_key');

    // 6. Delete key
    await providerKeyService.deleteProviderKey({
      userId: user1.id,
      provider: 'anthropic'
    });
    const afterDelete = await providerKeyService.getDecryptedKey({
      userId: user1.id,
      provider: 'anthropic'
    });
    assert.equal(afterDelete, null);
  } finally {
    delete process.env.ANTHROPIC_API_KEY;
    await prisma.providerKey.deleteMany({ where: { userId: { in: [user1.id, user2.id] } } });
    await prisma.auditLog.deleteMany({ where: { userId: { in: [user1.id, user2.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [user1.id, user2.id] } } });
  }
});

test('Secret Vault: REST API endpoints for provider keys (/v1/auth/provider-keys)', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/v1/auth`;
  const email = `vault_api_${Date.now()}@stark.corp`;
  let userId;

  try {
    // 1. Register & login
    const regRes = await fetch(`${baseUrl}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!', name: 'Vault API User' })
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    userId = regBody.data.user.id;

    const cookieMap = extractCookieMap(regRes);
    const csrfToken = cookieMap.friday_csrf_token;
    const cookieHeader = buildCookieHeader(cookieMap);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
      'X-CSRF-Token': csrfToken
    };

    // 2. Unauthenticated GET rejected
    const unauthRes = await fetch(`${baseUrl}/provider-keys`);
    assert.equal(unauthRes.status, 401);

    // 3. Save Anthropic key
    const saveRes = await fetch(`${baseUrl}/provider-keys`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-live-vault-api-key-9999',
        isDefault: true
      })
    });
    assert.equal(saveRes.status, 201);
    const saveBody = await saveRes.json();
    assert.equal(saveBody.data.key.provider, 'anthropic');
    assert.equal(saveBody.data.key.maskedKey, 'sk-...9999');

    // 4. List keys
    const listRes = await fetch(`${baseUrl}/provider-keys`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.data.keys.length, 1);
    assert.equal(listBody.data.keys[0].provider, 'anthropic');
    assert.equal(listBody.data.keys[0].maskedKey, 'sk-...9999');

    // 5. Delete key
    const deleteRes = await fetch(`${baseUrl}/provider-keys/anthropic`, {
      method: 'DELETE',
      headers: authHeaders
    });
    assert.equal(deleteRes.status, 200);

    // 6. Verify list empty after delete
    const listEmptyRes = await fetch(`${baseUrl}/provider-keys`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(listEmptyRes.status, 200);
    const listEmptyBody = await listEmptyRes.json();
    assert.equal(listEmptyBody.data.keys.length, 0);
  } finally {
    server.close();
    if (userId) {
      await prisma.providerKey.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
});

test('Acceptance 6-03: Rotating JWT_SECRET does not affect or invalidate vaulted provider keys', async () => {
  const nonce = Date.now();
  const user = await prisma.user.create({
    data: {
      email: `vault_jwt_rotation_${nonce}@stark.corp`,
      name: 'Vault Rotation Tester',
      passwordHash: 'dummy_hash',
      role: 'DEVELOPER'
    }
  });

  const rawKey = 'sk-ant-live-secret-key-will-survive-jwt-rotation-99999';

  try {
    // 1. Store key with current configuration
    await providerKeyService.setProviderKey({
      userId: user.id,
      provider: 'anthropic',
      apiKey: rawKey
    });

    // 2. Verify key can be decrypted initially
    const initialDecrypted = await providerKeyService.getDecryptedKey({
      userId: user.id,
      provider: 'anthropic'
    });
    assert.equal(initialDecrypted, rawKey);

    // 3. Rotate JWT_SECRET to a completely new value
    const originalJwtSecret = config.JWT_SECRET;
    try {
      config.JWT_SECRET = 'completely_new_rotated_jwt_secret_value_for_testing_only!!';

      // 4. Attempt to decrypt key after JWT_SECRET rotation
      const afterRotationDecrypted = await providerKeyService.getDecryptedKey({
        userId: user.id,
        provider: 'anthropic'
      });
      assert.equal(
        afterRotationDecrypted,
        rawKey,
        'Decryption must remain valid after JWT_SECRET rotation because derivation uses ENCRYPTION_MASTER_KEY'
      );
    } finally {
      config.JWT_SECRET = originalJwtSecret;
    }
  } finally {
    await prisma.providerKey.deleteMany({ where: { userId: user.id } });
    await prisma.auditLog.deleteMany({ where: { userId: user.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  }
});

test('Acceptance 6-02: Vault-only model discovery marks models available (configuredBy: user_vault)', async () => {
  const server = app.listen(0);
  const port = server.address().port;
  const baseUrl = `http://localhost:${port}/v1`;
  const email = `vault_discovery_${Date.now()}@stark.corp`;
  let userId;

  try {
    // 1. Register & login
    const regRes = await fetch(`${baseUrl}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'StrongPassword123!', name: 'Vault Discovery User' })
    });
    assert.equal(regRes.status, 201);
    const regBody = await regRes.json();
    userId = regBody.data.user.id;

    const cookieMap = extractCookieMap(regRes);
    const csrfToken = cookieMap.friday_csrf_token;
    const cookieHeader = buildCookieHeader(cookieMap);

    const authHeaders = {
      'Content-Type': 'application/json',
      'Cookie': cookieHeader,
      'X-CSRF-Token': csrfToken
    };

    // 2. Save Anthropic key into user's vault
    const saveRes = await fetch(`${baseUrl}/auth/provider-keys`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        provider: 'anthropic',
        apiKey: 'sk-ant-api03-user-vault-discovery-key-8888',
        isDefault: true
      })
    });
    assert.equal(saveRes.status, 201);

    // 3. Query GET /v1/friday/models
    const modelsRes = await fetch(`${baseUrl}/friday/models`, {
      method: 'GET',
      headers: authHeaders
    });
    assert.equal(modelsRes.status, 200);
    const modelsBody = await modelsRes.json();
    assert.ok(modelsBody?.data?.models, 'Models array must be returned');

    // 4. Verify that claude model is marked isAvailable: true and configuredBy: 'user_vault'
    const claudeModel = modelsBody.data.models.find((m) => m.id === 'claude-3-7-sonnet');
    assert.ok(claudeModel, 'Claude 3.7 model must be present');
    assert.equal(claudeModel.isAvailable, true, 'Claude model must be marked available for user with vaulted key');
    assert.equal(claudeModel.configuredBy, 'user_vault', 'Claude model configuredBy must be user_vault');
    assert.ok(modelsBody.data.user_configured_providers.includes('anthropic'), 'user_configured_providers must include anthropic');
  } finally {
    server.close();
    if (userId) {
      await prisma.providerKey.deleteMany({ where: { userId } });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
  }
});
