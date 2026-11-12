import { prisma } from '../../repositories/prisma.js';
import { config } from '../../config/index.js';
import {
  generateTokens,
  hashPassword,
  hashToken,
  parseDurationToMs,
  verifyPassword,
  verifyToken
} from '../../security/crypto.js';
import { auditService } from '../audit/audit.service.js';

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role
  };
}

function buildAuthError(message, statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export class AuthService {
  /**
   * Creates a persisted session row storing the hashed refresh token.
   */
  async _createSession(tx, userId, refreshToken, { ip = null, userAgent = null } = {}) {
    const expiresAt = new Date(
      Date.now() + parseDurationToMs(config.REFRESH_TOKEN_EXPIRES_IN, 7 * 86_400_000)
    );
    return tx.session.create({
      data: {
        userId,
        tokenHash: hashToken(refreshToken),
        ipAddress: ip || null,
        userAgent: userAgent ? String(userAgent).slice(0, 255) : null,
        expiresAt
      }
    });
  }

  /**
   * Registers a new standard USER account. Client-supplied roles are never honored on public signup.
   */
  async register({ email, password, name }, ip = null, userAgent = null) {
    const normalizedEmail = email.toLowerCase().trim();
    const passwordHash = await hashPassword(password);

    let user;
    try {
      user = await prisma.user.create({
        data: {
          email: normalizedEmail,
          name: name.trim(),
          passwordHash,
          role: 'USER' // Unconditionally force USER on public signup
        }
      });
    } catch (err) {
      if (err?.code === 'P2002') {
        throw buildAuthError('User with this email already exists', 409);
      }
      throw err;
    }

    const tokens = generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    await this._createSession(prisma, user.id, tokens.refreshToken, { ip, userAgent });

    await auditService.logEvent({
      action: 'USER_REGISTERED',
      userId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      details: { email: user.email, role: user.role },
      ip
    });

    return {
      user: sanitizeUser(user),
      tokens
    };
  }

  /**
   * Verifies credentials, starts a tracked refresh session, and returns signed tokens.
   */
  async login({ email, password }, ip = null, userAgent = null) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user || !user.isActive) {
      await auditService.logEvent({
        action: 'USER_LOGIN_FAILED',
        userId: null,
        resourceType: 'USER',
        resourceId: normalizedEmail,
        details: { reason: 'User not found or inactive' },
        ip,
        status: 'FAILURE'
      });
      throw buildAuthError('Invalid email or password', 401);
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      await auditService.logEvent({
        action: 'USER_LOGIN_FAILED',
        userId: user.id,
        resourceType: 'USER',
        resourceId: user.id,
        details: { reason: 'Incorrect password' },
        ip,
        status: 'FAILURE'
      });
      throw buildAuthError('Invalid email or password', 401);
    }

    const tokens = generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    await this._createSession(prisma, user.id, tokens.refreshToken, { ip, userAgent });

    await auditService.logEvent({
      action: 'USER_LOGIN_SUCCESS',
      userId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      ip
    });

    return {
      user: sanitizeUser(user),
      tokens
    };
  }

  /**
   * Validates and atomically rotates a refresh token, rejecting revoked or replayed sessions.
   */
  async refreshSession(refreshToken, ip = null, userAgent = null) {
    if (!refreshToken) {
      throw buildAuthError('Refresh token is required', 401);
    }

    let decoded;
    try {
      decoded = verifyToken(refreshToken, 'refresh');
    } catch {
      throw buildAuthError('Invalid or expired refresh token', 401);
    }

    const tokenHash = hashToken(refreshToken);
    const existing = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true }
    });

    if (!existing) {
      await auditService.logEvent({
        action: 'TOKEN_REFRESH_REPLAY_DETECTED',
        userId: decoded.sub,
        resourceType: 'SESSION',
        resourceId: decoded.sub,
        details: { reason: 'Refresh token not found in active sessions' },
        ip,
        status: 'FAILURE'
      });
      throw buildAuthError('Session is invalid or has been revoked', 401);
    }

    if (existing.expiresAt <= new Date() || !existing.user || !existing.user.isActive) {
      await prisma.session.deleteMany({ where: { id: existing.id } });
      throw buildAuthError('Session expired or user inactive', 401);
    }

    const newTokens = generateTokens({
      sub: existing.user.id,
      email: existing.user.email,
      role: existing.user.role
    });

    await prisma.$transaction(async (tx) => {
      const deleted = await tx.session.deleteMany({ where: { id: existing.id } });
      if (deleted.count === 0) {
        throw buildAuthError('Session was already rotated or revoked', 401);
      }
      await this._createSession(tx, existing.user.id, newTokens.refreshToken, { ip, userAgent });
    });

    await auditService.logEvent({
      action: 'TOKEN_REFRESHED',
      userId: existing.user.id,
      resourceType: 'SESSION',
      resourceId: existing.id,
      ip
    });

    return {
      user: sanitizeUser(existing.user),
      tokens: newTokens
    };
  }

  /**
   * Revokes the active session associated with the provided refresh token.
   */
  async logout({ refreshToken = null, userId = null, ip = null }) {
    if (refreshToken) {
      const tokenHash = hashToken(refreshToken);
      const existing = await prisma.session.findUnique({ where: { tokenHash } });
      if (existing) {
        userId = userId || existing.userId;
        await prisma.session.deleteMany({ where: { id: existing.id } });
      }
    }

    await auditService.logEvent({
      action: 'USER_LOGOUT',
      userId,
      resourceType: 'SESSION',
      resourceId: userId,
      ip
    });
  }

  /**
   * Protected admin-only operation to assign a user's RBAC role.
   */
  async assignUserRole({ targetUserId, role, actorId, ip = null }) {
    const existing = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!existing) {
      throw buildAuthError('User not found', 404);
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: { role }
    });

    await auditService.logEvent({
      action: 'USER_ROLE_UPDATED',
      userId: actorId,
      resourceType: 'USER',
      resourceId: targetUserId,
      details: { previousRole: existing.role, newRole: role },
      ip
    });

    return sanitizeUser(updated);
  }

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true }
    });

    if (!user || !user.isActive) {
      throw buildAuthError(user ? 'Account is inactive' : 'User not found', user ? 403 : 404);
    }

    const { isActive, ...profile } = user;
    return profile;
  }

  async updateProfile(userId, { name }, ip = null) {
    const existing = await prisma.user.findUnique({ where: { id: userId } });
    if (!existing || !existing.isActive) {
      throw buildAuthError(existing ? 'Account is inactive' : 'User not found', existing ? 403 : 404);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { name }
    });

    await auditService.logEvent({
      action: 'USER_PROFILE_UPDATED',
      userId,
      resourceType: 'USER',
      resourceId: userId,
      details: { previousName: existing.name, newName: name },
      ip
    });

    return sanitizeUser(updated);
  }

  async revokeOtherSessions(userId, currentRefreshToken = null, ip = null) {
    const currentHash = currentRefreshToken ? hashToken(currentRefreshToken) : null;
    const where = currentHash
      ? { userId, tokenHash: { not: currentHash } }
      : { userId };

    const result = await prisma.session.deleteMany({ where });

    await auditService.logEvent({
      action: 'OTHER_SESSIONS_REVOKED',
      userId,
      resourceType: 'SESSION',
      resourceId: userId,
      details: { revokedCount: result.count },
      ip
    });

    return { revokedCount: result.count };
  }
}

export const authService = new AuthService();
