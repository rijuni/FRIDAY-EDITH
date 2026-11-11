import crypto from 'crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

// OWASP recommended Argon2id configuration
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1
};

const KNOWN_MOCK_TOKEN_PREFIXES = ['mock_', 'jwt_token_', 'jwt_active_', 'google_jwt_token_'];

/**
 * Hashes a plaintext password using Argon2id.
 * @param {string} password
 * @returns {Promise<string>}
 */
export async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a plaintext password against an Argon2id hash.
 * @param {string} hash
 * @param {string} password
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(hash, password) {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Computes a deterministic SHA-256 hex digest for storing opaque or refresh tokens.
 * @param {string} token
 * @returns {string}
 */
export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Performs a constant-time comparison between two UTF-8 strings.
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
export function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Generates a cryptographically random opaque hex token (e.g., CSRF tokens).
 * @param {number} bytes
 * @returns {string}
 */
export function generateOpaqueToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Converts JWT-style duration strings (e.g. '15m', '7d', '3600') to milliseconds.
 * @param {string|number} duration
 * @param {number} fallbackMs
 * @returns {number}
 */
export function parseDurationToMs(duration, fallbackMs = 900_000) {
  if (typeof duration === 'number' && Number.isFinite(duration)) {
    return duration * 1000;
  }
  const match = String(duration || '').trim().match(/^(\d+)(ms|s|m|h|d)?$/i);
  if (!match) return fallbackMs;
  const value = Number(match[1]);
  const unit = (match[2] || 's').toLowerCase();
  const multipliers = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (multipliers[unit] || 1000);
}

/**
 * Generates signed HS256 access and refresh JWTs with strict issuer, audience, and jti claims.
 * @param {{ sub: string, email: string, role: string, orgId?: string }} payload
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export function generateTokens(payload) {
  const accessToken = jwt.sign(
    {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      ...(payload.orgId ? { orgId: payload.orgId } : {}),
      type: 'access'
    },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: config.JWT_EXPIRES_IN,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      jwtid: crypto.randomUUID()
    }
  );

  const refreshToken = jwt.sign(
    {
      sub: payload.sub,
      type: 'refresh'
    },
    config.JWT_SECRET,
    {
      algorithm: 'HS256',
      expiresIn: config.REFRESH_TOKEN_EXPIRES_IN,
      issuer: config.JWT_ISSUER,
      audience: config.JWT_AUDIENCE,
      jwtid: crypto.randomUUID()
    }
  );

  return { accessToken, refreshToken };
}

/**
 * Verifies a JWT signature, algorithm, issuer, audience, expiry, and expected token type.
 * Explicitly rejects known mock placeholder tokens.
 * @param {string} token
 * @param {'access'|'refresh'} [expectedType]
 * @returns {object}
 */
export function verifyToken(token, expectedType) {
  if (!token || typeof token !== 'string' || KNOWN_MOCK_TOKEN_PREFIXES.some((p) => token.startsWith(p))) {
    const err = new Error('Invalid authentication token');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  const decoded = jwt.verify(token, config.JWT_SECRET, {
    algorithms: ['HS256'],
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE
  });

  if (!decoded?.sub || (expectedType && decoded.type !== expectedType)) {
    const err = new Error('Invalid token type or missing subject');
    err.name = 'JsonWebTokenError';
    throw err;
  }

  return decoded;
}

