import { config } from '../config/index.js';
import { generateOpaqueToken, parseDurationToMs, timingSafeEqualString } from '../security/crypto.js';

/**
 * Parses the Cookie HTTP header into a key-value map.
 * @param {import('express').Request} req
 * @returns {Record<string, string>}
 */
export function parseCookies(req) {
  const header = req.headers?.cookie;
  if (!header || typeof header !== 'string') return {};

  const cookies = {};
  for (const part of header.split(';')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex <= 0) continue;
    const key = part.slice(0, eqIndex).trim();
    const rawValue = part.slice(eqIndex + 1).trim();
    try {
      cookies[key] = decodeURIComponent(rawValue);
    } catch {
      cookies[key] = rawValue;
    }
  }
  return cookies;
}

/**
 * Sets HttpOnly auth session cookies and a readable double-submit CSRF cookie.
 * @param {import('express').Response} res
 * @param {{ accessToken: string, refreshToken: string }} tokens
 * @param {string} [existingCsrfToken]
 */
export function setAuthCookies(res, { accessToken, refreshToken }, existingCsrfToken) {
  const accessMaxAge = parseDurationToMs(config.JWT_EXPIRES_IN, 15 * 60_000);
  const refreshMaxAge = parseDurationToMs(config.REFRESH_TOKEN_EXPIRES_IN, 7 * 86_400_000);

  res.cookie(config.ACCESS_COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
    maxAge: accessMaxAge
  });

  res.cookie(config.REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/v1/auth',
    maxAge: refreshMaxAge
  });

  // Double-submit CSRF cookie readable by same-origin JS to send in X-CSRF-Token
  const csrfToken = existingCsrfToken || generateOpaqueToken(24);
  res.cookie(config.CSRF_COOKIE_NAME, csrfToken, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
    maxAge: refreshMaxAge
  });
}

/**
 * Clears auth and CSRF cookies using matching paths and attributes.
 * @param {import('express').Response} res
 */
export function clearAuthCookies(res) {
  const common = {
    sameSite: 'lax',
    secure: config.COOKIE_SECURE
  };

  res.clearCookie(config.ACCESS_COOKIE_NAME, { ...common, httpOnly: true, path: '/' });
  res.clearCookie(config.REFRESH_COOKIE_NAME, { ...common, httpOnly: true, path: '/v1/auth' });
  res.clearCookie(config.CSRF_COOKIE_NAME, { ...common, httpOnly: false, path: '/' });
}

/**
 * Validates the double-submit CSRF token for cookie-authenticated state-changing requests.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
export function hasValidCsrfToken(req) {
  const cookies = parseCookies(req);
  const cookieToken = cookies[config.CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];
  if (!cookieToken || typeof headerToken !== 'string') {
    return false;
  }
  return timingSafeEqualString(cookieToken, headerToken);
}

