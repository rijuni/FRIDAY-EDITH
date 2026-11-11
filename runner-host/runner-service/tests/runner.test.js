import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'node:http';
import server from '../server.js';

describe('Runner Host Service Tests (Port 8003)', () => {
  const TEST_PORT = 8093;

  before((done) => {
    server.listen(TEST_PORT, '127.0.0.1', done);
  });

  after((done) => {
    server.close(done);
  });

  it('GET /v1/health should report healthy status and non-docker isolation', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/v1/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'healthy');
    assert.match(body.isolation, /Strict Non-Docker/i);
  });

  it('POST /v1/execute should execute a safe command and return stdout', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/v1/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'echo "EDITH_RUNNER_OK"' })
    });

    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.exitCode, 0);
    assert.match(body.stdout, /EDITH_RUNNER_OK/);
  });
});

