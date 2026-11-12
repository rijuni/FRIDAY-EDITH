import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../app.js';
import { config } from '../config/index.js';
import { prisma } from '../repositories/prisma.js';
import { authService } from '../modules/auth/auth.service.js';

function startServer(server) {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => {
    if (!server.listening) return resolve();
    server.close(() => resolve());
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
  });
}

test('E.D.I.T.H. API: Internal service auth headers, fail-closed policy enforcement, and zero fake fallbacks', async () => {
  const observedEngineCalls = [];
  const observedRunnerCalls = [];

  const mockEngine = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      observedEngineCalls.push({ url: req.url, headers: req.headers, body });

      if (req.url === '/v1/agent/policies/evaluate') {
        const cmd = String(body.command || '');
        if (cmd.includes('rm -rf')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              command: cmd,
              decision: 'DENIED',
              reason: 'Prohibited destructive operation',
              risk_score: 100
            })
          );
          return;
        }
        if (cmd.startsWith('npm install')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              command: cmd,
              decision: 'CONFIRMATION_REQUIRED',
              reason: 'Mutates dependencies',
              risk_score: 60
            })
          );
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            command: cmd,
            decision: 'SAFE',
            reason: 'Safe verification command',
            risk_score: 10
          })
        );
        return;
      }

      if (req.url === '/v1/agent/diff/apply') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            original_checksum: 'aaa',
            modified_checksum: 'bbb',
            modified_content: 'applied_content',
            hunks_applied: 1
          })
        );
        return;
      }

      res.writeHead(404);
      res.end();
    });
  });

  const mockRunner = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : {};
      observedRunnerCalls.push({ url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          jobId: 'job_test_1',
          exitCode: 0,
          stdout: `Ran ${body.command}`,
          stderr: '',
          durationMs: 11
        })
      );
    });
  });

  let apiServer = null;

  const prevEngine = process.env.EDITH_ENGINE_URL;
  const prevRunner = process.env.RUNNER_HOST_URL;

  const createdUserIds = [];

  try {
    const enginePort = await startServer(mockEngine);
    const runnerPort = await startServer(mockRunner);
    apiServer = app.listen(0, '127.0.0.1');
    const apiPort = await new Promise((resolve) => {
      if (apiServer.listening) return resolve(apiServer.address().port);
      apiServer.once('listening', () => resolve(apiServer.address().port));
    });
    const baseUrl = `http://127.0.0.1:${apiPort}/v1/edith`;

    process.env.EDITH_ENGINE_URL = `http://127.0.0.1:${enginePort}`;
    process.env.RUNNER_HOST_URL = `http://127.0.0.1:${runnerPort}`;
    const email = `edith_test_${Date.now()}@edith.corp`;
    const password = 'StrongPassword#2026';
    const registered = await authService.register({
      email,
      password,
      name: 'Edith Engineer'
    });
    createdUserIds.push(registered.user.id);
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${registered.tokens.accessToken}`,
      'X-Request-Id': 'edith-corr-1'
    };

    // 1. Unauthenticated access rejected
    const unauth = await fetch(`${baseUrl}/policies/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: 'git status' })
    });
    assert.equal(unauth.status, 401);

    // 2. Denied command blocked 403 and never hits runner
    const denied = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: 'rm -rf /', approved: true })
    });
    assert.equal(denied.status, 403);
    assert.equal(observedRunnerCalls.length, 0);

    // 3. Mutating command without approval returns 409 APPROVAL_REQUIRED and never hits runner
    const needsApproval = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: 'npm install zod' })
    });
    assert.equal(needsApproval.status, 409);
    const needsApprovalJson = await needsApproval.json();
    assert.equal(needsApprovalJson.errorCode, 'APPROVAL_REQUIRED');
    assert.equal(observedRunnerCalls.length, 0);

    // 4. Approved mutating command executes via runner with internal auth headers
    const approvedExec = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: 'npm install zod', approved: true })
    });
    assert.equal(approvedExec.status, 200);
    const execJson = await approvedExec.json();
    assert.equal(execJson.exitCode, 0);
    assert.equal(observedRunnerCalls.length, 1);
    assert.equal(observedRunnerCalls[0].headers['x-internal-service-token'], config.INTERNAL_SERVICE_SECRET);
    assert.equal(observedRunnerCalls[0].headers['x-user-id'], registered.user.id);

    // 5. Internal headers forwarded to Python engine
    const applyRes = await fetch(`${baseUrl}/diff/apply`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ original_content: 'a', patch_text: 'b' })
    });
    assert.equal(applyRes.status, 200);
    const lastEngineCall = observedEngineCalls.at(-1);
    assert.equal(lastEngineCall.headers['x-internal-service-token'], config.INTERNAL_SERVICE_SECRET);
    assert.equal(lastEngineCall.headers['x-user-id'], registered.user.id);
    assert.equal(lastEngineCall.headers['x-request-id'], 'edith-corr-1');

    // 6. When engine goes offline, execute fails closed with 502 instead of fake 200 fallback
    await closeServer(mockEngine);
    const failClosed = await fetch(`${baseUrl}/execute`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ command: 'git status' })
    });
    assert.equal(failClosed.status, 502);
  } finally {
    if (prevEngine === undefined) delete process.env.EDITH_ENGINE_URL;
    else process.env.EDITH_ENGINE_URL = prevEngine;
    if (prevRunner === undefined) delete process.env.RUNNER_HOST_URL;
    else process.env.RUNNER_HOST_URL = prevRunner;

    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await Promise.all([
      closeServer(mockEngine),
      closeServer(mockRunner),
      apiServer ? closeServer(apiServer) : Promise.resolve()
    ]);
  }
});
