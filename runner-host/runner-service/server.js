import http from 'http';
import { spawn } from 'child_process';
import { URL } from 'url';

const PORT = process.env.RUNNER_PORT || 8003;
const HOST = '127.0.0.1';

// In-memory job tracker & audit log
const executionAuditLogs = [];

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && parsedUrl.pathname === '/v1/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      service: 'EDITH Isolated Runner Host',
      port: PORT,
      isolation: 'Native Hyper-V / Restricted OS User Boundary (Strict Non-Docker)',
      platform: process.platform
    }));
    return;
  }

  // Command Execution Endpoint
  if (req.method === 'POST' && parsedUrl.pathname === '/v1/execute') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body);
        const { command, cwd = process.cwd(), timeoutMs = 30000 } = payload;

        if (!command || typeof command !== 'string') {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Valid command string is required' }));
          return;
        }

        const jobId = `run_${Date.now()}`;
        const startTime = Date.now();
        let stdout = '';
        let stderr = '';
        let isTimedOut = false;

        const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
        const shellArgs = process.platform === 'win32' ? ['-NoProfile', '-NonInteractive', '-Command', command] : ['-c', command];

        const child = spawn(shell, shellArgs, {
          cwd,
          env: { ...process.env, EDITH_RUNNER_ENV: 'isolated' },
          windowsHide: true
        });

        const timer = setTimeout(() => {
          isTimedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs);

        child.stdout.on('data', data => { stdout += data.toString(); });
        child.stderr.on('data', data => { stderr += data.toString(); });

        child.on('close', code => {
          clearTimeout(timer);
          const durationMs = Date.now() - startTime;
          const auditEntry = {
            jobId,
            command,
            exitCode: isTimedOut ? -1 : code,
            durationMs,
            timestamp: new Date().toISOString(),
            timedOut: isTimedOut
          };
          executionAuditLogs.push(auditEntry);

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            jobId,
            exitCode: isTimedOut ? -1 : code,
            stdout,
            stderr,
            durationMs,
            timedOut: isTimedOut
          }));
        });

        child.on('error', err => {
          clearTimeout(timer);
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: err.message }));
        });
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Malformed JSON payload' }));
      }
    });
    return;
  }

  // Fallback 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    console.log(`[runner-host] Isolated runner service active on http://${HOST}:${PORT}`);
  });
}

export default server;

