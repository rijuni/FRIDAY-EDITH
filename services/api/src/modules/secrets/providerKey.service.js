import { prisma } from '../../repositories/prisma.js';
import { encryptSecret, decryptSecret, maskSecret } from '../../security/crypto.js';
import { auditService } from '../audit/audit.service.js';

export const SUPPORTED_PROVIDERS = ['anthropic', 'gemini', 'openai', 'custom'];

export class ProviderKeyService {
  /**
   * Sets or updates an encrypted provider key for a user.
   * If isDefault is true, unsets isDefault on any other keys for this user.
   */
  async setProviderKey({ userId, provider, apiKey, isDefault = false, ip = null }) {
    if (!userId || typeof userId !== 'string') {
      const err = new Error('User ID is required');
      err.statusCode = 400;
      throw err;
    }

    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (!SUPPORTED_PROVIDERS.includes(normalizedProvider)) {
      const err = new Error(`Unsupported provider: ${provider}. Supported providers: ${SUPPORTED_PROVIDERS.join(', ')}`);
      err.statusCode = 400;
      throw err;
    }

    const trimmedKey = String(apiKey || '').trim();
    if (!trimmedKey || trimmedKey.length < 8 || trimmedKey.length > 500) {
      const err = new Error('API key must be between 8 and 500 characters');
      err.statusCode = 400;
      throw err;
    }

    const encryptedKey = encryptSecret(trimmedKey);

    const record = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.providerKey.updateMany({
          where: { userId },
          data: { isDefault: false }
        });
      }

      return tx.providerKey.upsert({
        where: {
          userId_provider: {
            userId,
            provider: normalizedProvider
          }
        },
        update: {
          encryptedKey,
          isDefault: Boolean(isDefault)
        },
        create: {
          userId,
          provider: normalizedProvider,
          encryptedKey,
          isDefault: Boolean(isDefault)
        }
      });
    });

    await auditService.logEvent({
      action: 'PROVIDER_KEY_SAVED',
      userId,
      resourceType: 'PROVIDER_KEY',
      resourceId: normalizedProvider,
      details: {
        provider: normalizedProvider,
        isDefault: record.isDefault,
        maskedKey: maskSecret(trimmedKey)
      },
      ip
    });

    return {
      id: record.id,
      provider: record.provider,
      isDefault: record.isDefault,
      createdAt: record.createdAt,
      maskedKey: maskSecret(trimmedKey)
    };
  }

  /**
   * Retrieves and decrypts the provider key for the given user.
   * Returns null if key does not exist.
   */
  async getDecryptedKey({ userId, provider }) {
    if (!userId || !provider) return null;
    const normalizedProvider = String(provider).trim().toLowerCase();

    const record = await prisma.providerKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: normalizedProvider
        }
      }
    });

    if (!record || !record.encryptedKey) return null;

    try {
      return decryptSecret(record.encryptedKey);
    } catch (err) {
      // Key may have been stored with outdated key or corrupted
      const error = new Error(`Failed to decrypt provider key for ${normalizedProvider}: ${err.message}`);
      error.statusCode = 500;
      throw error;
    }
  }

  /**
   * Lists all provider keys stored by a user, returning masked representations.
   * Never leaks raw decrypted keys.
   */
  async listUserKeys({ userId }) {
    if (!userId) return [];

    const records = await prisma.providerKey.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }]
    });

    return records.map((r) => {
      let maskedKey = '********';
      try {
        const decrypted = decryptSecret(r.encryptedKey);
        maskedKey = maskSecret(decrypted);
      } catch {
        maskedKey = '[decryption error]';
      }

      return {
        id: r.id,
        provider: r.provider,
        isDefault: r.isDefault,
        createdAt: r.createdAt,
        maskedKey
      };
    });
  }

  /**
   * Deletes a provider key for a user.
   */
  async deleteProviderKey({ userId, provider, ip = null }) {
    if (!userId || !provider) {
      const err = new Error('User ID and provider are required');
      err.statusCode = 400;
      throw err;
    }

    const normalizedProvider = String(provider).trim().toLowerCase();

    const existing = await prisma.providerKey.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: normalizedProvider
        }
      }
    });

    if (!existing) {
      const err = new Error(`Provider key for ${normalizedProvider} not found`);
      err.statusCode = 404;
      throw err;
    }

    await prisma.providerKey.delete({
      where: {
        userId_provider: {
          userId,
          provider: normalizedProvider
        }
      }
    });

    await auditService.logEvent({
      action: 'PROVIDER_KEY_DELETED',
      userId,
      resourceType: 'PROVIDER_KEY',
      resourceId: normalizedProvider,
      details: { provider: normalizedProvider },
      ip
    });

    return { success: true, provider: normalizedProvider };
  }

  /**
   * Resolves the active key for a user and provider.
   * Priority:
   * 1. User-specific vaulted key
   * 2. Server-side environment variable fallback
   */
  async resolveActiveKey({ userId, provider }) {
    const normalizedProvider = String(provider || '').trim().toLowerCase();

    // 1. Check user vault
    if (userId) {
      const userKey = await this.getDecryptedKey({ userId, provider: normalizedProvider });
      if (userKey) {
        return {
          key: userKey,
          source: 'user_vault',
          provider: normalizedProvider
        };
      }
    }

    // 2. Check environment variable
    let envKey = null;
    if (normalizedProvider === 'anthropic') {
      envKey = process.env.ANTHROPIC_API_KEY || null;
    } else if (normalizedProvider === 'gemini') {
      envKey = process.env.GEMINI_API_KEY || null;
    } else if (normalizedProvider === 'openai') {
      envKey = process.env.OPENAI_API_KEY || null;
    }

    if (envKey) {
      return {
        key: envKey,
        source: 'server_env',
        provider: normalizedProvider
      };
    }

    return {
      key: null,
      source: 'none',
      provider: normalizedProvider
    };
  }
}

export const providerKeyService = new ProviderKeyService();
