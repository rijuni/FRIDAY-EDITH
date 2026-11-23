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

const VAULT_CIPHER_ALGORITHM = 'aes-256-gcm';
const VAULT_SALT_BYTES = 16;
const VAULT_IV_BYTES = 12; // 96-bit nonce standard for GCM
const VAULT_KEY_BYTES = 32; // 256-bit key
const VAULT_HKDF_INFO = Buffer.from('friday-edith-secret-vault', 'utf8');

/**
 * Derives a 256-bit key using HKDF-SHA256 from the master key and a salt.
 * @param {Buffer} salt
 * @param {string} [customKey]
 * @returns {Buffer}
 */
export function deriveSecretKey(salt, customKey = null) {
  const masterKey = customKey || config.ENCRYPTION_MASTER_KEY || config.JWT_SECRET;
  return crypto.hkdfSync('sha256', Buffer.from(masterKey, 'utf8'), salt, VAULT_HKDF_INFO, VAULT_KEY_BYTES);
}

/**
 * Encrypts a plaintext secret into an envelope string format:
 * "v1:<salt_hex>:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>"
 * Uses AES-256-GCM with authenticated tag to ensure confidentiality and integrity.
 * @param {string} plaintext
 * @param {string} [customKey]
 * @returns {string}
 */
export function encryptSecret(plaintext, customKey = null) {
  if (typeof plaintext !== 'string' || !plaintext) {
    throw new Error('Plaintext secret must be a non-empty string');
  }
  const salt = crypto.randomBytes(VAULT_SALT_BYTES);
  const iv = crypto.randomBytes(VAULT_IV_BYTES);
  const derivedKey = deriveSecretKey(salt, customKey);

  const cipher = crypto.createCipheriv(VAULT_CIPHER_ALGORITHM, derivedKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `v1:${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext.toString('hex')}`;
}

/**
 * Decrypts a secret envelope string created by encryptSecret.
 * Verifies authenticity tag; fails closed if tampered with.
 * @param {string} envelope
 * @param {string} [customKey]
 * @returns {string}
 */
export function decryptSecret(envelope, customKey = null) {
  if (typeof envelope !== 'string' || !envelope.startsWith('v1:')) {
    throw new Error('Invalid secret envelope format: missing v1 header');
  }
  const parts = envelope.split(':');
  if (parts.length !== 5) {
    throw new Error('Invalid secret envelope format: corrupt segments');
  }
  const [, saltHex, ivHex, authTagHex, ciphertextHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const ciphertext = Buffer.from(ciphertextHex, 'hex');

  if (salt.length !== VAULT_SALT_BYTES || iv.length !== VAULT_IV_BYTES || authTag.length !== 16) {
    throw new Error('Invalid secret envelope format: corrupt cryptographic parameters');
  }

  const derivedKey = deriveSecretKey(salt, customKey);
  const decipher = crypto.createDecipheriv(VAULT_CIPHER_ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (err) {
    const error = new Error('Secret decryption failed: authentication tag verification failed or key mismatch');
    error.statusCode = 400;
    throw error;
  }
}

/**
 * Masks a sensitive secret for safe client-side listing / auditing.
 * Never displays more than the trailing 4 characters.
 * @param {string} secret
 * @returns {string}
 */
export function maskSecret(secret) {
  if (typeof secret !== 'string' || !secret) return '***';
  if (secret.length <= 8) return '********';
  const prefix = secret.startsWith('sk-') ? 'sk-...' : '...';
  const suffix = secret.slice(-4);
  return `${prefix}${suffix}`;
}


