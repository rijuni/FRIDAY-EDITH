import { prisma } from '../../repositories/prisma.js';
import { evaluateToolPolicy, sanitizeToolOutput } from './policyGateway.js';
import { getValidAccessToken } from './integration.service.js';
import { auditService } from '../audit/audit.service.js';

const INVOCATION_TIMEOUT_MS = 30000;

/**
 * Executes a tool through policy enforcement, approval gates, and idempotency control.
 *
 * Implements:
 * - Approval gate verification (Acceptance Case 6-10)
 * - Idempotency deduplication (Acceptance Case 6-11)
 * - Bounded timeouts & error handling (Acceptance Case 6-12)
 *
 * @param {{
 *   user: { id: string, role: string },
 *   toolId: string,
 *   params: object,
 *   connectionId?: string,
 *   conversationId?: string,
 *   idempotencyKey: string,
 *   approvalId?: string
 * }} invocationRequest
 */
export async function invokeTool({
  user,
  toolId,
  params = {},
  connectionId = null,
  conversationId = null,
  idempotencyKey,
  approvalId = null
}) {
  if (!idempotencyKey) {
    const error = new Error('idempotencyKey is required for tool invocation');
    error.statusCode = 400;
    error.errorCode = 'IDEMPOTENCY_KEY_REQUIRED';
    throw error;
  }

  // 1. Idempotency Check (Acceptance Case 6-11)
  const existing = await prisma.toolInvocation.findUnique({
    where: { idempotencyKey }
  });

  if (existing) {
    if (existing.userId !== user.id) {
      const error = new Error('Idempotency key collision across different users');
      error.statusCode = 409;
      error.errorCode = 'IDEMPOTENCY_COLLISION';
      throw error;
    }
    // Return existing result/status safely
    return {
      invocationId: existing.id,
      status: existing.status,
      isReplay: true,
      result: existing.resultSummary ? JSON.parse(existing.resultSummary) : null,
      error: existing.errorMessage
    };
  }

  // 2. Policy Evaluation
  const policy = await evaluateToolPolicy({
    user,
    toolId,
    params,
    connectionId
  });

  // 3. Write Approval Verification (Acceptance Case 6-10)
  if (policy.requiresApproval) {
    if (!approvalId) {
      // Create pending ToolInvocation and ToolApproval
      const invocation = await prisma.toolInvocation.create({
        data: {
          userId: user.id,
          connectionId: connectionId || null,
          conversationId: conversationId || null,
          toolId,
          status: 'PENDING_APPROVAL',
          idempotencyKey,
          redactedInputSummary: JSON.stringify(params).slice(0, 500)
        }
      });

      const approval = await prisma.toolApproval.create({
        data: {
          invocationId: invocation.id,
          actionDigest: policy.actionDigest,
          status: 'PENDING',
          expiresAt: new Date(Date.now() + 15 * 60 * 1000) // 15m expiration
        }
      });

      return {
        invocationId: invocation.id,
        approvalId: approval.id,
        status: 'PENDING_APPROVAL',
        requiresApproval: true,
        actionDigest: policy.actionDigest,
        message: 'This write action requires user confirmation before execution.'
      };
    }

    // Verify existing approval
    const approval = await prisma.toolApproval.findUnique({
      where: { id: approvalId },
      include: { invocation: true }
    });

    if (!approval || approval.invocation.userId !== user.id) {
      const error = new Error('Invalid or unauthorized approval ID');
      error.statusCode = 403;
      error.errorCode = 'APPROVAL_NOT_FOUND';
      throw error;
    }

    if (approval.status !== 'APPROVED') {
      const error = new Error(`Action has not been approved (status: ${approval.status})`);
      error.statusCode = 403;
      error.errorCode = 'APPROVAL_NOT_GRANTED';
      throw error;
    }

    if (approval.actionDigest !== policy.actionDigest) {
      const error = new Error('Action parameters have been modified since approval (digest mismatch)');
      error.statusCode = 400;
      error.errorCode = 'ACTION_DIGEST_MISMATCH';
      throw error;
    }

    if (new Date() > approval.expiresAt) {
      const error = new Error('Approval has expired');
      error.statusCode = 400;
      error.errorCode = 'APPROVAL_EXPIRED';
      throw error;
    }
  }

  // 4. Resolve access token if backed by connection
  let accessToken = null;
  if (connectionId) {
    accessToken = await getValidAccessToken({
      userId: user.id,
      connectionId
    });
  }

  // 5. Create invocation record
  const invocation = await prisma.toolInvocation.create({
    data: {
      userId: user.id,
      connectionId: connectionId || null,
      conversationId: conversationId || null,
      toolId,
      status: 'RUNNING',
      idempotencyKey,
      approvalId: approvalId || null,
      redactedInputSummary: JSON.stringify(params).slice(0, 500)
    }
  });

  // 6. Execute bounded tool with timeout (Acceptance Case 6-12)
  let rawResult;
  let status = 'COMPLETED';
  let errorMessage = null;

  try {
    rawResult = await Promise.race([
      policy.tool.execute({ user, params, accessToken }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Tool execution timed out after ${INVOCATION_TIMEOUT_MS}ms`)), INVOCATION_TIMEOUT_MS)
      )
    ]);
  } catch (err) {
    status = 'FAILED';
    errorMessage = err.message || 'Tool execution encountered an unexpected error';
  }

  // Wrap output with anti-prompt-injection sanitization
  const sanitized = rawResult
    ? sanitizeToolOutput({
        toolId,
        result: rawResult,
        sourceLabel: policy.connection?.displayName || policy.tool.name
      })
    : null;

  const resultSummaryStr = sanitized ? JSON.stringify(sanitized) : null;

  // 7. Update invocation status in database
  await prisma.toolInvocation.update({
    where: { id: invocation.id },
    data: {
      status,
      resultSummary: resultSummaryStr ? resultSummaryStr.slice(0, 10000) : null,
      errorMessage
    }
  });

  // 8. Log audit trail
  await auditService.logEvent({
    action: 'TOOL_INVOKED',
    userId: user.id,
    resourceType: 'TOOL_INVOCATION',
    resourceId: invocation.id,
    status: status === 'COMPLETED' ? 'SUCCESS' : 'FAILURE',
    details: {
      toolId,
      connectionId,
      status,
      errorMessage,
      idempotencyKey
    }
  });

  if (status === 'FAILED') {
    const error = new Error(errorMessage);
    error.statusCode = 502;
    error.errorCode = 'TOOL_EXECUTION_FAILED';
    throw error;
  }

  return {
    invocationId: invocation.id,
    status: 'COMPLETED',
    result: sanitized
  };
}

/**
 * Resolves approval state (approves or denies a pending tool invocation).
 * @param {{ approvalId: string, userId: string, decision: 'APPROVED' | 'DENIED' }} params
 */
export async function resolveToolApproval({ approvalId, userId, decision }) {
  const approval = await prisma.toolApproval.findUnique({
    where: { id: approvalId },
    include: { invocation: true }
  });

  if (!approval || approval.invocation.userId !== userId) {
    const error = new Error('Approval not found or does not belong to user');
    error.statusCode = 404;
    error.errorCode = 'APPROVAL_NOT_FOUND';
    throw error;
  }

  if (approval.status !== 'PENDING') {
    const error = new Error(`Approval has already been resolved (${approval.status})`);
    error.statusCode = 400;
    error.errorCode = 'APPROVAL_ALREADY_RESOLVED';
    throw error;
  }

  const updated = await prisma.toolApproval.update({
    where: { id: approvalId },
    data: {
      status: decision,
      approvedBy: decision === 'APPROVED' ? userId : null,
      resolvedAt: new Date()
    }
  });

  if (decision === 'DENIED') {
    await prisma.toolInvocation.update({
      where: { id: approval.invocationId },
      data: { status: 'DENIED', errorMessage: 'Action was denied by user' }
    });
  }

  await auditService.logEvent({
    action: decision === 'APPROVED' ? 'TOOL_APPROVAL_GRANTED' : 'TOOL_APPROVAL_DENIED',
    userId,
    resourceType: 'TOOL_APPROVAL',
    resourceId: approvalId,
    details: {
      invocationId: approval.invocationId,
      actionDigest: approval.actionDigest
    }
  });

  return updated;
}
