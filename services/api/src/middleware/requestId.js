import crypto from 'crypto';

const SAFE_REQ_ID_RE = /^[A-Za-z0-9\-_.]{1,64}$/;

/**
 * Assigns a request correlation ID (reusing validated incoming X-Request-Id or generating a UUID)
 * and reflects it on the response header for cross-service tracing.
 */
export function requestIdMiddleware(req, res, next) {
  const incoming = req.headers['x-request-id'];
  const requestId =
    typeof incoming === 'string' && SAFE_REQ_ID_RE.test(incoming.trim())
      ? incoming.trim()
      : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);
  next();
}

