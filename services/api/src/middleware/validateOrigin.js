import { config } from '../config/index.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Evaluates whether an Origin is permitted by configuration or local development rules. */
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (config.ALLOWED_ORIGINS.includes(origin)) return true;

  // In non-production environments, allow local development loopbacks and private LAN origins
  if (config.NODE_ENV !== 'production') {
    try {
      const parsed = new URL(origin);
      const host = parsed.hostname;
      // Allow localhost and IPv6 loopback
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]') {
        return true;
      }
      // Allow RFC 1918 private IPv4 ranges (10.x.x.x, 192.168.x.x, 172.16-31.x.x)
      if (
        /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
        /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/** Reject browser requests carrying an Origin that is not explicitly trusted. */
export function validateOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('Origin');
  if (!origin) return next(); // Non-browser clients do not send Origin.

  if (!isAllowedOrigin(origin)) {
    return res.status(403).json({
      status: 'fail',
      statusCode: 403,
      message: 'Request origin is not allowed'
    });
  }

  return next();
}
