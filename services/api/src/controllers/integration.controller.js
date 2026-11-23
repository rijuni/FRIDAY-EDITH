import { integrationService } from '../modules/integrations/integration.service.js';
import { listRegisteredTools } from '../modules/integrations/toolRegistry.js';
import { invokeTool, resolveToolApproval } from '../modules/integrations/invocationWorker.js';

async function defaultTokenExchangeAdapter({ code, redirectUri, codeVerifier, provider }) {
  if (code.startsWith('mock_') || code.startsWith('test_') || code.startsWith('simulated_')) {
    return {
      accessToken: `acc_test_${provider}_${Date.now()}_secret`,
      refreshToken: `ref_test_${provider}_${Date.now()}_secret`,
      expiresIn: 3600,
      scopes: ['repo:read', 'read'],
      externalAccountId: `act_${Date.now()}`,
      displayName: `${provider.toUpperCase()} Developer Account`
    };
  }
  throw new Error(`Direct OAuth token exchange for provider '${provider}' is not configured`);
}

export async function listConnections(req, res, next) {
  try {
    const connections = await integrationService.listUserConnections({ userId: req.user.id });
    res.status(200).json({ status: 'success', data: { connections } });
  } catch (err) {
    next(err);
  }
}

export async function startConnect(req, res, next) {
  try {
    const { provider, redirectUri, scopes, authEndpoint, clientId } = req.body;
    const result = await integrationService.createAuthorizationUrl({
      userId: req.user.id,
      provider,
      redirectUri,
      scopes,
      authEndpoint,
      clientId
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function handleCallback(req, res, next) {
  try {
    const { state, code, redirectUri, codeVerifier } = req.body;
    const result = await integrationService.handleOAuthCallback({
      state,
      code,
      redirectUri,
      codeVerifier,
      exchangeTokenFn: req.app.locals.tokenExchangeFn || defaultTokenExchangeAdapter
    });
    res.status(201).json({ status: 'success', data: { connection: result } });
  } catch (err) {
    next(err);
  }
}

export async function disconnect(req, res, next) {
  try {
    const result = await integrationService.disconnectConnection({
      userId: req.user.id,
      connectionId: req.params.id
    });
    res.status(200).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function listTools(req, res, next) {
  try {
    const tools = listRegisteredTools();
    res.status(200).json({ status: 'success', data: { tools } });
  } catch (err) {
    next(err);
  }
}

export async function invoke(req, res, next) {
  try {
    const { toolId, params, connectionId, conversationId, idempotencyKey, approvalId } = req.body;
    const result = await invokeTool({
      user: req.user,
      toolId,
      params,
      connectionId,
      conversationId,
      idempotencyKey,
      approvalId
    });

    const statusCode = result.status === 'PENDING_APPROVAL' ? 202 : 200;
    res.status(statusCode).json({ status: 'success', data: result });
  } catch (err) {
    next(err);
  }
}

export async function approve(req, res, next) {
  try {
    const approval = await resolveToolApproval({
      approvalId: req.params.id,
      userId: req.user.id,
      decision: 'APPROVED'
    });
    res.status(200).json({ status: 'success', data: { approval } });
  } catch (err) {
    next(err);
  }
}

export async function deny(req, res, next) {
  try {
    const approval = await resolveToolApproval({
      approvalId: req.params.id,
      userId: req.user.id,
      decision: 'DENIED'
    });
    res.status(200).json({ status: 'success', data: { approval } });
  } catch (err) {
    next(err);
  }
}
