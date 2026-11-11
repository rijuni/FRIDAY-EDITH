import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import * as fridayController from '../../controllers/friday.controller.js';

export const fridayRouter = Router();

// All Friday endpoints require authentication
fridayRouter.use(authenticate);

const createConvSchema = {
  body: z.object({
    title: z.string().optional(),
    modelPreference: z.string().optional(),
    systemPrompt: z.string().optional()
  })
};

const sendMessageSchema = {
  params: z.object({
    id: z.string().min(1)
  }),
  body: z.object({
    content: z.string().min(1, 'Message content cannot be empty'),
    model: z.string().optional()
  })
};

fridayRouter.post('/conversations', validate(createConvSchema), fridayController.createConversation);
fridayRouter.get('/conversations', fridayController.listConversations);
fridayRouter.get('/conversations/:id', fridayController.getConversation);
fridayRouter.post('/conversations/:id/messages', validate(sendMessageSchema), fridayController.sendMessage);
