import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { chatLimiter } from '../../middleware/rateLimit.js';
import * as fridayController from '../../controllers/friday.controller.js';

export const fridayRouter = Router();

// All Friday endpoints require authentication
fridayRouter.use(authenticate);

const createConvSchema = {
  body: z
    .object({
      title: z.string().trim().min(1).max(160).optional(),
      modelPreference: z.string().trim().min(1).max(100).optional(),
      systemPrompt: z.string().trim().max(8000).optional()
    })
    .strict()
};

const listConvSchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0)
  })
};

const convIdParamsSchema = {
  params: z.object({
    id: z.string().min(1).max(64)
  })
};

const sendMessageSchema = {
  params: z.object({
    id: z.string().min(1).max(64)
  }),
  body: z
    .object({
      content: z.string().trim().min(1, 'Message content cannot be empty').max(32000),
      model: z.string().trim().min(1).max(100).optional()
    })
    .strict()
};

fridayRouter.post('/conversations', validate(createConvSchema), fridayController.createConversation);
fridayRouter.get('/conversations', validate(listConvSchema), fridayController.listConversations);
fridayRouter.get('/conversations/:id', validate(convIdParamsSchema), fridayController.getConversation);
fridayRouter.delete('/conversations/:id', validate(convIdParamsSchema), fridayController.deleteConversation);
fridayRouter.post(
  '/conversations/:id/messages',
  chatLimiter,
  validate(sendMessageSchema),
  fridayController.sendMessage
);

