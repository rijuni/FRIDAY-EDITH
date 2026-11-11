import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

export function errorHandler(err, req, res, next) {
  const statusCode = err.statusCode || 500;
  const message = statusCode === 500 && config.NODE_ENV === 'production'
    ? 'Internal Server Error'
    : err.message || 'An unexpected error occurred';

  logger.error({
    err: {
      message: err.message,
      stack: config.NODE_ENV === 'development' ? err.stack : undefined,
      statusCode
    },
    req: {
      method: req.method,
      url: req.originalUrl,
      ip: req.ip
    }
  }, 'Request error handled');

  res.status(statusCode).json({
    status: 'error',
    statusCode,
    message,
    ...(config.NODE_ENV === 'development' && { details: err.details, stack: err.stack })
  });
}

