import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import server, { buildSanitizedEnv } from '../server.js';

const DEV_INTERNAL_SECRET =
  process.env.INTERNAL_SERVICE_SECRET || 'dev_internal_service_secret_change_in_prod';

function authHeaders(extra = {}) {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Service-Token': DEV_INTERNAL_SECRET,
    'X-User-Id': 'usr_runner_test',
    'X-Request-Id': 'req-runner-test-1',
    ...extra
  };
}

describe('Runner Host Service Hardening Tests', () => {
  let baseUrl = '';

  before(async () => {
    await new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise((resolve) => {
      server.close(() => resolve());
      if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
      }
    });
  });

  it('GET /v1/health reports execution unavailable until an isolated backend exists', async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'unavailable');
    assert.equal(body.executionEnabled, false);
    assert.equal(body.isolation, 'unavailable');
    assert.equal(body.port, undefined);
  });

  it('POST /v1/execute rejects missing or invalid internal auth credentials with 401', async () => {
    const noHeaders = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'echo unauthorized' })
    });
    assert.equal(noHeaders.status, 401);

    const badToken = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders({ 'X-Internal-Service-Token': 'wrong_token_value' }),
      body: JSON.stringify({ command: 'echo unauthorized' })
    });
    assert.equal(badToken.status, 401);

    const missingUser = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders({ 'X-User-Id': '' }),
      body: JSON.stringify({ command: 'echo unauthorized' })
    });
    assert.equal(missingUser.status, 401);
  });

  it('POST /v1/execute fails closed even for authenticated callers', async () => {
    const res = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ command: 'echo should-not-run' })
    });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.errorCode, 'ISOLATED_EXECUTION_UNAVAILABLE');
  });

  it('runner environment construction omits parent API secrets', async () => {
    const sanitized = buildSanitizedEnv({
      PATH: 'C:\\Windows\\System32',
      JWT_SECRET: 'super_secret_jwt_key',
      DATABASE_URL: 'mysql://root:pass@localhost/db',
      INTERNAL_SERVICE_SECRET: 'super_secret_internal_token'
    });
    assert.equal(sanitized.JWT_SECRET, undefined);
    assert.equal(sanitized.DATABASE_URL, undefined);
    assert.equal(sanitized.INTERNAL_SERVICE_SECRET, undefined);
    assert.equal(sanitized.EDITH_RUNNER_ENV, undefined);

  });
});
