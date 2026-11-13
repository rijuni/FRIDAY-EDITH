import { config } from '../config/index.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Reject browser requests carrying an Origin that is not explicitly trusted. */
export function validateOrigin(req, res, next) {
  if (SAFE_METHODS.has(req.method)) return next();

  const origin = req.get('Origin');
  if (!origin) return next(); // Non-browser clients do not send Origin.

  if (!config.ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({
      status: 'fail',
      statusCode: 403,
      message: 'Request origin is not allowed'
    });
  }

  return next();
}
