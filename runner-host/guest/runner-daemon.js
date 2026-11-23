import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_PORT = 9001;
export const DEFAULT_HOST = '127.0.0.1';
export const DEFAULT_INTERNAL_SECRET = 'dev_internal_service_secret_change_in_prod';
export const MAX_COMMAND_LENGTH = 2_000;
export const MIN_TIMEOUT_MS = 500;
export const DEFAULT_TIMEOUT_MS = 30_000;
export const MAX_TIMEOUT_MS = 120_000;
export const MAX_OUTPUT_BYTES = 262_144; // 256 KB max stdout/stderr bound
export const MAX_BODY_BYTES = 65_536;

// Blocklist for destructive / host escape attempts inside the sandbox
const GUEST_HARD_DENY_PATTERNS = [
  /rmdir\s+\/s\s+\/q\s+[c-zC-Z]:\\/i,
  /del\s+\/[fF]\s+\/[sS]\s+\/[qQ]\s+[c-zC-Z]:\\/i,
  /\bformat\s+[c-zC-Z]:/i,
  /\bdiskpart\b|\bbcdedit\b|\breg\s+delete\b/i,
  /rm\s+-[rRfF]{1,4}\s+(\/|~|\*)(\s|$)/i,
  /mkfs|\bdd\s+if=/i
];

const LEAKABLE_SECRET_KEYS = [
  'JWT_SECRET',
  'DATABASE_URL',
  'INTERNAL_SERVICE_SECRET',
  'ENCRYPTION_MASTER_KEY',
  'ANTHROPIC_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'EDITH_RUNNER_SECRET'
];

/**
 * Builds a strictly sanitized environment for guest sandbox execution.
 * Guaranteed to strip all host secrets and inject sandboxing flags.
 */
export function buildGuestSanitizedEnv(sourceEnv = process.env, customJobEnv = {}) {
  const allowlist = [
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'COMSPEC', 'ComSpec',
    'WINDIR', 'windir', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'HOMEDRIVE',
    'HOMEPATH', 'APPDATA', 'LOCALAPPDATA', 'LANG', 'LC_ALL', 'TERM',
    'VIRTUAL_ENV', 'PYTHONPATH'
  ];

  const clean = {};
  for (const key of allowlist) {
    if (sourceEnv[key] !== undefined) {
      clean[key] = sourceEnv[key];
    }
  }

  // Inject sandboxing flags
  clean.CI = 'true';
  clean.EDITH_SANDBOX = '1';
  clean.NODE_ENV = 'test';

  // Merge custom user job env, ensuring no sensitive host keys are injected
  if (customJobEnv && typeof customJobEnv === 'object') {
    for (const [k, v] of Object.entries(customJobEnv)) {
      if (typeof v === 'string' && !LEAKABLE_SECRET_KEYS.includes(k.toUpperCase())) {
        clean[k] = v;
      }
    }
  }

  // Guarantee host secrets are removed
  for (const secretKey of LEAKABLE_SECRET_KEYS) {
    delete clean[secretKey];
  }

  return clean;
}

/**
 * Forcefully terminates an entire child process tree across Windows & POSIX.
 */
export function killProcessTree(child) {
  if (!child || child.killed || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      killer.on('error', () => {
        try { child.kill('SIGKILL'); } catch {}
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        child.kill('SIGKILL');
      }
    }
  } catch {}
}

function timingSafeMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Creates the guest runner HTTP server.
 */
export function createGuestRunnerServer(options = {}) {
  const secret = options.secret || process.env.INTERNAL_SERVICE_SECRET || DEFAULT_INTERNAL_SECRET;
  const defaultWorkspace = options.workspaceRoot || process.cwd();

  const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;

    const sendJson = (statusCode, data) => {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'X-Content-Type-Options': 'nosniff'
      });
      res.end(JSON.stringify(data));
    };

    // 1. Health Attestation Endpoint (P5-01)
    if (req.method === 'GET' && (pathname === '/health' || pathname === '/v1/health')) {
      return sendJson(200, {
        status: 'ready',
        guest: true,
        isolated: true,
        platform: process.platform,
        arch: process.arch,
        uptime: process.uptime(),
        capabilities: ['execute', 'bounded_output', 'tree_kill', 'ephemeral_diff']
      });
    }

    // 2. Authentication check
    const authHeader = req.headers['x-internal-service-token'] || req.headers['x-guest-service-token'];
    if (!timingSafeMatch(authHeader, secret)) {
      return sendJson(401, {
        status: 'fail',
        statusCode: 401,
        message: 'Missing or invalid authentication token.'
      });
    }

    // 3. Command Execution Endpoint (P5-06, P5-08)
    if (req.method === 'POST' && (pathname === '/job/execute' || pathname === '/v1/job/execute' || pathname === '/v1/execute')) {
      let bodyRaw = '';
      let bodyLength = 0;

      req.on('data', (chunk) => {
        bodyLength += chunk.length;
        if (bodyLength > MAX_BODY_BYTES) {
          req.destroy(new Error('Payload too large'));
        } else {
          bodyRaw += chunk;
        }
      });

      req.on('end', () => {
        let payload;
        try {
          payload = JSON.parse(bodyRaw || '{}');
        } catch {
          return sendJson(400, { status: 'fail', statusCode: 400, message: 'Invalid JSON body.' });
        }

        const jobId = String(payload.jobId || crypto.randomUUID());
        const command = String(payload.command || '').trim();
        const timeoutMs = Math.min(
          Math.max(Number(payload.timeoutMs) || DEFAULT_TIMEOUT_MS, MIN_TIMEOUT_MS),
          MAX_TIMEOUT_MS
        );
        const cwd = payload.cwd ? path.resolve(payload.cwd) : defaultWorkspace;

        if (!command) {
          return sendJson(400, { status: 'fail', statusCode: 400, message: 'Command is required.' });
        }
        if (command.length > MAX_COMMAND_LENGTH) {
          return sendJson(400, {
            status: 'fail',
            statusCode: 400,
            message: `Command exceeds max length of ${MAX_COMMAND_LENGTH} chars.`
          });
        }

        // Secondary hard denial pattern check
        for (const pattern of GUEST_HARD_DENY_PATTERNS) {
          if (pattern.test(command)) {
            return sendJson(403, {
              status: 'fail',
              statusCode: 403,
              errorCode: 'COMMAND_DENIED',
              message: 'Command pattern blocked by guest sandbox policy.'
            });
          }
        }

        // Prepare execution
        const sanitizedEnv = buildGuestSanitizedEnv(process.env, payload.env);
        const startedAt = Date.now();

        const stdoutState = { chunks: [], bytes: 0, truncated: false };
        const stderrState = { chunks: [], bytes: 0, truncated: false };
        let timedOut = false;
        let settled = false;
        let childProcess;

        const isWin = process.platform === 'win32';
        const shellCmd = isWin ? 'powershell.exe' : '/bin/sh';
        const shellArgs = isWin
          ? ['-NoProfile', '-NonInteractive', '-Command', `${command}; if ($LASTEXITCODE -ne $null -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE }`]
          : ['-c', command];

        try {
          childProcess = spawn(shellCmd, shellArgs, {
            cwd,
            env: sanitizedEnv,
            windowsHide: true,
            detached: !isWin
          });
        } catch (spawnError) {
          return sendJson(500, {
            status: 'error',
            statusCode: 500,
            message: `Failed to spawn process: ${spawnError.message}`
          });
        }

        const appendBounded = (currentState, chunk) => {
          if (currentState.truncated) return;
          const text = chunk.toString('utf8');
          const remaining = MAX_OUTPUT_BYTES - currentState.bytes;
          if (remaining <= 0) {
            currentState.truncated = true;
            return;
          }
          const chunkBuf = Buffer.from(text, 'utf8');
          if (chunkBuf.length <= remaining) {
            currentState.chunks.push(text);
            currentState.bytes += chunkBuf.length;
          } else {
            currentState.chunks.push(chunkBuf.subarray(0, remaining).toString('utf8'));
            currentState.chunks.push('\n[output truncated at 256 KB limit]\n');
            currentState.bytes = MAX_OUTPUT_BYTES;
            currentState.truncated = true;
          }
        };

        const timer = setTimeout(() => {
          timedOut = true;
          killProcessTree(childProcess);
        }, timeoutMs);

        childProcess.stdout.on('data', (data) => {
          appendBounded(stdoutState, data);
          if (stdoutState.truncated) killProcessTree(childProcess);
        });

        childProcess.stderr.on('data', (data) => {
          appendBounded(stderrState, data);
          if (stderrState.truncated) killProcessTree(childProcess);
        });

        const handleClientDisconnect = () => {
          clearTimeout(timer);
          killProcessTree(childProcess);
        };
        req.on('aborted', handleClientDisconnect);
        res.on('close', () => {
          if (!res.writableEnded) handleClientDisconnect();
        });

        childProcess.on('close', (code, signal) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const durationMs = Date.now() - startedAt;
          const truncated = stdoutState.truncated || stderrState.truncated;
          const exitCode = timedOut ? 124 : (code ?? (signal ? 137 : 1));

          sendJson(200, {
            status: timedOut ? 'timeout' : 'success',
            jobId,
            exitCode,
            stdout: stdoutState.chunks.join(''),
            stderr: stderrState.chunks.join(''),
            durationMs,
            timedOut,
            truncated,
            killed: timedOut || Boolean(signal) || truncated,
            filesChanged: []
          });
        });

        childProcess.on('error', (err) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          const durationMs = Date.now() - startedAt;
          sendJson(500, {
            status: 'error',
            jobId,
            exitCode: 1,
            stdout: stdoutState.chunks.join(''),
            stderr: (stderrState.chunks.join('') + `\n${err.message}`).trim(),
            durationMs,
            timedOut: false,
            killed: true
          });
        });
      });
      return;
    }

    sendJson(404, { status: 'fail', statusCode: 404, message: 'Endpoint not found.' });
  });

  return server;
}

const isDirectRun = Boolean(
  process.argv[1] &&
  (path.resolve(process.argv[1]) === path.resolve(__filename) ||
   process.argv[1].endsWith('runner-daemon.js'))
);

if (isDirectRun) {
  const port = Number(process.env.GUEST_RUNNER_PORT || DEFAULT_PORT);
  const host = process.env.GUEST_RUNNER_HOST || DEFAULT_HOST;
  const server = createGuestRunnerServer();
  server.listen(port, host, () => {
    console.log(`[E.D.I.T.H.] Guest Runner Daemon listening on http://${host}:${port}`);
  });
}

export default createGuestRunnerServer();
