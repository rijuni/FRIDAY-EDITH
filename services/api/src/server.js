import { app } from './app.js';
import { config } from './config/index.js';
import { logger } from './utils/logger.js';

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(`🚀 F.R.I.D.A.Y. + E.D.I.T.H. API Server running on http://${config.HOST}:${config.PORT}`);
  logger.info(`Environment: ${config.NODE_ENV}`);
});

// Graceful shutdown handling
function shutdown(signal) {
  logger.info(`${signal} signal received: closing HTTP server...`);
  server.close(() => {
    logger.info('HTTP server closed cleanly.');
    process.exit(0);
  });

  // Force shutdown after 10s timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
