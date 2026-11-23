import crypto from 'crypto';
import { getRegisteredTool } from './toolRegistry.js';
import { prisma } from '../../repositories/prisma.js';

/**
 * Evaluates whether a tool invocation is permissible according to user scopes,
 * connection ownership, and risk classification.
 *
 * Implements:
 * - Scope minimization (Acceptance Case 6-05)
 * - User isolation (Acceptance Case 6-06)
 * - Action digest computation for write approval (Acceptance Case 6-10)
 *
 * @param {{
 *   user: { id: string, role: string },
 *   toolId: string,
 *   params: object,
 *   connectionId?: string
 * }} evaluationRequest
 */
export async function evaluateToolPolicy({ user, toolId, params = {}, connectionId = null }) {
  const tool = getRegisteredTool(toolId);
  if (!tool) {
    const error = new Error(`Tool '${toolId}' is not registered`);
    error.statusCode = 404;
    error.errorCode = 'TOOL_NOT_FOUND';
    throw error;
  }

  // 1. Connection & User Isolation Verification (Acceptance Case 6-06)
  let connection = null;
  if (connectionId) {
    connection = await prisma.integrationConnection.findFirst({
      where: { id: connectionId, userId: user.id }
    });

    if (!connection) {
      const error = new Error('Integration connection not found or does not belong to user');
      error.statusCode = 403;
      error.errorCode = 'INTEGRATION_ACCESS_DENIED';
      throw error;
    }

    if (connection.status !== 'ACTIVE') {
      const error = new Error(`Integration connection is ${connection.status.toLowerCase()}`);
      error.statusCode = 403;
      error.errorCode = 'CONNECTION_INACTIVE';
      throw error;
    }
  }

  // 2. Scope Minimization Verification (Acceptance Case 6-05)
  if (tool.requiredScopes.length > 0) {
    if (!connection) {
      const error = new Error(`Tool '${toolId}' requires an active integration connection with scopes: ${tool.requiredScopes.join(', ')}`);
      error.statusCode = 400;
      error.errorCode = 'CONNECTION_REQUIRED';
      throw error;
    }

    const grantedScopes = new Set(connection.scopes.split(/\s+/).filter(Boolean));
    const missingScopes = tool.requiredScopes.filter((scope) => !grantedScopes.has(scope));

    if (missingScopes.length > 0) {
      const error = new Error(`Scope minimization violation: connection lacks required scope(s): ${missingScopes.join(', ')}`);
      error.statusCode = 403;
      error.errorCode = 'INSUFFICIENT_SCOPES';
      throw error;
    }
  }

  // 3. Parameter schema validation
  if (tool.parametersSchema?.required) {
    for (const reqProp of tool.parametersSchema.required) {
      if (params[reqProp] === undefined || params[reqProp] === null || params[reqProp] === '') {
        const error = new Error(`Tool parameter '${reqProp}' is required`);
        error.statusCode = 400;
        error.errorCode = 'MISSING_TOOL_PARAMETER';
        throw error;
      }
    }
  }

  // 4. Action Digest & Write Approval Requirement (Acceptance Case 6-10)
  const isWrite = tool.riskClass === 'WRITE';
  let actionDigest = null;

  if (isWrite) {
    // Normalize parameters deterministically for hashing
    const normalizedKeys = Object.keys(params).sort();
    const normalizedObj = {};
    for (const k of normalizedKeys) normalizedObj[k] = params[k];

    actionDigest = crypto
      .createHash('sha256')
      .update(JSON.stringify({ toolId, params: normalizedObj, target: params.target || null }))
      .digest('hex');
  }

  return {
    allowed: true,
    tool,
    connection,
    requiresApproval: isWrite,
    actionDigest
  };
}

/**
 * Sanitizes tool output and wraps it as untrusted external reference context.
 * Anti-prompt-injection defense: external data must never grant tool authority or alter policy.
 * (Acceptance Case 6-09)
 *
 * @param {{ toolId: string, result: any, sourceLabel?: string }} outputData
 */
export function sanitizeToolOutput({ toolId, result, sourceLabel = 'External Connector' }) {
  const jsonStr = typeof result === 'string' ? result : JSON.stringify(result);

  return {
    toolId,
    isUntrustedContext: true,
    source: sourceLabel,
    guardedText: `[Untrusted External Data from ${sourceLabel}]\n${jsonStr}\n[End of External Data]`,
    data: result
  };
}
