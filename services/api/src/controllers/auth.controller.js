import { config } from '../config/index.js';
import { authService } from '../modules/auth/auth.service.js';
import { verifyToken } from '../security/crypto.js';
import {
  clearAuthCookies,
  hasValidCsrfToken,
  parseCookies,
  setAuthCookies
} from '../utils/cookies.js';

export async function register(req, res, next) {
  try {
    const { email, password, name } = req.body;
    const result = await authService.register(
      { email, password, name },
      req.ip,
      req.headers['user-agent']
    );
    setAuthCookies(res, result.tokens);
    res.status(201).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const result = await authService.login(
      { email, password },
      req.ip,
      req.headers['user-agent']
    );
    setAuthCookies(res, result.tokens);
    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const bodyToken = req.body?.refreshToken;
    const cookieToken = cookies[config.REFRESH_COOKIE_NAME];

    if (!bodyToken && cookieToken && !hasValidCsrfToken(req)) {
      return res.status(403).json({
        status: 'fail',
        statusCode: 403,
        message: 'CSRF token missing or invalid'
      });
    }

    const refreshToken = bodyToken || cookieToken;
    const result = await authService.refreshSession(
      refreshToken,
      req.ip,
      req.headers['user-agent']
    );
    setAuthCookies(res, result.tokens);
    res.status(200).json({
      status: 'success',
      data: result
    });
  } catch (error) {
    clearAuthCookies(res);
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const authHeader = req.headers.authorization;
    const hasCookieSession = Boolean(
      cookies[config.ACCESS_COOKIE_NAME] || cookies[config.REFRESH_COOKIE_NAME]
    );

    if (!authHeader && hasCookieSession && !hasValidCsrfToken(req)) {
      return res.status(403).json({
        status: 'fail',
        statusCode: 403,
        message: 'CSRF token missing or invalid'
      });
    }

    const refreshToken = req.body?.refreshToken || cookies[config.REFRESH_COOKIE_NAME] || null;
    let userId = null;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        userId = verifyToken(authHeader.slice(7).trim(), 'access').sub;
      } catch {
        // Ignore expired/invalid bearer token during logout cleanup
      }
    }

    await authService.logout({ refreshToken, userId, ip: req.ip });
    clearAuthCookies(res);
    res.status(200).json({
      status: 'success',
      message: 'Session terminated successfully'
    });
  } catch (error) {
    next(error);
  }
}

export async function getMe(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.id);
    res.status(200).json({
      status: 'success',
      data: { user: profile }
    });
  } catch (error) {
    next(error);
  }
}

export async function assignRole(req, res, next) {
  try {
    const updatedUser = await authService.assignUserRole({
      targetUserId: req.params.id,
      role: req.body.role,
      actorId: req.user.id,
      ip: req.ip
    });
    res.status(200).json({
      status: 'success',
      data: { user: updatedUser }
    });
  } catch (error) {
    next(error);
  }
}

