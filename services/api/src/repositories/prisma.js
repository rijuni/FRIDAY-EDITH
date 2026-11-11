import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { config } from '../config/index.js';

let prismaInstance;

export function getPrismaClient() {
  if (!prismaInstance) {
    prismaInstance = new PrismaClient({
      log:
        config.NODE_ENV === 'development'
          ? [
              { emit: 'event', level: 'query' },
              { emit: 'event', level: 'error' },
              { emit: 'event', level: 'warn' }
            ]
          : [{ emit: 'event', level: 'error' }]
    });

    if (config.NODE_ENV === 'development') {
      prismaInstance.$on('error', (e) => logger.error({ err: e }, '[PRISMA ERROR]'));
      prismaInstance.$on('warn', (e) => logger.warn({ warning: e }, '[PRISMA WARN]'));
    }
  }

  return prismaInstance;
}

export const prisma = getPrismaClient();

