import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath, URL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_INTERNAL_SERVICE_SECRET = 'dev_internal_service_secret_change_in_prod';
const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = Number(process.env.RUNNER_PORT || 8003);
const HOST = process.env.RUNNER_HOST || '127.0.0.1';
const INTERNAL_SERVICE_SECRET =
  process.env.INTERNAL_SERVICE_SECRET || DEFAULT_INTERNAL_SERVICE_SECRET;
const REQUIRE_INTERNAL_AUTH = true;
// This service currently starts child processes directly on its own host. The
// Hyper-V provisioning script is a stub, so this is not a safe boundary for
// arbitrary user code. Keep execution disabled until a real isolated backend
// replaces this host process-spawning path.
const EXECUTION_ISOLATION_AVAILABLE = false;

const MAX_BODY_BYTES = Number(process.env.RUNNER_MAX_BODY_BYTES || 65_536);
const MAX_COMMAND_LENGTH = 2_000;
const MIN_TIMEOUT_MS = 500;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 262_144;
const MAX_CONCURRENT_JOBS = Number(process.env.RUNNER_MAX_CONCURRENT_JOBS || 4);
const MAX_AUDIT_LOGS = 500;

if (
  NODE_ENV === 'production' &&
  (!INTERNAL_SERVICE_SECRET ||
    INTERNAL_SERVICE_SECRET === DEFAULT_INTERNAL_SERVICE_SECRET ||
    INTERNAL_SERVICE_SECRET.length < 16)
) {
  throw new Error('INTERNAL_SERVICE_SECRET must be overridden with a strong secret in production.');
}

function findDefaultWorkspaceRoot() {
  let cursor = path.resolve(__dirname);
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(cursor, 'services')) &&
      fs.existsSync(path.join(cursor, 'apps'))
    ) {
      return cursor;
    }
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    cursor = parent;
  }
  return path.resolve(__dirname, '../..');
}

const DEFAULT_WORKSPACE_ROOT = findDefaultWorkspaceRoot();

function getAllowedRoots() {
  const raw = process.env.RUNNER_ALLOWED_ROOTS;
  const roots = raw
    ? raw
        .split(',')
        .map((r) => r.trim())
        .filter(Boolean)
    : [DEFAULT_WORKSPACE_ROOT];

  return roots.map((r) => {
    try {
      return fs.realpathSync(r);
    } catch {
      return path.resolve(r);
    }
  });
}

function getAllowedCorsOrigins() {
  const raw = process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:3000';
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

function isPathInsideRoot(candidatePath, rootPath) {
  const normCandidate = process.platform === 'win32' ? candidatePath.toLowerCase() : candidatePath;
  const normRoot = process.platform === 'win32' ? rootPath.toLowerCase() : rootPath;
  if (normCandidate === normRoot) return true;
  const rootWithSep = normRoot.endsWith(path.sep) ? normRoot : `${normRoot}${path.sep}`;
  return normCandidate.startsWith(rootWithSep);
}

export function resolveSafeCwd(requestedCwd) {
  const allowedRoots = getAllowedRoots();
  const target = requestedCwd ? String(requestedCwd).trim() : allowedRoots[0];

  if (!target || target.includes('\x00')) {
    const err = new Error('Invalid working directory path.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_CWD';
    throw err;
  }

  let realTarget;
  try {
    realTarget = fs.realpathSync(target);
  } catch {
    const err = new Error('Working directory does not exist.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_CWD';
    throw err;
  }

  const stat = fs.statSync(realTarget);
  if (!stat.isDirectory()) {
    const err = new Error('Working directory path must be a directory.');
    err.statusCode = 400;
    err.errorCode = 'INVALID_CWD';
    throw err;
  }

  const isAllowed = allowedRoots.some((root) => isPathInsideRoot(realTarget, root));
  if (!isAllowed) {
    const err = new Error('Working directory is outside runner RUNNER_ALLOWED_ROOTS.');
    err.statusCode = 403;
    err.errorCode = 'CWD_ACCESS_DENIED';
    throw err;
  }

  return realTarget;
}

function timingSafeMatch(provided, expected) {
  if (!provided || !expected) return false;
  const a = Buffer.from(String(provided), 'utf8');
  const b = Buffer.from(String(expected), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function authenticateInternalRequest(req) {
  if (REQUIRE_INTERNAL_AUTH) {
    const token = req.headers['x-internal-service-token'];
    if (!timingSafeMatch(token, INTERNAL_SERVICE_SECRET)) {
      return { ok: false, message: 'Missing or invalid X-Internal-Service-Token header.' };
    }
  }
  const userId = String(req.headers['x-user-id'] || '').trim();
  if (!userId) {
    return { ok: false, message: 'Missing authenticated X-User-Id header.' };
  }
  return { ok: true, userId };
}

// Secondary defense-in-depth blocklist inside the runner process itself
const RUNNER_HARD_DENY_PATTERNS = [
  /rmdir\s+\/s\s+\/q\s+[c-zC-Z]:\\/i,
  /del\s+\/[fF]\s+\/[sS]\s+\/[qQ]\s+[c-zC-Z]:\\/,
  /\bformat\s+[c-zC-Z]:/i,
  /\bdiskpart\b|\bbcdedit\b|\breg\s+delete\b/i,
  /rm\s+-[rRfF]{1,4}\s+(\/|~|\*)(\s|$)/i,
  /mkfs|\bdd\s+if=/i
];

export function buildSanitizedEnv(sourceEnv = process.env) {
  const allowlist = [
    'PATH',
    'PATHEXT',
    'SYSTEMROOT',
    'SystemRoot',
    'COMSPEC',
    'ComSpec',
    'WINDIR',
    'windir',
    'TEMP',
    'TMP',
    'HOME',
    'USERPROFILE',
    'HOMEDRIVE',
    'HOMEPATH',
    'APPDATA',
    'LOCALAPPDATA',
    'LANG',
    'LC_ALL',
    'TERM',
    'VIRTUAL_ENV',
    'PYTHONPATH'
  ];

  const clean = {};
  for (const key of allowlist) {
    if (sourceEnv[key] !== undefined) {
      clean[key] = sourceEnv[key];
    }
  }
  clean.NODE_ENV = 'development';
  return clean;
}

function killProcessTree(child) {
  if (!child || child.killed || !child.pid) return;
  try {
    if (process.platform === 'win32') {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        windowsHide: true,
        stdio: 'ignore'
      });
      killer.on('error', () => {
        try {
          child.kill('SIGKILL');
        } catch {
          // Process already exited
        }
      });
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      setTimeout(() => {
        try {
          process.kill(-child.pid, 'SIGKILL');
        } catch {
          // Already dead
        }
      }, 1000).unref();
    }
  } catch {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already dead
    }
  }
}

function sendJson(res, statusCode, payload, requestId) {
  if (res.writableEnded) return;
  const headers = { 'Content-Type': 'application/json' };
  if (requestId) headers['X-Request-Id'] = requestId;
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(payload));
}

function appendOutputBounded(currentState, chunk) {
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
    currentState.chunks.push('\n[output truncated at 256KB safety limit]');
    currentState.bytes = MAX_OUTPUT_BYTES;
    currentState.truncated = true;
  }
}

function recordAuditEntry(entry) {
  executionAuditLogs.push(entry);
  if (executionAuditLogs.length > MAX_AUDIT_LOGS) {
    executionAuditLogs.splice(0, executionAuditLogs.length - MAX_AUDIT_LOGS);
  }
}

// Bounded in-memory audit ring buffer
const executionAuditLogs = [];
let activeJobsCount = 0;

function readJsonBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length']);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      const err = new Error(`Request body exceeds ${maxBytes} byte limit.`);
      err.statusCode = 413;
      err.errorCode = 'PAYLOAD_TOO_LARGE';
      req.resume();
      reject(err);
      return;
    }

    let totalBytes = 0;
    const chunks = [];
    let settled = false;

    const fail = (statusCode, errorCode, message) => {
      if (settled) return;
      settled = true;
      const err = new Error(message);
      err.statusCode = statusCode;
      err.errorCode = errorCode;
      reject(err);
    };

    req.on('data', (chunk) => {
      if (settled) return;
      totalBytes += chunk.length;
      if (totalBytes > maxBytes) {
        fail(413, 'PAYLOAD_TOO_LARGE', `Request body exceeds ${maxBytes} byte limit.`);
        req.resume();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        const err = new Error('Malformed JSON payload');
        err.statusCode = 400;
        err.errorCode = 'MALFORMED_JSON';
        reject(err);
      }
    });

    req.on('error', (err) => {
      fail(400, 'STREAM_ERROR', err?.message || 'Request stream failed');
    });
  });
}

const server = http.createServer(async (req, res) => {
  const requestId =
    String(req.headers['x-request-id'] || '').trim() || `req_${crypto.randomBytes(6).toString('hex')}`;
  const parsedUrl = new URL(req.url || '/', 'http://127.0.0.1');

  // Strict origin allowlist CORS
  const origin = req.headers.origin;
  if (origin && getAllowedCorsOrigins().includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Internal-Service-Token, X-User-Id, X-Request-Id'
  );

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'X-Request-Id': requestId });
    res.end();
    return;
  }

  // Minimal non-sensitive liveness check
  if (req.method === 'GET' && parsedUrl.pathname === '/v1/health') {
    sendJson(
      res,
      EXECUTION_ISOLATION_AVAILABLE ? 200 : 503,
      {
        status: EXECUTION_ISOLATION_AVAILABLE ? 'healthy' : 'unavailable',
        executionEnabled: EXECUTION_ISOLATION_AVAILABLE,
        isolation: 'unavailable',
        reason: 'No verified isolated execution backend is configured.'
      },
      requestId
    );
    return;
  }

  // Internal Authenticated Command Execution Endpoint
  if (req.method === 'POST' && parsedUrl.pathname === '/v1/execute') {
    const auth = authenticateInternalRequest(req);
    if (!auth.ok) {
      sendJson(
        res,
        401,
        {
          status: 'fail',
          errorCode: 'UNAUTHORIZED_INTERNAL_CALLER',
          message: auth.message
        },
        requestId
      );
      return;
    }

    if (!EXECUTION_ISOLATION_AVAILABLE) {
      sendJson(
        res,
        503,
        {
          status: 'unavailable',
          errorCode: 'ISOLATED_EXECUTION_UNAVAILABLE',
          error: 'Code execution is disabled because no verified isolated runner backend is configured.'
        },
        requestId
      );
      return;
    }

    let payload;
    try {
      payload = await readJsonBody(req, MAX_BODY_BYTES);
    } catch (err) {
      const statusCode = err.statusCode || 400;
      if (statusCode === 413) {
        res.setHeader('Connection', 'close');
      }
      sendJson(
        res,
        statusCode,
        { status: 'fail', errorCode: err.errorCode || 'BAD_REQUEST', error: err.message },
        requestId
      );
      return;
    }

    const command = typeof payload?.command === 'string' ? payload.command.trim() : '';
    if (!command || command.length > MAX_COMMAND_LENGTH || command.includes('\x00')) {
      sendJson(
        res,
        400,
        {
          status: 'fail',
          errorCode: 'INVALID_COMMAND',
          error: `Valid non-empty command string (<= ${MAX_COMMAND_LENGTH} chars) is required.`
        },
        requestId
      );
      return;
    }

    if (RUNNER_HARD_DENY_PATTERNS.some((pattern) => pattern.test(command))) {
      sendJson(
        res,
        403,
        {
          status: 'fail',
          errorCode: 'RUNNER_POLICY_DENIED',
          error: 'Command rejected by runner defensive blocklist.'
        },
        requestId
      );
      return;
    }

    let safeCwd;
    try {
      safeCwd = resolveSafeCwd(payload?.cwd);
    } catch (err) {
      sendJson(
        res,
        err.statusCode || 403,
        { status: 'fail', errorCode: err.errorCode || 'INVALID_CWD', error: err.message },
        requestId
      );
      return;
    }

    if (activeJobsCount >= MAX_CONCURRENT_JOBS) {
      sendJson(
        res,
        429,
        {
          status: 'fail',
          errorCode: 'RUNNER_BUSY',
          error: `Maximum concurrent runner jobs (${MAX_CONCURRENT_JOBS}) exceeded; retry shortly.`
        },
        requestId
      );
      return;
    }

    const requestedTimeout = Number(payload?.timeoutMs);
    const clampedTimeoutMs = Number.isFinite(requestedTimeout)
      ? Math.min(Math.max(Math.trunc(requestedTimeout), MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
      : DEFAULT_TIMEOUT_MS;

    const jobId = `run_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const startTime = Date.now();
    const stdoutState = { chunks: [], bytes: 0, truncated: false };
    const stderrState = { chunks: [], bytes: 0, truncated: false };
    let isTimedOut = false;
    let settled = false;

    activeJobsCount += 1;

    const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
    const shellArgs =
      process.platform === 'win32'
        ? ['-NoProfile', '-NonInteractive', '-Command', command]
        : ['-c', command];

    const child = spawn(shell, shellArgs, {
      cwd: safeCwd,
      env: buildSanitizedEnv(process.env),
      detached: process.platform !== 'win32',
      windowsHide: true
    });

    const finalize = (statusCode, responsePayload) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeJobsCount = Math.max(0, activeJobsCount - 1);
      sendJson(res, statusCode, responsePayload, requestId);
    };

    const timer = setTimeout(() => {
      isTimedOut = true;
      killProcessTree(child);
    }, clampedTimeoutMs);

    child.stdout.on('data', (data) => {
      appendOutputBounded(stdoutState, data);
      if (stdoutState.truncated) killProcessTree(child);
    });

    child.stderr.on('data', (data) => {
      appendOutputBounded(stderrState, data);
      if (stderrState.truncated) killProcessTree(child);
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const truncated = stdoutState.truncated || stderrState.truncated;
      const exitCode = isTimedOut || truncated ? -1 : code ?? -1;

      recordAuditEntry({
        jobId,
        userId: auth.userId,
        cwd: safeCwd,
        command,
        exitCode,
        durationMs,
        timestamp: new Date().toISOString(),
        timedOut: isTimedOut,
        truncated
      });

      finalize(200, {
        jobId,
        exitCode,
        stdout: stdoutState.chunks.join(''),
        stderr: stderrState.chunks.join(''),
        durationMs,
        timedOut: isTimedOut,
        truncated
      });
    });

    child.on('error', (err) => {
      finalize(500, {
        status: 'error',
        errorCode: 'RUNNER_SPAWN_ERROR',
        error: err?.message || 'Failed to spawn runner process.'
      });
    });

    return;
  }

  sendJson(res, 404, { error: 'Endpoint not found' }, requestId);
});

const isMainModule =
  Boolean(process.argv[1]) && path.resolve(__filename) === path.resolve(process.argv[1]);

if (isMainModule && NODE_ENV !== 'test') {
  server.listen(PORT, HOST, () => {
    console.log(`[runner-host] Runner status service listening on http://${HOST}:${PORT}; execution enabled: ${EXECUTION_ISOLATION_AVAILABLE}`);
  });
}

export { executionAuditLogs };
export default server;
