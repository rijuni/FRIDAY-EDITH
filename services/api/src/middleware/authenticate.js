import { config } from '../config/index.js';
import { prisma } from '../repositories/prisma.js';
import { verifyToken } from '../security/crypto.js';
import { hasValidCsrfToken, parseCookies } from '../utils/cookies.js';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Authenticates requests via Bearer JWT or HttpOnly access cookie.
 * Enforces double-submit CSRF validation on cookie-authenticated mutations.
 */
export async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token = null;
  let usedCookieAuth = false;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else {
    const cookies = parseCookies(req);
    if (cookies[config.ACCESS_COOKIE_NAME]) {
      token = cookies[config.ACCESS_COOKIE_NAME];
      usedCookieAuth = true;
    }
  }

  if (!token) {
    return res.status(401).json({
      status: 'fail',
      statusCode: 401,
      message: 'Authentication token missing or invalid'
    });
  }

  // Enforce CSRF verification when cookie auth is used on state-changing HTTP methods
  if (usedCookieAuth && !SAFE_HTTP_METHODS.has(req.method) && !hasValidCsrfToken(req)) {
    return res.status(403).json({
      status: 'fail',
      statusCode: 403,
      message: 'CSRF token missing or invalid'
    });
  }

  try {
    const decoded = verifyToken(token, 'access');
    const currentUser = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, role: true, isActive: true }
    });

    if (!currentUser?.isActive) {
      return res.status(401).json({
        status: 'fail',
        statusCode: 401,
        message: 'Account is unavailable'
      });
    }

    req.user = {
      id: currentUser.id,
      email: currentUser.email,
      role: currentUser.role,
      orgId: decoded.orgId,
      authSource: usedCookieAuth ? 'cookie' : 'bearer'
    };

    return next();
  } catch (error) {
    if (error?.name !== 'JsonWebTokenError' && error?.name !== 'TokenExpiredError') {
      return next(error);
    }
    return res.status(401).json({
      status: 'fail',
      statusCode: 401,
      message: error.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid authentication token'
    });
  }
}

