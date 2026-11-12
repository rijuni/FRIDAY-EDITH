import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'path';
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

  it('GET /v1/health reports minimal healthy liveness without sensitive host paths', async () => {
    const res = await fetch(`${baseUrl}/v1/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'healthy');
    assert.match(body.isolation, /Strict Non-Docker/i);
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

  it('POST /v1/execute blocks outside cwd paths and hard-denied destructive commands', async () => {
    const outsideCwd = path.parse(process.cwd()).root;
    const cwdRes = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ command: 'echo hi', cwd: outsideCwd })
    });
    assert.equal(cwdRes.status, 403);
    const cwdBody = await cwdRes.json();
    assert.equal(cwdBody.errorCode, 'CWD_ACCESS_DENIED');

    const deniedRes = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ command: 'rmdir /s /q C:\\Windows' })
    });
    assert.equal(deniedRes.status, 403);
    const deniedBody = await deniedRes.json();
    assert.equal(deniedBody.errorCode, 'RUNNER_POLICY_DENIED');
  });

  it('POST /v1/execute runs authorized command cleanly without leaking parent API secrets', async () => {
    const sanitized = buildSanitizedEnv({
      PATH: 'C:\\Windows\\System32',
      JWT_SECRET: 'super_secret_jwt_key',
      DATABASE_URL: 'mysql://root:pass@localhost/db',
      INTERNAL_SERVICE_SECRET: 'super_secret_internal_token'
    });
    assert.equal(sanitized.JWT_SECRET, undefined);
    assert.equal(sanitized.DATABASE_URL, undefined);
    assert.equal(sanitized.INTERNAL_SERVICE_SECRET, undefined);
    assert.equal(sanitized.EDITH_RUNNER_ENV, 'isolated');

    const res = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ command: 'echo "EDITH_RUNNER_OK"' })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.exitCode, 0);
    assert.match(body.stdout, /EDITH_RUNNER_OK/);
    assert.equal(body.timedOut, false);
    assert.equal(body.truncated, false);
  });

  it('POST /v1/execute rejects oversized payloads (413) and terminates timed-out process trees cleanly', async () => {
    const hugeBody = JSON.stringify({ command: 'echo ok', extra: 'x'.repeat(70_000) });
    const oversizedRes = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: hugeBody
    });
    assert.equal(oversizedRes.status, 413);

    const sleepCmd =
      process.platform === 'win32'
        ? 'Start-Sleep -Milliseconds 3500'
        : 'sleep 3.5';
    const timeoutRes = await fetch(`${baseUrl}/v1/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ command: sleepCmd, timeoutMs: 500 })
    });
    assert.equal(timeoutRes.status, 200);
    const timeoutBody = await timeoutRes.json();
    assert.equal(timeoutBody.timedOut, true);
    assert.equal(timeoutBody.exitCode, -1);
  });
});
