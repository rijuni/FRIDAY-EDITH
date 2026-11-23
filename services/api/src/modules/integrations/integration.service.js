import crypto from 'crypto';
import { prisma } from '../../repositories/prisma.js';
import { encryptSecret, decryptSecret, maskSecret, hashToken } from '../../security/crypto.js';
import { auditService } from '../audit/audit.service.js';

// Concurrency mutex map for token refresh single-flighting
const refreshLocks = new Map();

/**
 * Creates an OAuth 2.0 authorization URL with PKCE (S256) and one-use state.
 * @param {{ userId: string, provider: string, redirectUri: string, scopes: string[], authEndpoint?: string, clientId?: string }} params
 */
export async function createAuthorizationUrl({
  userId,
  provider,
  redirectUri,
  scopes = [],
  authEndpoint = 'https://oauth.provider.test/auth',
  clientId = 'friday-edith-client'
}) {
  if (!userId || !provider || !redirectUri) {
    throw new Error('userId, provider, and redirectUri are required to create an authorization URL');
  }

  // Generate PKCE code verifier (64 cryptographically random bytes, base64url encoded)
  const codeVerifier = crypto.randomBytes(48).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');

  // Generate one-use cryptographic state token
  const state = crypto.randomBytes(32).toString('hex');
  const stateHash = hashToken(state);
  const codeVerifierHash = hashToken(codeVerifier);

  // Store in database with a strict 10-minute expiry
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await prisma.integrationState.create({
    data: {
      stateHash,
      userId,
      provider,
      redirectUri,
      codeVerifierHash,
      expiresAt
    }
  });

  const scopeString = scopes.join(' ');
  const authUrl = new URL(authEndpoint);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  if (scopeString) {
    authUrl.searchParams.set('scope', scopeString);
  }

  return {
    authorizationUrl: authUrl.toString(),
    state,
    codeVerifier,
    expiresAt
  };
}

/**
 * Consumes an OAuth callback, verifies state and PKCE, encrypts tokens into vault.
 * State is atomic one-use; duplicate callbacks fail closed.
 * @param {{ state: string, code: string, redirectUri: string, codeVerifier: string, exchangeTokenFn: Function }} params
 */
export async function handleOAuthCallback({
  state,
  code,
  redirectUri,
  codeVerifier,
  exchangeTokenFn
}) {
  if (!state || !code || !codeVerifier) {
    const error = new Error('OAuth callback missing state, code, or codeVerifier parameter');
    error.statusCode = 400;
    error.errorCode = 'INVALID_OAUTH_PARAMS';
    throw error;
  }

  const stateHash = hashToken(state);
  const codeVerifierHash = hashToken(codeVerifier);

  // Atomic state verification & consumption
  const stateRecord = await prisma.$transaction(async (tx) => {
    const existing = await tx.integrationState.findUnique({
      where: { stateHash }
    });

    if (!existing) {
      const error = new Error('Invalid or unrecognized OAuth state token');
      error.statusCode = 400;
      error.errorCode = 'INVALID_OAUTH_STATE';
      throw error;
    }

    if (existing.consumedAt) {
      const error = new Error('OAuth state has already been consumed (replay attempt detected)');
      error.statusCode = 400;
      error.errorCode = 'OAUTH_STATE_REPLAY_DETECTED';
      throw error;
    }

    if (new Date() > existing.expiresAt) {
      const error = new Error('OAuth state has expired');
      error.statusCode = 400;
      error.errorCode = 'OAUTH_STATE_EXPIRED';
      throw error;
    }

    if (existing.redirectUri !== redirectUri) {
      const error = new Error('OAuth redirect_uri mismatch');
      error.statusCode = 400;
      error.errorCode = 'REDIRECT_URI_MISMATCH';
      throw error;
    }

    if (existing.codeVerifierHash && existing.codeVerifierHash !== codeVerifierHash) {
      const error = new Error('PKCE code verifier does not match challenge');
      error.statusCode = 400;
      error.errorCode = 'PKCE_VERIFICATION_FAILED';
      throw error;
    }

    // Mark consumed atomically
    await tx.integrationState.update({
      where: { id: existing.id },
      data: { consumedAt: new Date() }
    });

    return existing;
  });

  // Exchange code for tokens via connector adapter
  const tokenPayload = await exchangeTokenFn({
    code,
    redirectUri,
    codeVerifier,
    provider: stateRecord.provider
  });

  const {
    accessToken,
    refreshToken,
    expiresIn,
    scopes = [],
    externalAccountId = null,
    displayName = null
  } = tokenPayload;

  if (!accessToken) {
    const error = new Error('OAuth token exchange failed: missing access token from provider');
    error.statusCode = 502;
    error.errorCode = 'TOKEN_EXCHANGE_FAILED';
    throw error;
  }

  // Encrypt tokens into AES-256-GCM envelope format using master vault key
  const encryptedAccessToken = encryptSecret(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptSecret(refreshToken) : null;
  const scopesString = Array.isArray(scopes) ? scopes.join(' ') : String(scopes || '');
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null;

  // Persist or update connection for owner
  const connection = await prisma.integrationConnection.upsert({
    where: {
      userId_provider_externalAccountId: {
        userId: stateRecord.userId,
        provider: stateRecord.provider,
        externalAccountId: externalAccountId || 'default'
      }
    },
    create: {
      userId: stateRecord.userId,
      provider: stateRecord.provider,
      externalAccountId: externalAccountId || 'default',
      displayName: displayName || stateRecord.provider,
      encryptedAccessToken,
      encryptedRefreshToken,
      scopes: scopesString,
      status: 'ACTIVE',
      expiresAt
    },
    update: {
      displayName: displayName || stateRecord.provider,
      encryptedAccessToken,
      encryptedRefreshToken,
      scopes: scopesString,
      status: 'ACTIVE',
      expiresAt,
      updatedAt: new Date()
    }
  });

  await auditService.logEvent({
    action: 'INTEGRATION_CONNECTED',
    userId: stateRecord.userId,
    resourceType: 'INTEGRATION_CONNECTION',
    resourceId: connection.id,
    details: {
      provider: connection.provider,
      externalAccountId: connection.externalAccountId,
      displayName: connection.displayName,
      scopes: connection.scopes,
      expiresAt: connection.expiresAt
    }
  });

  return {
    id: connection.id,
    provider: connection.provider,
    externalAccountId: connection.externalAccountId,
    displayName: connection.displayName,
    maskedAccessToken: maskSecret(accessToken),
    scopes: connection.scopes.split(' ').filter(Boolean),
    status: connection.status,
    expiresAt: connection.expiresAt,
    createdAt: connection.createdAt
  };
}

/**
 * Lists active connections for an authenticated user, returning strictly masked credentials.
 * @param {{ userId: string }} params
 */
export async function listUserConnections({ userId }) {
  if (!userId) return [];

  const connections = await prisma.integrationConnection.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' }
  });

  return connections.map((conn) => {
    let maskedToken = '***';
    try {
      const dec = decryptSecret(conn.encryptedAccessToken);
      maskedToken = maskSecret(dec);
    } catch {
      maskedToken = '***';
    }

    return {
      id: conn.id,
      provider: conn.provider,
      externalAccountId: conn.externalAccountId,
      displayName: conn.displayName,
      maskedAccessToken: maskedToken,
      scopes: conn.scopes.split(' ').filter(Boolean),
      status: conn.status,
      expiresAt: conn.expiresAt,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt
    };
  });
}

/**
 * Disconnects and permanently deletes an integration connection and its vaulted secrets.
 * @param {{ userId: string, connectionId: string }} params
 */
export async function disconnectConnection({ userId, connectionId }) {
  const existing = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, userId }
  });

  if (!existing) {
    const error = new Error('Integration connection not found');
    error.statusCode = 404;
    error.errorCode = 'CONNECTION_NOT_FOUND';
    throw error;
  }

  await prisma.integrationConnection.delete({
    where: { id: existing.id }
  });

  await auditService.logEvent({
    action: 'INTEGRATION_DISCONNECTED',
    userId,
    resourceType: 'INTEGRATION_CONNECTION',
    resourceId: existing.id,
    details: {
      provider: existing.provider,
      externalAccountId: existing.externalAccountId,
      displayName: existing.displayName
    }
  });

  return { success: true, message: 'Integration disconnected and vault secrets removed' };
}

/**
 * Resolves an active decrypted access token for server-side connector execution.
 * Handles single-flight concurrency mutex for token refresh.
 * @param {{ userId: string, connectionId: string, refreshAdapterFn?: Function }} params
 */
export async function getValidAccessToken({ userId, connectionId, refreshAdapterFn }) {
  const connection = await prisma.integrationConnection.findFirst({
    where: { id: connectionId, userId }
  });

  if (!connection) {
    const error = new Error('Integration connection not found');
    error.statusCode = 404;
    error.errorCode = 'CONNECTION_NOT_FOUND';
    throw error;
  }

  if (connection.status !== 'ACTIVE') {
    const error = new Error(`Integration connection is ${connection.status.toLowerCase()}`);
    error.statusCode = 403;
    error.errorCode = 'CONNECTION_INACTIVE';
    throw error;
  }

  const now = Date.now();
  const isExpiringSoon = connection.expiresAt && connection.expiresAt.getTime() - now < 60_000;

  if (isExpiringSoon && connection.encryptedRefreshToken && typeof refreshAdapterFn === 'function') {
    const lockKey = `${connection.id}_refresh`;
    if (!refreshLocks.has(lockKey)) {
      refreshLocks.set(
        lockKey,
        (async () => {
          try {
            const rawRefreshToken = decryptSecret(connection.encryptedRefreshToken);
            const refreshed = await refreshAdapterFn({
              refreshToken: rawRefreshToken,
              provider: connection.provider
            });

            const newEncryptedAccess = encryptSecret(refreshed.accessToken);
            const newEncryptedRefresh = refreshed.refreshToken
              ? encryptSecret(refreshed.refreshToken)
              : connection.encryptedRefreshToken;
            const newExpiresAt = refreshed.expiresIn
              ? new Date(Date.now() + refreshed.expiresIn * 1000)
              : null;

            const updated = await prisma.integrationConnection.update({
              where: { id: connection.id },
              data: {
                encryptedAccessToken: newEncryptedAccess,
                encryptedRefreshToken: newEncryptedRefresh,
                expiresAt: newExpiresAt
              }
            });

            return decryptSecret(updated.encryptedAccessToken);
          } finally {
            refreshLocks.delete(lockKey);
          }
        })()
      );
    }
    return refreshLocks.get(lockKey);
  }

  try {
    return decryptSecret(connection.encryptedAccessToken);
  } catch (err) {
    const error = new Error('Failed to decrypt vaulted integration credentials');
    error.statusCode = 500;
    error.errorCode = 'CREDENTIAL_DECRYPTION_FAILED';
    throw error;
  }
}

export const integrationService = {
  createAuthorizationUrl,
  handleOAuthCallback,
  listUserConnections,
  disconnectConnection,
  getValidAccessToken
};
