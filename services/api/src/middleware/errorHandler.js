import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

function normalizeError(err) {
  if (err?.type === 'entity.parse.failed') {
    return { statusCode: 400, message: 'Invalid JSON request payload' };
  }
  if (err?.code === 'P2002') {
    return { statusCode: 409, message: 'Resource already exists' };
  }
  if (err?.code === 'P2025') {
    return { statusCode: 404, message: 'Requested resource not found' };
  }

  const statusCode = err?.statusCode || 500;
  const isProd = config.NODE_ENV === 'production';
  const message = statusCode === 500 && isProd
    ? 'Internal Server Error'
    : err?.message || 'An unexpected error occurred';

  return { statusCode, message };
}

export function errorHandler(err, req, res, next) {
  const { statusCode, message } = normalizeError(err);

  logger.error({
    err: {
      message: err?.message,
      code: err?.code,
      statusCode
    },
    req: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip
    }
  }, 'Request error handled');

  res.status(statusCode).json({
    status: statusCode < 500 ? 'fail' : 'error',
    statusCode,
    message,
    ...(config.NODE_ENV === 'development' && { details: err?.details })
  });
}

