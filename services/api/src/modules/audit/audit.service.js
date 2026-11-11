import { prisma } from '../../repositories/prisma.js';
import { logger } from '../../utils/logger.js';

class AuditService {
  async logEvent({ action, userId, resourceType, resourceId, details = {}, ip, status = 'SUCCESS' }) {
    const stringifiedDetails = typeof details === 'string' ? details : JSON.stringify(details);

    try {
      const entry = await prisma.auditLog.create({
        data: {
          action,
          userId,
          resourceType,
          resourceId,
          status,
          details: stringifiedDetails,
          ip
        }
      });

      logger.info({ audit: entry }, `[AUDIT] ${action} by user ${userId || 'anonymous'} - ${status}`);
      return entry;
    } catch (err) {
      // In case DB is temporarily down, log to stdout so audit is never silently dropped
      logger.error({ err, action, userId }, '[AUDIT FALLBACK LOG]');
      return { action, userId, status, details: stringifiedDetails };
    }
  }
}

export const auditService = new AuditService();
