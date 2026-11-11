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
 * Generates an access token and refresh token for a authenticated user.
 * @param {object} payload
 * @returns {{ accessToken: string, refreshToken: string }}
 */
export function generateTokens(payload) {
  const accessToken = jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN
  });

  const refreshToken = jwt.sign(
    { sub: payload.sub, type: 'refresh' },
    config.JWT_SECRET,
    { expiresIn: config.REFRESH_TOKEN_EXPIRES_IN }
  );

  return { accessToken, refreshToken };
}

/**
 * Verifies and decodes a JWT token.
 * @param {string} token
 * @returns {object}
 */
export function verifyToken(token) {
  return jwt.verify(token, config.JWT_SECRET);
}

