import { app } from './app.js';
import { config } from './config/index.js';
import { prisma } from './repositories/prisma.js';
import { logger } from './utils/logger.js';

const server = app.listen(config.PORT, config.HOST, () => {
  logger.info(`🚀 F.R.I.D.A.Y. + E.D.I.T.H. API Server running on http://${config.HOST}:${config.PORT}`);
  logger.info(`Environment: ${config.NODE_ENV}`);
});

// Graceful shutdown handling
async function shutdown(signal) {
  logger.info(`${signal} signal received: closing HTTP server...`);
  server.close(async () => {
    try {
      await prisma.$disconnect();
    } catch (err) {
      logger.error({ err: err?.message }, 'Error disconnecting Prisma client during shutdown');
    }
    logger.info('HTTP server and database connections closed cleanly.');
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

