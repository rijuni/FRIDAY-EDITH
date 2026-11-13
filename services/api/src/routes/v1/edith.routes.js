import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../../config/index.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { auditService } from '../../modules/audit/audit.service.js';
import { prisma } from '../../repositories/prisma.js';
import { logger } from '../../utils/logger.js';

export const edithRouter = Router();
const MAX_INTERNAL_RESPONSE_BYTES = 8 * 1024 * 1024;

function commandAuditFields(command) {
  return {
    commandHash: crypto.createHash('sha256').update(command).digest('hex'),
    commandLength: command.length
  };
}

function getEdithEngineUrl() {
  return process.env.EDITH_ENGINE_URL || config.EDITH_ENGINE_SERVICE_URL;
}

function getRunnerHostUrl() {
  return process.env.RUNNER_HOST_URL || config.EDITH_RUNNER_SERVICE_URL;
}

function buildInternalHeaders(req) {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Service-Token': config.INTERNAL_SERVICE_SECRET,
    'X-User-Id': req.user.id,
    'X-Request-Id': req.id || ''
  };
}

async function fetchJsonFromInternalService({ baseUrl, endpointPath, req, body }) {
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: 'POST',
    signal: AbortSignal.timeout(config.AI_REQUEST_TIMEOUT_MS),
    headers: buildInternalHeaders(req),
    body: JSON.stringify(body)
  });

  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_INTERNAL_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new Error('Internal service response exceeded the size limit.');
  }

  const chunks = [];
  let totalBytes = 0;
  if (response.body) {
    for await (const chunk of response.body) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_INTERNAL_RESPONSE_BYTES) {
        throw new Error('Internal service response exceeded the size limit.');
      }
      chunks.push(chunk);
    }
  }
  const text = Buffer.concat(chunks).toString('utf8');
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }
  return { response, data };
}

async function forwardToService({ baseUrl, endpointPath, req, res, errorCode, unavailableMessage, body = req.body }) {
  try {
    const { response, data } = await fetchJsonFromInternalService({
      baseUrl,
      endpointPath,
      req,
      body
    });
    return res.status(response.status).json(data ?? {});
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const statusCode = isTimeout ? 504 : 502;
    logger.error({ err: err?.message, endpointPath, requestId: req.id }, unavailableMessage);
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      errorCode: isTimeout ? 'EDITH_SERVICE_TIMEOUT' : errorCode,
      message: unavailableMessage
    });
  }
}

async function getUserWorkspaceRoot(userId) {
  await fs.mkdir(config.EDITH_WORKSPACES_DIR, { recursive: true });
  const baseRoot = await fs.realpath(config.EDITH_WORKSPACES_DIR);
  const workspaceKey = crypto.createHash('sha256').update(userId).digest('hex').slice(0, 32);
  const candidate = path.join(baseRoot, workspaceKey);
  await fs.mkdir(candidate, { recursive: true });
  const workspaceRoot = await fs.realpath(candidate);
  const relative = path.relative(baseRoot, workspaceRoot);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Resolved workspace path escapes the configured workspace directory.');
  }

  const project = await prisma.workspaceProject.findFirst({
    where: { userId, name: 'Default workspace' },
    select: { id: true, localPath: true }
  });
  if (!project) {
    await prisma.workspaceProject.create({
      data: { userId, name: 'Default workspace', localPath: workspaceRoot }
    });
  } else if (path.resolve(project.localPath) !== workspaceRoot) {
    await prisma.workspaceProject.update({
      where: { id: project.id },
      data: { localPath: workspaceRoot }
    });
  }
  return workspaceRoot;
}

async function forwardToUserWorkspace(options) {
  const { req, res } = options;
  try {
    const workspaceRoot = await getUserWorkspaceRoot(req.user.id);
    return await forwardToService({
      ...options,
      body: { ...req.body, workspace_root: workspaceRoot }
    });
  } catch (err) {
    logger.error({ err: err?.message, requestId: req.id }, 'Unable to resolve the caller workspace');
    return res.status(500).json({
      status: 'error',
      statusCode: 500,
      errorCode: 'WORKSPACE_UNAVAILABLE',
      message: 'Unable to access the authenticated user workspace.'
    });
  }
}

const schemas = {
  agentRun: {
    body: z
      .object({
        prompt: z.string().trim().min(1).max(8000),
        workspace_root: z.string().trim().min(1).max(512).optional(),
        target_file: z.string().trim().min(1).max(512).optional()
      })
      .strict()
  },
  taskPlan: {
    body: z
      .object({
        goal: z.string().trim().min(1).max(4000),
        workspace_root: z.string().trim().min(1).max(512).optional(),
        target_files: z.array(z.string().trim().min(1).max(512)).max(25).optional()
      })
      .strict()
  },
  policyEvaluate: {
    body: z
      .object({
        command: z.string().trim().min(1).max(2000)
      })
      .strict()
  },
  diffGenerate: {
    body: z
      .object({
        file_path: z.string().trim().min(1).max(512),
        original_content: z.string().max(1_048_576),
        modified_content: z.string().max(1_048_576)
      })
      .strict()
  },
  diffApply: {
    body: z
      .object({
        original_content: z.string().max(1_048_576),
        patch_text: z.string().max(1_048_576)
      })
      .strict()
  },
  repositoryScan: {
    body: z
      .object({
        workspace_root: z.string().trim().min(1).max(512).optional(),
        max_files: z.coerce.number().int().min(1).max(500).optional()
      })
      .strict()
  },
  fileRead: {
    body: z
      .object({
        relative_path: z.string().trim().min(1).max(512),
        workspace_root: z.string().trim().min(1).max(512).optional()
      })
      .strict()
  },
  execute: {
    body: z
      .object({
        command: z.string().trim().min(1).max(2000),
        approved: z.boolean().optional(),
        cwd: z.string().trim().min(1).max(512).optional()
      })
      .strict()
  }
};

// Autonomous Coding Agent Execution Loop
edithRouter.post('/agent/run', authenticate, validate(schemas.agentRun), async (req, res) => {
  return forwardToUserWorkspace({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/run',
    req,
    res,
    errorCode: 'EDITH_ENGINE_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Agent Engine is offline or unreachable'
  });
});

// Task Decomposition Plan
edithRouter.post('/tasks/plan', authenticate, validate(schemas.taskPlan), async (req, res) => {
  return forwardToUserWorkspace({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/plan',
    req,
    res,
    errorCode: 'EDITH_ENGINE_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Planner Engine is offline or unreachable'
  });
});

// Command Policy Evaluation (SAFE / CONFIRMATION_REQUIRED / DENIED)
edithRouter.post('/policies/evaluate', authenticate, validate(schemas.policyEvaluate), async (req, res) => {
  return forwardToService({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/policies/evaluate',
    req,
    res,
    errorCode: 'POLICY_ENGINE_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Policy Engine is offline or unreachable'
  });
});

// Diff Generation
edithRouter.post('/diff/generate', authenticate, validate(schemas.diffGenerate), async (req, res) => {
  return forwardToService({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/diff/generate',
    req,
    res,
    errorCode: 'DIFF_ENGINE_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Diff Engine is offline or unreachable'
  });
});

// Strict Diff Patch Application
edithRouter.post('/diff/apply', authenticate, validate(schemas.diffApply), async (req, res) => {
  return forwardToService({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/diff/apply',
    req,
    res,
    errorCode: 'DIFF_ENGINE_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Diff Engine is offline or unreachable'
  });
});

// Repository AST Scan
edithRouter.post('/repository/scan', authenticate, validate(schemas.repositoryScan), async (req, res) => {
  return forwardToUserWorkspace({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/repository/scan',
    req,
    res,
    errorCode: 'AST_INDEXER_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Repository Indexer is offline or unreachable'
  });
});

// Allowlisted Workspace File Read
edithRouter.post('/files/read', authenticate, validate(schemas.fileRead), async (req, res) => {
  return forwardToUserWorkspace({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/files/read',
    req,
    res,
    errorCode: 'WORKSPACE_READ_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Workspace File Reader is offline or unreachable'
  });
});

// Policy-Enforced Runner Execution Forwarder (Fail-Closed)
edithRouter.post('/execute', authenticate, validate(schemas.execute), async (req, res) => {
  const { command, approved = false, cwd } = req.body;

  // 1. Fail-closed Policy Evaluation via Python Policy Gateway before touching Runner Host
  let policy = null;
  try {
    const policyRes = await fetchJsonFromInternalService({
      baseUrl: getEdithEngineUrl(),
      endpointPath: '/v1/agent/policies/evaluate',
      req,
      body: { command }
    });
    if (!policyRes.response.ok || !policyRes.data?.decision) {
      return res.status(502).json({
        status: 'error',
        statusCode: 502,
        errorCode: 'POLICY_ENGINE_UNAVAILABLE',
        message: 'Command policy evaluation failed; execution blocked fail-closed.'
      });
    }
    policy = policyRes.data;
  } catch (err) {
    logger.error({ err: err?.message, requestId: req.id }, 'Policy check failed before command execution');
    return res.status(502).json({
      status: 'error',
      statusCode: 502,
      errorCode: 'POLICY_ENGINE_UNAVAILABLE',
      message: 'Command policy engine unreachable; execution blocked fail-closed.'
    });
  }

  if (policy.decision === 'DENIED') {
    await auditService.logEvent({
      action: 'EDITH_COMMAND_DENIED',
      userId: req.user.id,
      resourceType: 'RUNNER_COMMAND',
      status: 'FAILURE',
      ip: req.ip,
      details: { ...commandAuditFields(command), riskScore: policy.risk_score, reason: policy.reason }
    });
    return res.status(403).json({
      status: 'fail',
      statusCode: 403,
      errorCode: 'POLICY_DENIED',
      message: policy.reason || 'Command prohibited by zero-trust policy gateway.',
      policy
    });
  }

  if (policy.decision === 'CONFIRMATION_REQUIRED' && approved !== true) {
    await auditService.logEvent({
      action: 'EDITH_COMMAND_APPROVAL_REQUIRED',
      userId: req.user.id,
      resourceType: 'RUNNER_COMMAND',
      status: 'FAILURE',
      ip: req.ip,
      details: { ...commandAuditFields(command), riskScore: policy.risk_score }
    });
    return res.status(409).json({
      status: 'fail',
      statusCode: 409,
      errorCode: 'APPROVAL_REQUIRED',
      message: policy.reason || 'Explicit human confirmation required before executing command.',
      policy
    });
  }

  // 2. Forward approved/safe command to the runner and only mark success when
  // the runner confirms it actually executed the command.
  try {
    const { response, data } = await fetchJsonFromInternalService({
      baseUrl: getRunnerHostUrl(),
      endpointPath: '/v1/execute',
      req,
      body: { command, ...(cwd ? { cwd } : {}) }
    });

    await auditService.logEvent({
      action: response.ok ? 'EDITH_COMMAND_DISPATCHED' : 'EDITH_COMMAND_EXECUTION_FAILED',
      userId: req.user.id,
      resourceType: 'RUNNER_COMMAND',
      status: response.ok ? 'SUCCESS' : 'FAILURE',
      ip: req.ip,
      details: {
        ...commandAuditFields(command),
        decision: policy.decision,
        approved: Boolean(approved),
        runnerStatus: response.status,
        errorCode: response.ok ? undefined : data?.errorCode
      }
    });
    return res.status(response.status).json(data ?? {});
  } catch (err) {
    const isTimeout = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    const statusCode = isTimeout ? 504 : 502;
    logger.error({ err: err?.message, requestId: req.id }, 'Runner host unreachable during execute');
    await auditService.logEvent({
      action: 'EDITH_COMMAND_EXECUTION_FAILED',
      userId: req.user.id,
      resourceType: 'RUNNER_COMMAND',
      status: 'FAILURE',
      ip: req.ip,
      details: {
        ...commandAuditFields(command),
        decision: policy.decision,
        approved: Boolean(approved),
        errorCode: isTimeout ? 'RUNNER_TIMEOUT' : 'RUNNER_UNAVAILABLE'
      }
    });
    return res.status(statusCode).json({
      status: 'error',
      statusCode,
      errorCode: isTimeout ? 'RUNNER_TIMEOUT' : 'RUNNER_UNAVAILABLE',
      message: 'Isolated Sandbox Runner (Host 8003) is offline or unreachable'
    });
  }
});
