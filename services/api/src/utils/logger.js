import pino from 'pino';
import { config } from '../config/index.js';

export const logger = pino({
  level: config.NODE_ENV === 'test' ? 'silent' : config.NODE_ENV === 'development' ? 'debug' : 'info',
  transport:
    config.NODE_ENV === 'development'
      ? {
          target: 'pino/file',
          options: { destination: 1 } // stdout
        }
      : undefined
});
