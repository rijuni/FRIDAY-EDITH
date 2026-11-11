import { logger } from '../../utils/logger.js';

class AuditService {
  /**
   * Records an audit event for sensitive operations.
   * In Phase 2, this will persist to the Prisma AuditLog table.
   */
  async logEvent({ action, userId, resourceType, resourceId, details = {}, ip, status = 'SUCCESS' }) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      userId,
      resourceType,
      resourceId,
      details,
      ip,
      status
    };

    logger.info({ audit: entry }, `[AUDIT] ${action} by user ${userId || 'anonymous'} - ${status}`);
    return entry;
  }
}

export const auditService = new AuditService();
