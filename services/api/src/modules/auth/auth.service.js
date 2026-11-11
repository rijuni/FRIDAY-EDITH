import { hashPassword, verifyPassword, generateTokens } from '../../security/crypto.js';
import { auditService } from '../audit/audit.service.js';

// In-memory mock store for Phase 1 verification (transitioned to Prisma in Phase 2)
const usersByEmail = new Map();

export class AuthService {
  async register({ email, password, name, role = 'USER' }, ip) {
    const normalizedEmail = email.toLowerCase().trim();
    if (usersByEmail.has(normalizedEmail)) {
      const error = new Error('User with this email already exists');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await hashPassword(password);
    const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const user = {
      id: userId,
      email: normalizedEmail,
      name,
      passwordHash,
      role,
      createdAt: new Date().toISOString()
    };

    usersByEmail.set(normalizedEmail, user);

    await auditService.logEvent({
      action: 'USER_REGISTERED',
      userId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      details: { email: user.email, role: user.role },
      ip
    });

    const tokens = generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens
    };
  }

  async login({ email, password }, ip) {
    const normalizedEmail = email.toLowerCase().trim();
    const user = usersByEmail.get(normalizedEmail);

    if (!user) {
      await auditService.logEvent({
        action: 'USER_LOGIN_FAILED',
        userId: null,
        resourceType: 'USER',
        resourceId: normalizedEmail,
        details: { reason: 'User not found' },
        ip,
        status: 'FAILURE'
      });
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
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
      const error = new Error('Invalid email or password');
      error.statusCode = 401;
      throw error;
    }

    await auditService.logEvent({
      action: 'USER_LOGIN_SUCCESS',
      userId: user.id,
      resourceType: 'USER',
      resourceId: user.id,
      ip
    });

    const tokens = generateTokens({
      sub: user.id,
      email: user.email,
      role: user.role
    });

    return {
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      tokens
    };
  }

  async getProfile(userId) {
    for (const user of usersByEmail.values()) {
      if (user.id === userId) {
        return { id: user.id, email: user.email, name: user.name, role: user.role };
      }
    }
    const error = new Error('User not found');
    error.statusCode = 404;
    throw error;
  }
}

export const authService = new AuthService();
