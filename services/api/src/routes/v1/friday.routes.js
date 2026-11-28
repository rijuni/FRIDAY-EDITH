import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { chatLimiter } from '../../middleware/rateLimit.js';
import * as fridayController from '../../controllers/friday.controller.js';
import { prisma } from '../../repositories/prisma.js';
import { logger } from '../../utils/logger.js';
import { googleAdapter } from '../../modules/integrations/adapters/google.adapter.js';
import { getValidAccessToken } from '../../modules/integrations/integration.service.js';
import { sanitizeToolOutput } from '../../modules/integrations/policyGateway.js';

export const fridayRouter = Router();

// All Friday endpoints require authentication
fridayRouter.use(authenticate);

const createConvSchema = {
  body: z
    .object({
      title: z.string().trim().min(1).max(160).optional(),
      modelPreference: z.string().trim().min(1).max(100).optional(),
      systemPrompt: z.string().trim().max(8000).optional(),
      projectId: z.string().min(1).max(64).nullable().optional()
    })
    .strict()
};

const listConvSchema = {
  query: z.object({
    limit: z.coerce.number().int().min(1).max(100).default(25),
    offset: z.coerce.number().int().min(0).default(0),
    search: z.string().trim().max(120).default(''),
    archived: z.enum(['true', 'false']).default('false')
  })
};

const convIdParamsSchema = {
  params: z.object({
    id: z.string().min(1).max(64)
  })
};

const updateConvSchema = {
  params: convIdParamsSchema.params,
  body: z.object({
    title: z.string().trim().min(1).max(160).optional(),
    isPinned: z.boolean().optional(),
    isArchived: z.boolean().optional(),
    projectId: z.string().min(1).max(64).nullable().optional()
  }).strict().refine((value) => Object.keys(value).length > 0)
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

const reviseMessageSchema = {
  params: z.object({ id: z.string().min(1).max(64), messageId: z.string().min(1).max(64) }),
  body: z.object({ content: z.string().trim().min(1).max(32000) }).strict()
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
const streamAttachmentSchema = {
  params: z.object({ id: z.string().min(1).max(64) }),
  query: z.object({ filename: z.string().trim().min(1).max(160) })
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
const streamKnowledgeDocumentSchema = {
  params: z.object({ id: z.string().min(1).max(64) }),
  query: z.object({ filename: z.string().trim().min(1).max(160) })
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
fridayRouter.patch('/conversations/:id', validate(updateConvSchema), fridayController.updateConversation);
fridayRouter.delete('/conversations/:id', validate(convIdParamsSchema), fridayController.deleteConversation);
fridayRouter.post(
  '/conversations/:id/attachments',
  chatLimiter,
  validate(attachDocumentSchema),
  fridayController.uploadAttachment
);
fridayRouter.post(
  '/conversations/:id/attachments/upload',
  chatLimiter,
  validate(streamAttachmentSchema),
  fridayController.uploadAttachmentStream
);
fridayRouter.get('/knowledge-bases', fridayController.listKnowledgeBases);
fridayRouter.post('/knowledge-bases', validate(createKnowledgeBaseSchema), fridayController.createKnowledgeBase);
fridayRouter.delete('/knowledge-bases/:id', validate(knowledgeBaseIdSchema), fridayController.deleteKnowledgeBase);
fridayRouter.get('/knowledge-bases/:id/documents', validate(knowledgeBaseIdSchema), fridayController.listKnowledgeDocuments);
fridayRouter.post(
  '/knowledge-bases/:id/documents', chatLimiter,
  validate(ingestKnowledgeDocumentSchema), fridayController.ingestKnowledgeDocument
);
fridayRouter.post(
  '/knowledge-bases/:id/documents/upload', chatLimiter,
  validate(streamKnowledgeDocumentSchema), fridayController.ingestKnowledgeDocumentStream
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
fridayRouter.patch(
  '/conversations/:id/messages/:messageId',
  validate(reviseMessageSchema),
  fridayController.reviseMessage
);

// Google Workspace Integration Status & Context Endpoints
fridayRouter.get('/integrations/google/status', async (req, res) => {
  try {
    const connection = await prisma.integrationConnection.findFirst({
      where: { userId: req.user.id, provider: 'google', status: 'ACTIVE' },
      select: { id: true, displayName: true, scopes: true, expiresAt: true, updatedAt: true }
    });
    return res.status(200).json({
      status: 'success',
      data: {
        connected: Boolean(connection),
        connection: connection
          ? {
              id: connection.id,
              displayName: connection.displayName,
              scopes: connection.scopes.split(/\s+/).filter(Boolean),
              expiresAt: connection.expiresAt,
              updatedAt: connection.updatedAt
            }
          : null
      }
    });
  } catch (error) {
    logger.error({ err: error?.message, requestId: req.id }, 'Unable to get Google status');
    return res.status(500).json({
      status: 'error',
      statusCode: 500,
      message: 'Unable to check Google integration status.'
    });
  }
});

const googleContextSchema = {
  body: z.object({
    query: z.string().trim().max(200).optional(),
    includeGmail: z.boolean().optional().default(true),
    includeCalendar: z.boolean().optional().default(true),
    timeMin: z.string().max(50).optional(),
    timeMax: z.string().max(50).optional()
  }).strict()
};

fridayRouter.post('/integrations/google/context', validate(googleContextSchema), async (req, res) => {
  try {
    const { query = '', includeGmail = true, includeCalendar = true, timeMin, timeMax } = req.body;
    const connection = await prisma.integrationConnection.findFirst({
      where: { userId: req.user.id, provider: 'google', status: 'ACTIVE' }
    });
    if (!connection) {
      return res.status(403).json({
        status: 'fail',
        statusCode: 403,
        errorCode: 'GOOGLE_INTEGRATION_REQUIRED',
        message: 'A connected Google account is required to fetch workspace context.'
      });
    }

    const accessToken = await getValidAccessToken({ userId: req.user.id, connectionId: connection.id });
    const scopes = new Set(connection.scopes.split(/\s+/).filter(Boolean));

    let gmailData = null;
    if (includeGmail && (scopes.has('gmail:read') || scopes.has('https://www.googleapis.com/auth/gmail.readonly'))) {
      const searchRes = await googleAdapter.searchMessages({
        query: query || 'is:inbox',
        maxResults: 5,
        accessToken
      });
      const detailedMessages = [];
      for (const m of (searchRes.messages || []).slice(0, 3)) {
        try {
          const detail = await googleAdapter.getMessage({ messageId: m.id, accessToken });
          detailedMessages.push(detail);
        } catch {
          // Skip unreadable individual messages
        }
      }
      gmailData = {
        query: searchRes.query,
        count: detailedMessages.length,
        messages: detailedMessages
      };
    }

    let calendarData = null;
    if (includeCalendar && (scopes.has('calendar:read') || scopes.has('https://www.googleapis.com/auth/calendar.readonly'))) {
      calendarData = await googleAdapter.listEvents({
        timeMin: timeMin || new Date().toISOString(),
        timeMax,
        maxResults: 10,
        accessToken
      });
    }

    const rawPayload = {
      gmail: gmailData,
      calendar: calendarData
    };

    const sanitized = sanitizeToolOutput({
      toolId: 'google_context',
      result: rawPayload,
      sourceLabel: `Google Workspace (${connection.displayName || 'Primary Account'})`
    });

    return res.status(200).json({
      status: 'success',
      data: {
        context: sanitized
      }
    });
  } catch (error) {
    logger.error({ err: error?.message, requestId: req.id }, 'Unable to fetch Google context');
    return res.status(error.statusCode || 502).json({
      status: 'error',
      statusCode: error.statusCode || 502,
      errorCode: error.errorCode || 'GOOGLE_CONTEXT_FAILED',
      message: error.message || 'Failed to fetch Google Workspace context.'
    });
  }
});


