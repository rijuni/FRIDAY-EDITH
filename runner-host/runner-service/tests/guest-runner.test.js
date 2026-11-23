import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createGuestRunnerServer, buildGuestSanitizedEnv, MAX_OUTPUT_BYTES } from '../../guest/runner-daemon.js';

const TEST_SECRET = 'guest_runner_unit_test_secret_12345';

describe('Phase 5 Guest Runner Daemon Specification Tests', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createGuestRunnerServer({ secret: TEST_SECRET });
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

  function authHeaders(extra = {}) {
    return {
      'Content-Type': 'application/json',
      'X-Internal-Service-Token': TEST_SECRET,
      ...extra
    };
  }

  it('P5-01: GET /health returns readiness attestation and capability flags', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'ready');
    assert.equal(body.guest, true);
    assert.equal(body.isolated, true);
    assert.ok(body.platform);
    assert.ok(body.arch);
    assert.ok(Array.isArray(body.capabilities));
    assert.ok(body.capabilities.includes('bounded_output'));
    assert.ok(body.capabilities.includes('tree_kill'));
  });

  it('Authentication: Rejects requests missing valid service token with 401', async () => {
    const unauthRes = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'echo should-fail' })
    });
    assert.equal(unauthRes.status, 401);

    const badTokenRes = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: authHeaders({ 'X-Internal-Service-Token': 'invalid_secret' }),
      body: JSON.stringify({ command: 'echo should-fail' })
    });
    assert.equal(badTokenRes.status, 401);
  });

  it('Execution: Executes safe command and captures bounded stdout', async () => {
    const isWin = process.platform === 'win32';
    const testCommand = isWin ? 'Write-Output "guest execution verified"' : 'echo "guest execution verified"';
    const res = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jobId: 'job-test-01',
        command: testCommand
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'success');
    assert.equal(body.jobId, 'job-test-01');
    assert.equal(body.exitCode, 0);
    assert.ok(body.stdout.includes('guest execution verified'));
    assert.equal(body.timedOut, false);
    assert.equal(body.killed, false);
  });

  it('Execution: Non-zero exit code reporting', async () => {
    const res = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jobId: 'job-test-02',
        command: 'exit 42'
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.exitCode, 42);
  });

  it('Security: Destructive command patterns blocked by guest policy', async () => {
    const res = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jobId: 'job-test-blocked',
        command: 'rmdir /s /q C:\\'
      })
    });

    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.errorCode, 'COMMAND_DENIED');
  });

  it('P5-04: Sanitized environment completely excludes parent host secrets', async () => {
    const dirtyEnv = {
      PATH: process.env.PATH || 'C:\\Windows\\System32',
      JWT_SECRET: 'leaked_host_jwt_secret',
      DATABASE_URL: 'mysql://root:pass@localhost:3306/prod_db',
      INTERNAL_SERVICE_SECRET: 'host_internal_service_token',
      ANTHROPIC_API_KEY: 'sk-ant-host-key-should-not-exist',
      OPENAI_API_KEY: 'sk-openai-host-key',
      GEMINI_API_KEY: 'gemini-host-key',
      CUSTOM_SAFE_VAR: 'hello_guest'
    };

    const sanitized = buildGuestSanitizedEnv(dirtyEnv, { JOB_PROP: 'active' });
    assert.equal(sanitized.JWT_SECRET, undefined);
    assert.equal(sanitized.DATABASE_URL, undefined);
    assert.equal(sanitized.INTERNAL_SERVICE_SECRET, undefined);
    assert.equal(sanitized.ANTHROPIC_API_KEY, undefined);
    assert.equal(sanitized.OPENAI_API_KEY, undefined);
    assert.equal(sanitized.GEMINI_API_KEY, undefined);
    assert.equal(sanitized.CI, 'true');
    assert.equal(sanitized.EDITH_SANDBOX, '1');
    assert.equal(sanitized.JOB_PROP, 'active');
  });

  it('P5-06: Timeout enforcement kills child process tree', async () => {
    const isWin = process.platform === 'win32';
    const sleepCmd = isWin ? 'Start-Sleep -Seconds 15' : 'sleep 15';
    const start = Date.now();
    const res = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jobId: 'job-test-timeout',
        command: sleepCmd,
        timeoutMs: 1000
      })
    });

    const elapsed = Date.now() - start;
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, 'timeout');
    assert.equal(body.timedOut, true);
    assert.equal(body.killed, true);
    assert.ok(elapsed < 8000, `Execution should be terminated close to timeout, took ${elapsed}ms`);
  });

  it('Bounded Output: Truncates high-volume output at 256 KB limit', async () => {
    const isWin = process.platform === 'win32';
    const largeOutputCmd = isWin ? '[string]::new("X", 300000)' : 'head -c 300000 < /dev/zero | tr "\\0" "X"';
    const res = await fetch(`${baseUrl}/job/execute`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jobId: 'job-test-buffer',
        command: largeOutputCmd
      })
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.stdout.length <= MAX_OUTPUT_BYTES + 100, `Output length ${body.stdout.length} should be bounded near ${MAX_OUTPUT_BYTES}`);
    assert.ok(body.stdout.includes('output truncated at 256 KB limit'));
  });
});
