import { prisma } from '../../repositories/prisma.js';
import { hashPassword, verifyPassword, generateTokens } from '../../security/crypto.js';
import { auditService } from '../audit/audit.service.js';

export class AuthService {
  async register({ email, password, name, role = 'USER' }, ip) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (existingUser) {
      const error = new Error('User with this email already exists');
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        passwordHash,
        role
      }
    });

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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    return user;
  }
}

export const authService = new AuthService();
