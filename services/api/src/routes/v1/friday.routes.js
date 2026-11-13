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
      model: z.string().trim().min(1).max(100).optional(),
      temperature: z.number().min(0).max(2).optional(),
      systemPrompt: z.string().trim().max(8000).optional(),
      attachmentIds: z.array(z.string().min(1).max(64)).max(5).optional()
    })
    .strict()
};

const attachDocumentSchema = {
  params: z.object({
    id: z.string().min(1).max(64)
  }),
  body: z
    .object({
      filename: z.string().trim().min(1).max(160),
      mimeType: z.string().trim().min(1).max(100),
      content: z.string().min(1, 'File content cannot be empty').max(699052, 'File exceeds 512 KB limit'),
      encoding: z.enum(['utf8', 'base64']).default('utf8')
    })
    .strict()
};

const supportReportSchema = {
  body: z
    .object({
      category: z.enum(['bug', 'feature', 'account', 'connectivity']),
      subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(160),
      description: z.string().trim().min(10, 'Description must be at least 10 characters').max(4000),
      includeDiagnostics: z.boolean().optional().default(true)
    })
    .strict()
};

const createKnowledgeBaseSchema = {
  body: z.object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(1000).optional()
  }).strict()
};

const knowledgeBaseIdSchema = { params: z.object({ id: z.string().min(1).max(64) }) };
const ingestKnowledgeDocumentSchema = {
  params: z.object({ id: z.string().min(1).max(64) }),
  body: z.object({
    filename: z.string().trim().min(1).max(160),
    mimeType: z.string().trim().min(1).max(100),
    content: z.string().min(1).max(699052, 'File exceeds 512 KB limit'),
    encoding: z.enum(['utf8', 'base64']).default('utf8')
  }).strict()
};
const deleteKnowledgeDocumentSchema = {
  params: z.object({ id: z.string().min(1).max(64) }),
  body: z.object({ filename: z.string().trim().min(1).max(160) }).strict()
};
const memoryIdSchema = { params: z.object({ id: z.string().min(1).max(64) }) };
const memoryCategory = z.enum(['user_preference', 'project_context', 'coding_style', 'personal_fact']);
const createMemorySchema = {
  body: z.object({ category: memoryCategory, content: z.string().trim().min(1).max(2000) }).strict()
};
const updateMemorySchema = {
  params: z.object({ id: z.string().min(1).max(64) }),
  body: z.object({
    category: memoryCategory.optional(),
    content: z.string().trim().min(1).max(2000).optional()
  }).strict().refine((value) => value.category !== undefined || value.content !== undefined)
};

fridayRouter.get('/status', fridayController.getRuntimeStatus);
fridayRouter.get('/models', fridayController.listModels);
fridayRouter.post('/support', chatLimiter, validate(supportReportSchema), fridayController.submitSupportReport);
fridayRouter.post('/conversations', validate(createConvSchema), fridayController.createConversation);
fridayRouter.get('/conversations', validate(listConvSchema), fridayController.listConversations);
fridayRouter.get('/conversations/:id', validate(convIdParamsSchema), fridayController.getConversation);
fridayRouter.delete('/conversations/:id', validate(convIdParamsSchema), fridayController.deleteConversation);
fridayRouter.post(
  '/conversations/:id/attachments',
  chatLimiter,
  validate(attachDocumentSchema),
  fridayController.uploadAttachment
);
fridayRouter.get('/knowledge-bases', fridayController.listKnowledgeBases);
fridayRouter.post('/knowledge-bases', validate(createKnowledgeBaseSchema), fridayController.createKnowledgeBase);
fridayRouter.delete('/knowledge-bases/:id', validate(knowledgeBaseIdSchema), fridayController.deleteKnowledgeBase);
fridayRouter.get('/knowledge-bases/:id/documents', validate(knowledgeBaseIdSchema), fridayController.listKnowledgeDocuments);
fridayRouter.post(
  '/knowledge-bases/:id/documents', chatLimiter,
  validate(ingestKnowledgeDocumentSchema), fridayController.ingestKnowledgeDocument
);
fridayRouter.delete(
  '/knowledge-bases/:id/documents', validate(deleteKnowledgeDocumentSchema),
  fridayController.deleteKnowledgeDocument
);
fridayRouter.get('/memory', fridayController.listMemories);
fridayRouter.post('/memory', validate(createMemorySchema), fridayController.createMemory);
fridayRouter.patch('/memory/:id', validate(updateMemorySchema), fridayController.updateMemory);
fridayRouter.delete('/memory/:id', validate(memoryIdSchema), fridayController.deleteMemory);
fridayRouter.post(
  '/conversations/:id/messages',
  chatLimiter,
  validate(sendMessageSchema),
  fridayController.sendMessage
);

