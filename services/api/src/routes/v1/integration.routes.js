import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as integrationController from '../../controllers/integration.controller.js';

export const integrationRouter = Router();

// All integration endpoints require authentication
integrationRouter.use(authenticate);

const startConnectSchema = {
  body: z.object({
    provider: z.string().trim().min(2).max(64),
    redirectUri: z.string().url().max(512),
    scopes: z.array(z.string().trim().min(1)).optional().default([]),
    authEndpoint: z.string().url().optional(),
    clientId: z.string().trim().optional()
  }).strict()
};

const callbackSchema = {
  body: z.object({
    state: z.string().trim().min(16).max(128),
    code: z.string().trim().min(1).max(512),
    redirectUri: z.string().url().max(512),
    codeVerifier: z.string().trim().min(16).max(128)
  }).strict()
};

const idParamSchema = {
  params: z.object({
    id: z.string().min(1).max(64)
  })
};

const invokeToolSchema = {
  body: z.object({
    toolId: z.string().trim().min(1).max(64),
    params: z.record(z.any()).optional().default({}),
    connectionId: z.string().trim().min(1).max(64).optional(),
    conversationId: z.string().trim().min(1).max(64).optional(),
    idempotencyKey: z.string().trim().min(8).max(128),
    approvalId: z.string().trim().min(1).max(64).optional()
  }).strict()
};

integrationRouter.get('/', integrationController.listConnections);
integrationRouter.post('/connect', validate(startConnectSchema), integrationController.startConnect);
integrationRouter.post('/callback', validate(callbackSchema), integrationController.handleCallback);
integrationRouter.delete('/:id', validate(idParamSchema), integrationController.disconnect);

integrationRouter.get('/tools', integrationController.listTools);
integrationRouter.post('/tools/invoke', validate(invokeToolSchema), integrationController.invoke);
integrationRouter.post('/approvals/:id/approve', validate(idParamSchema), integrationController.approve);
integrationRouter.post('/approvals/:id/deny', validate(idParamSchema), integrationController.deny);
