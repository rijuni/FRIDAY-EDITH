import { Router } from 'express';
import rateLimit from 'express-rate-limit';
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
const edithAgentLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => req.user.id,
  skip: (req) => req.body?.use_ai !== true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'fail', statusCode: 429, errorCode: 'EDITH_RATE_LIMITED', message: 'Too many Edith agent requests. Try again shortly.' }
});

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

function requireDeveloperAccess(req, res) {
  if (req.user?.role === 'DEVELOPER' || req.user?.role === 'ADMIN') return true;
  res.status(403).json({
    status: 'fail',
    statusCode: 403,
    errorCode: 'DEVELOPER_ACCESS_REQUIRED',
    message: 'E.D.I.T.H. command execution requires a developer or administrator account.'
  });
  return false;
}

async function resolveUserRunnerCwd(userId, requestedCwd) {
  const workspaceRoot = await getUserWorkspaceRoot(userId);
  const requestedPath = requestedCwd ? path.resolve(workspaceRoot, requestedCwd) : workspaceRoot;
  const resolved = await fs.realpath(requestedPath);
  const relative = path.relative(workspaceRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    const error = new Error('Command working directory is outside your Edith workspace.');
    error.statusCode = 403;
    throw error;
  }
  const stat = await fs.stat(resolved);
  if (!stat.isDirectory()) {
    const error = new Error('Command working directory must be a folder in your Edith workspace.');
    error.statusCode = 400;
    throw error;
  }
  return resolved;
}

function buildInternalHeaders(req) {
  return {
    'Content-Type': 'application/json',
    'X-Internal-Service-Token': config.INTERNAL_SERVICE_SECRET,
    'X-User-Id': req.user.id,
    'X-Request-Id': req.id || ''
  };
}

async function fetchJsonFromInternalService({ baseUrl, endpointPath, req, body, timeoutMs = config.AI_REQUEST_TIMEOUT_MS }) {
  const response = await fetch(`${baseUrl}${endpointPath}`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
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

async function forwardToService({ baseUrl, endpointPath, req, res, errorCode, unavailableMessage, body = req.body, timeoutMs }) {
  try {
    const { response, data } = await fetchJsonFromInternalService({
      baseUrl,
      endpointPath,
      req,
      body,
      ...(timeoutMs ? { timeoutMs } : {})
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
        target_file: z.string().trim().min(1).max(512).optional(),
        model: z.string().trim().min(1).max(100).optional(),
        use_ai: z.boolean().optional()
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
        approval_id: z.string().trim().min(1).max(64).optional(),
        cwd: z.string().trim().min(1).max(512).optional()
      })
      .strict()
  },
  taskCreate: {
    body: z.object({
      prompt: z.string().trim().min(1).max(8000),
      project_id: z.string().trim().min(1).max(64).optional(),
      target_file: z.string().trim().min(1).max(512).optional(),
      model: z.string().trim().min(1).max(100).optional(),
      use_ai: z.boolean().optional()
    }).strict()
  },
  taskList: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      offset: z.coerce.number().int().min(0).default(0)
    })
  },
  taskParams: {
    params: z.object({ id: z.string().trim().min(1).max(64) })
  }
};

// Autonomous Coding Agent Execution Loop
edithRouter.post('/agent/run', authenticate, edithAgentLimiter, validate(schemas.agentRun), async (req, res) => {
  return forwardToUserWorkspace({
    baseUrl: getEdithEngineUrl(),
    endpointPath: '/v1/agent/run',
    req,
    res,
    errorCode: 'EDITH_ENGINE_UNAVAILABLE',
    unavailableMessage: 'E.D.I.T.H. Agent Engine is offline or unreachable',
    timeoutMs: config.AI_STREAM_TIMEOUT_MS
  });
});

// Persist a bounded Edith task, its review-only result, and a proposal checkpoint.
edithRouter.post('/tasks', authenticate, edithAgentLimiter, validate(schemas.taskCreate), async (req, res) => {
  let task = null;
  try {
    const workspaceRoot = await getUserWorkspaceRoot(req.user.id);
    const project = await prisma.workspaceProject.findFirst({
      where: {
        userId: req.user.id,
        ...(req.body.project_id ? { id: req.body.project_id } : { name: 'Default workspace' })
      },
      select: { id: true, name: true, localPath: true }
    });
    if (!project) {
      return res.status(404).json({ status: 'fail', statusCode: 404, errorCode: 'PROJECT_NOT_FOUND', message: 'Edith workspace not found.' });
    }

    const projectRoot = await fs.realpath(project.localPath);
    const relative = path.relative(workspaceRoot, projectRoot);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return res.status(403).json({ status: 'fail', statusCode: 403, errorCode: 'PROJECT_PATH_DENIED', message: 'Edith projects must stay inside your isolated workspace.' });
    }

    task = await prisma.agentTask.create({
      data: { userId: req.user.id, projectId: project.id, prompt: req.body.prompt, status: 'QUEUED' },
      select: { id: true, projectId: true, userId: true, status: true, createdAt: true }
    });
    await prisma.agentTask.update({ where: { id: task.id }, data: { status: 'RUNNING' } });

    const { response, data } = await fetchJsonFromInternalService({
      baseUrl: getEdithEngineUrl(),
      endpointPath: '/v1/agent/run',
      req,
      timeoutMs: config.AI_STREAM_TIMEOUT_MS,
      body: {
        prompt: req.body.prompt,
        workspace_root: projectRoot,
        ...(req.body.target_file ? { target_file: req.body.target_file } : {}),
        ...(req.body.model ? { model: req.body.model } : {}),
        use_ai: req.body.use_ai === true
      }
    });
    if (!response.ok || !Array.isArray(data)) {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', resultSummary: 'The Edith engine did not return a valid task result.' }
      });
      return res.status(response.ok ? 502 : response.status).json({
        status: 'error', statusCode: response.ok ? 502 : response.status,
        errorCode: 'EDITH_TASK_FAILED', message: 'Edith could not complete this task. No workspace files were changed.',
        data: { taskId: task.id }
      });
    }

    const steps = data;
    const proposal = steps.find((step) => step?.phase === 'patch_proposal' && typeof step.file_path === 'string');
    const failed = steps.some((step) => step?.status === 'failed');
    const status = failed ? 'FAILED' : proposal ? 'WAITING_FOR_REVIEW' : 'SUCCEEDED';
    const finalStep = [...steps].reverse().find((step) => step?.phase === 'complete');
    const resultSummary = String(finalStep?.detail || 'Edith completed the bounded analysis task.').slice(0, 2000);
    const plan = JSON.stringify({ steps });
    const checkpoint = proposal ? {
      taskId: task.id,
      snapshotHash: crypto.createHash('sha256')
        .update(`${proposal.file_path}\n${proposal.original_content || ''}\n${proposal.modified_content || ''}`)
        .digest('hex'),
      description: 'Review-only code proposal. No workspace files were modified.',
      filesChanged: JSON.stringify([{
        path: proposal.file_path,
        diff: proposal.diff_text || '',
        applied: false
      }])
    } : null;

    const updatedTask = await prisma.$transaction(async (tx) => {
      const updated = await tx.agentTask.update({
        where: { id: task.id },
        data: { status, plan, resultSummary },
        select: { id: true, projectId: true, userId: true, prompt: true, status: true, resultSummary: true, createdAt: true, updatedAt: true }
      });
      if (checkpoint) await tx.checkpoint.create({ data: checkpoint });
      return updated;
    });
    await auditService.logEvent({
      action: failed ? 'EDITH_TASK_FAILED' : 'EDITH_TASK_COMPLETED',
      userId: req.user.id,
      resourceType: 'AGENT_TASK',
      resourceId: task.id,
      status: failed ? 'FAILURE' : 'SUCCESS',
      ip: req.ip,
      details: { projectId: project.id, useAi: req.body.use_ai === true, status }
    });
    return res.status(201).json({
      status: failed ? 'fail' : 'success',
      data: { task: updatedTask, steps }
    });
  } catch (error) {
    if (task) {
      await prisma.agentTask.update({
        where: { id: task.id },
        data: { status: 'FAILED', resultSummary: 'The Edith task stopped before producing a reviewable result.' }
      }).catch(() => {});
    }
    logger.error({ err: error?.message, requestId: req.id, taskId: task?.id }, 'Edith task execution failed');
    return res.status(502).json({
      status: 'error', statusCode: 502, errorCode: 'EDITH_TASK_FAILED',
      message: 'Edith could not complete this task. No workspace files were changed.',
      ...(task ? { data: { taskId: task.id } } : {})
    });
  }
});

edithRouter.get('/tasks', authenticate, validate(schemas.taskList), async (req, res) => {
  try {
    const { limit, offset } = req.query;
    const [tasks, total] = await prisma.$transaction([
      prisma.agentTask.findMany({
        where: { userId: req.user.id },
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit,
        select: {
          id: true, projectId: true, prompt: true, status: true, resultSummary: true,
          createdAt: true, updatedAt: true,
          project: { select: { name: true } },
          approvals: { select: { id: true, riskTier: true, status: true, createdAt: true } }
        }
      }),
      prisma.agentTask.count({ where: { userId: req.user.id } })
    ]);
    return res.status(200).json({ status: 'success', data: { tasks, total, limit, offset } });
  } catch (error) {
    logger.error({ err: error?.message, requestId: req.id }, 'Unable to list Edith tasks');
    return res.status(500).json({ status: 'error', statusCode: 500, errorCode: 'TASK_LIST_FAILED', message: 'Unable to load Edith tasks.' });
  }
});

edithRouter.get('/tasks/:id', authenticate, validate(schemas.taskParams), async (req, res) => {
  try {
    const task = await prisma.agentTask.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        project: { select: { name: true } },
        checkpoints: { orderBy: { createdAt: 'desc' } },
        approvals: { orderBy: { createdAt: 'desc' }, select: { id: true, command: true, riskTier: true, status: true, approvedByUserId: true, createdAt: true, resolvedAt: true } }
      }
    });
    if (!task) return res.status(404).json({ status: 'fail', statusCode: 404, errorCode: 'TASK_NOT_FOUND', message: 'Edith task not found.' });
    let result = null;
    if (task.plan) {
      try { result = JSON.parse(task.plan); } catch { result = null; }
    }
    const { plan: _plan, ...publicTask } = task;
    return res.status(200).json({ status: 'success', data: { task: publicTask, result } });
  } catch (error) {
    logger.error({ err: error?.message, requestId: req.id }, 'Unable to load Edith task');
    return res.status(500).json({ status: 'error', statusCode: 500, errorCode: 'TASK_READ_FAILED', message: 'Unable to load Edith task.' });
  }
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
  if (!requireDeveloperAccess(req, res)) return;
  const { command, approval_id: approvalId, cwd } = req.body;
  let safeCwd;
  try {
    safeCwd = await resolveUserRunnerCwd(req.user.id, cwd);
  } catch (error) {
    return res.status(error.statusCode || 400).json({
      status: 'fail', statusCode: error.statusCode || 400, errorCode: 'WORKSPACE_CWD_DENIED',
      message: error.message || 'Command working directory is outside your Edith workspace.'
    });
  }

  // 1. Fail-closed Policy Evaluation via Python Policy Gateway before touching Runner Host
  let policy = null;
  try {
    const policyRes = await fetchJsonFromInternalService({
      baseUrl: getEdithEngineUrl(),
      endpointPath: '/v1/agent/policies/evaluate',
      req,
      body: { command }
    });
    if (!policyRes.response.ok || !['SAFE', 'CONFIRMATION_REQUIRED', 'DENIED'].includes(policyRes.data?.decision)) {
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

  let approval = null;
  if (policy.decision === 'CONFIRMATION_REQUIRED' && !approvalId) {
    try {
      const workspaceRoot = await getUserWorkspaceRoot(req.user.id);
      const project = await prisma.workspaceProject.findFirst({
        where: { userId: req.user.id, name: 'Default workspace', localPath: workspaceRoot },
        select: { id: true }
      });
      if (!project) throw new Error('The authenticated user workspace is unavailable.');
      const task = await prisma.agentTask.create({
        data: {
          userId: req.user.id,
          projectId: project.id,
          prompt: 'Review and approve a requested command.',
          plan: JSON.stringify({ cwd: safeCwd }),
          status: 'WAITING_FOR_APPROVAL',
          approvals: {
            create: {
              command,
              riskTier: policy.risk_score >= 80 ? 'HIGH' : policy.risk_score >= 60 ? 'MEDIUM' : 'LOW',
              status: 'PENDING'
            }
          }
        },
        include: { approvals: { select: { id: true } } }
      });
      approval = { id: task.approvals[0].id, taskId: task.id };
    } catch (error) {
      logger.error({ err: error?.message, requestId: req.id }, 'Unable to persist Edith command approval');
      return res.status(500).json({
        status: 'error', statusCode: 500, errorCode: 'APPROVAL_PERSISTENCE_FAILED',
        message: 'Unable to create a durable command approval request.'
      });
    }
    await auditService.logEvent({
      action: 'EDITH_COMMAND_APPROVAL_REQUESTED',
      userId: req.user.id,
      resourceType: 'RUNNER_COMMAND',
      resourceId: approval.id,
      status: 'SUCCESS',
      ip: req.ip,
      details: { ...commandAuditFields(command), riskScore: policy.risk_score }
    });
    return res.status(409).json({
      status: 'fail',
      statusCode: 409,
      errorCode: 'APPROVAL_REQUIRED',
      message: 'A developer must approve this exact command before execution.',
      policy,
      data: { approvalId: approval.id, taskId: approval.taskId }
    });
  }

  if (policy.decision === 'CONFIRMATION_REQUIRED') {
    approval = await prisma.commandApproval.findUnique({
      where: { id: approvalId },
      include: { task: { select: { id: true, userId: true, plan: true } } }
    });
    if (!approval || approval.task.userId !== req.user.id) {
      return res.status(404).json({ status: 'fail', statusCode: 404, errorCode: 'APPROVAL_NOT_FOUND', message: 'Command approval was not found.' });
    }
    if (approval.command !== command || approval.status !== 'APPROVED') {
      return res.status(409).json({ status: 'fail', statusCode: 409, errorCode: 'APPROVAL_INVALID', message: 'This exact command needs a current approval.' });
    }
    let approvedPlan;
    try { approvedPlan = JSON.parse(approval.task.plan || '{}'); } catch { approvedPlan = {}; }
    if (approvedPlan.cwd !== safeCwd) {
      return res.status(409).json({ status: 'fail', statusCode: 409, errorCode: 'APPROVAL_SCOPE_MISMATCH', message: 'The working directory changed after approval. Request a new approval.' });
    }
    approval.taskId = approval.task.id;
    const consumed = await prisma.commandApproval.updateMany({
      where: { id: approval.id, status: 'APPROVED' },
      data: { status: 'EXECUTING' }
    });
    if (consumed.count !== 1) {
      return res.status(409).json({ status: 'fail', statusCode: 409, errorCode: 'APPROVAL_ALREADY_USED', message: 'This command approval has already been used.' });
    }
  } else if (approvalId) {
    return res.status(400).json({ status: 'fail', statusCode: 400, errorCode: 'UNEXPECTED_APPROVAL', message: 'This command does not require an approval.' });
  }

  // 2. Forward approved/safe command to the runner and only mark success when
  // the runner confirms it actually executed the command.
  try {
    const { response, data } = await fetchJsonFromInternalService({
      baseUrl: getRunnerHostUrl(),
      endpointPath: '/v1/execute',
      req,
      body: { command, cwd: safeCwd }
    });

    if (approval) {
      const taskStatus = response.ok ? 'SUCCEEDED' : data?.errorCode === 'ISOLATED_EXECUTION_UNAVAILABLE' ? 'BLOCKED' : 'FAILED';
      await prisma.$transaction([
        prisma.commandApproval.update({ where: { id: approval.id }, data: { status: response.ok ? 'EXECUTED' : 'FAILED' } }),
        prisma.agentTask.update({ where: { id: approval.taskId }, data: { status: taskStatus } })
      ]);
    }

    await auditService.logEvent({
      action: response.ok ? 'EDITH_COMMAND_DISPATCHED' : 'EDITH_COMMAND_EXECUTION_FAILED',
      userId: req.user.id,
      resourceType: 'RUNNER_COMMAND',
      status: response.ok ? 'SUCCESS' : 'FAILURE',
      ip: req.ip,
      details: {
        ...commandAuditFields(command),
        decision: policy.decision,
        approvalId: approval?.id,
        runnerStatus: response.status,
        errorCode: response.ok ? undefined : data?.errorCode
      }
    });
    return res.status(response.status).json(data ?? {});
  } catch (err) {
    if (approval) {
      await prisma.$transaction([
        prisma.commandApproval.update({ where: { id: approval.id }, data: { status: 'FAILED' } }),
        prisma.agentTask.update({ where: { id: approval.taskId }, data: { status: 'FAILED' } })
      ]).catch((dbError) => logger.error({ err: dbError?.message, approvalId: approval.id }, 'Unable to finalize failed command approval'));
    }
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
        approvalId: approval?.id,
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

edithRouter.patch('/approvals/:id', authenticate, async (req, res) => {
  if (!requireDeveloperAccess(req, res)) return;
  const parsed = z.object({ status: z.enum(['APPROVED', 'DENIED']) }).strict().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ status: 'fail', statusCode: 400, errorCode: 'INVALID_APPROVAL_DECISION', message: 'Approval status must be APPROVED or DENIED.' });
  }
  try {
    const approval = await prisma.commandApproval.findUnique({
      where: { id: req.params.id },
      include: { task: { select: { id: true, userId: true } } }
    });
    if (!approval || approval.task.userId !== req.user.id) {
      return res.status(404).json({ status: 'fail', statusCode: 404, errorCode: 'APPROVAL_NOT_FOUND', message: 'Command approval was not found.' });
    }
    if (approval.status !== 'PENDING') {
      return res.status(409).json({ status: 'fail', statusCode: 409, errorCode: 'APPROVAL_ALREADY_RESOLVED', message: 'This command approval has already been resolved.' });
    }
    const status = parsed.data.status;
    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.commandApproval.updateMany({
        where: { id: approval.id, status: 'PENDING' },
        data: { status, approvedByUserId: req.user.id, resolvedAt: new Date() }
      });
      if (changed.count !== 1) return null;
      const current = await tx.commandApproval.findUnique({ where: { id: approval.id } });
      await tx.agentTask.update({ where: { id: approval.task.id }, data: { status: status === 'APPROVED' ? 'APPROVED' : 'CANCELLED' } });
      return current;
    });
    if (!updated) {
      return res.status(409).json({ status: 'fail', statusCode: 409, errorCode: 'APPROVAL_ALREADY_RESOLVED', message: 'This command approval has already been resolved.' });
    }
    await auditService.logEvent({
      action: status === 'APPROVED' ? 'EDITH_COMMAND_APPROVED' : 'EDITH_COMMAND_DENIED',
      userId: req.user.id,
      resourceType: 'COMMAND_APPROVAL',
      resourceId: updated.id,
      status: 'SUCCESS',
      ip: req.ip,
      details: { commandHash: crypto.createHash('sha256').update(approval.command).digest('hex'), riskTier: approval.riskTier }
    });
    return res.status(200).json({ status: 'success', data: { approval: { id: updated.id, status: updated.status, resolvedAt: updated.resolvedAt } } });
  } catch (error) {
    logger.error({ err: error?.message, requestId: req.id }, 'Unable to resolve Edith command approval');
    return res.status(500).json({ status: 'error', statusCode: 500, errorCode: 'APPROVAL_UPDATE_FAILED', message: 'Unable to update command approval.' });
  }
});

edithRouter.get('/projects', authenticate, async (req, res) => {
  try {
    await getUserWorkspaceRoot(req.user.id);
    const projects = await prisma.workspaceProject.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, defaultBranch: true, createdAt: true, updatedAt: true }
    });
    return res.status(200).json({ status: 'success', data: { projects } });
  } catch (error) {
    logger.error({ err: error?.message, requestId: req.id }, 'Unable to list user projects');
    return res.status(500).json({
      status: 'error', statusCode: 500, errorCode: 'PROJECTS_UNAVAILABLE',
      message: 'Unable to load your Edith workspaces.'
    });
  }
});
