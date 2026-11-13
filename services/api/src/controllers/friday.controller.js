import { prisma } from '../repositories/prisma.js';
import { config } from '../config/index.js';
import { assertOwnership } from '../middleware/authorize.js';
import { auditService } from '../modules/audit/audit.service.js';
import { logger } from '../utils/logger.js';

function getFridayAiUrl() {
  return process.env.FRIDAY_AI_SERVICE_URL || config.FRIDAY_AI_SERVICE_URL;
}

function getEdithEngineUrl() {
  return process.env.EDITH_ENGINE_URL || config.EDITH_ENGINE_SERVICE_URL;
}

function getRunnerHostUrl() {
  return process.env.RUNNER_HOST_URL || config.EDITH_RUNNER_SERVICE_URL;
}

async function probeServiceHealth(url) {
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(2500)
    });
    return {
      status: response.ok ? 'online' : 'degraded',
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt
    };
  } catch {
    return {
      status: 'offline',
      httpStatus: null,
      latencyMs: Date.now() - startedAt
    };
  }
}

function buildConversationTitle(content) {
  const cleaned = String(content || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New F.R.I.D.A.Y. Session';
  return cleaned.length > 52 ? `${cleaned.slice(0, 49)}...` : cleaned;
}

function extractSseData(lines) {
  const result = { text: '', citations: null, metadata: {} };
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(trimmed.slice(6));
      if (parsed.event === 'chunk' && typeof parsed.text === 'string') {
        result.text += parsed.text;
      } else if (parsed.event === 'citations' && Array.isArray(parsed.metadata?.citations)) {
        result.citations = parsed.metadata.citations;
      }
      for (const key of ['is_mock', 'provider', 'total_tokens', 'prompt_tokens', 'completion_tokens']) {
        if (parsed.metadata?.[key] !== undefined) result.metadata[key] = parsed.metadata[key];
      }
    } catch {
      // Ignore partial or non-JSON data lines
    }
  }
  return result;
}

async function parseUploadedText({ req, filename, mimeType, content, encoding = 'utf8' }) {
  let fileBytes;
  if (encoding === 'base64') {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
      const error = new Error('File content is not valid base64.');
      error.statusCode = 400;
      throw error;
    }
    fileBytes = Buffer.from(content, 'base64');
    if (fileBytes.toString('base64') !== content) {
      const error = new Error('File content is not canonical base64.');
      error.statusCode = 400;
      throw error;
    }
  } else if (encoding === 'utf8') {
    fileBytes = Buffer.from(content, 'utf8');
  } else {
    const error = new Error('File content encoding is unsupported.');
    error.statusCode = 400;
    throw error;
  }
  if (fileBytes.length > 512 * 1024) {
    const error = new Error('File exceeds the 512 KB limit.');
    error.statusCode = 413;
    throw error;
  }
  const formData = new FormData();
  formData.append('file', new Blob([fileBytes], { type: mimeType }), filename);
  const response = await fetch(`${getFridayAiUrl()}/v1/documents/parse`, {
    method: 'POST',
    signal: AbortSignal.timeout(config.AI_REQUEST_TIMEOUT_MS),
    headers: {
      'X-Internal-Service-Token': config.INTERNAL_SERVICE_SECRET,
      'X-User-Id': req.user.id,
      'X-Request-Id': req.id || ''
    },
    body: formData
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || 'Document validation failed');
    error.statusCode = response.status >= 500 ? 502 : response.status;
    error.errorCode = data?.errorCode || 'DOCUMENT_PARSE_FAILED';
    throw error;
  }
  return data?.data || {};
}

async function fetchFridayModels(req) {
  const response = await fetch(`${getFridayAiUrl()}/v1/chat/models`, {
    headers: {
      'X-Internal-Service-Token': config.INTERNAL_SERVICE_SECRET,
      'X-User-Id': req.user.id,
      'X-Request-Id': req.id || ''
    },
    signal: AbortSignal.timeout(config.AI_REQUEST_TIMEOUT_MS)
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || 'Unable to load configured F.R.I.D.A.Y. models');
  return payload?.data || { models: [] };
}

export async function createConversation(req, res, next) {
  try {
    const { title, modelPreference, systemPrompt } = req.body;
    const conversation = await prisma.conversation.create({
      data: {
        userId: req.user.id,
        title: title || 'New F.R.I.D.A.Y. Session',
        modelPreference: modelPreference || 'claude-3-7-sonnet',
        systemPrompt: systemPrompt || 'You are F.R.I.D.A.Y., a high-intelligence AI assistant.'
      }
    });

    res.status(201).json({
      status: 'success',
      data: { conversation }
    });
  } catch (error) {
    next(error);
  }
}

export async function listConversations(req, res, next) {
  try {
    const limit = Number(req.query?.limit ?? 25);
    const offset = Number(req.query?.offset ?? 0);
    const where = { userId: req.user.id, isArchived: false };

    const [conversations, total] = await prisma.$transaction([
      prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: offset,
        take: limit
      }),
      prisma.conversation.count({ where })
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        conversations,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + conversations.length < total
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function getRuntimeStatus(req, res, next) {
  try {
    let dbStatus = 'online';
    const dbStart = Date.now();
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'offline';
    }
    const dbLatencyMs = Date.now() - dbStart;

    const [fridayAi, edithEngine, runnerHost] = await Promise.all([
      probeServiceHealth(`${getFridayAiUrl()}/v1/health/ready`),
      probeServiceHealth(`${getEdithEngineUrl()}/v1/health`),
      probeServiceHealth(`${getRunnerHostUrl()}/v1/health`)
    ]);

    res.status(200).json({
      status: 'success',
      data: {
        version: '2.1.0',
        timestamp: new Date().toISOString(),
        subsystems: {
          api: { status: 'online', latencyMs: 0 },
          database: { status: dbStatus, latencyMs: dbLatencyMs },
          fridayAi,
          edithEngine,
          runnerHost
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listModels(req, res, next) {
  try {
    res.status(200).json({ status: 'success', data: await fetchFridayModels(req) });
  } catch (error) {
    logger.warn({ err: error?.message, requestId: req.id }, 'F.R.I.D.A.Y. model list is unavailable');
    res.status(503).json({ status: 'error', statusCode: 503, errorCode: 'AI_SERVICE_UNAVAILABLE', message: 'F.R.I.D.A.Y. provider configuration is unavailable.' });
  }
}

export async function submitSupportReport(req, res, next) {
  try {
    const { category, subject, description, includeDiagnostics } = req.body;
    const referenceId = `SUP-${Date.now().toString(36).toUpperCase()}`;

    const entry = await auditService.logEvent({
      action: 'SUPPORT_REPORT_SUBMITTED',
      userId: req.user.id,
      resourceType: 'SUPPORT_TICKET',
      resourceId: referenceId,
      details: {
        referenceId,
        category,
        subject,
        description,
        includeDiagnostics: Boolean(includeDiagnostics),
        platformVersion: '2.1.0'
      },
      ip: req.ip
    });

    res.status(201).json({
      status: 'success',
      data: {
        report: {
          id: referenceId,
          category,
          subject,
          status: 'SUBMITTED',
          createdAt: entry?.createdAt || new Date().toISOString()
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadAttachment(req, res, next) {
  try {
    const conversationId = req.params.id;
    const { filename, mimeType, content, encoding = 'utf8' } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, userId: true }
    });

    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        statusCode: 404,
        message: 'Conversation not found'
      });
    }

    assertOwnership(conversation.userId, req.user);

    let parsedData;
    try {
      parsedData = await parseUploadedText({ req, filename, mimeType, content, encoding });
    } catch (error) {
      if (error.statusCode) throw error;
      return res.status(502).json({
        status: 'error',
        statusCode: 502,
        errorCode: 'AI_UPSTREAM_ERROR',
        message: 'Failed to connect to F.R.I.D.A.Y. AI document parser service'
      });
    }

    const parsedContent = Array.isArray(parsedData.chunks)
      ? parsedData.chunks.map((c) => c.text || '').join('')
      : content;

    const attachment = await prisma.attachment.create({
      data: {
        conversationId,
        filename: parsedData.filename || filename,
        mimeType: parsedData.mime_type || mimeType,
        sizeBytes: parsedData.total_bytes || (encoding === 'base64' ? Buffer.from(content, 'base64').length : Buffer.byteLength(content, 'utf8')),
        storagePath: 'parsed-text',
        parsedContent
      },
      select: {
        id: true,
        conversationId: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        createdAt: true
      }
    });

    await auditService.logEvent({
      action: 'ATTACHMENT_UPLOADED',
      userId: req.user.id,
      resourceType: 'ATTACHMENT',
      resourceId: attachment.id,
      details: { conversationId, filename: attachment.filename, mimeType: attachment.mimeType, sizeBytes: attachment.sizeBytes, malwareScan: parsedData.malware_scan },
      ip: req.ip
    });

    return res.status(201).json({
      status: 'success',
      data: {
        attachment: {
          ...attachment,
          chunkCount: parsedData.chunk_count ?? 1,
          totalChars: parsedData.total_chars ?? parsedContent.length,
          malwareScan: parsedData.malware_scan
        }
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function listKnowledgeBases(req, res, next) {
  try {
    const knowledgeBases = await prisma.knowledgeBase.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { chunks: true } } }
    });
    res.status(200).json({ status: 'success', data: { knowledgeBases } });
  } catch (error) { next(error); }
}

export async function createKnowledgeBase(req, res, next) {
  try {
    const knowledgeBase = await prisma.knowledgeBase.create({
      data: { userId: req.user.id, name: req.body.name, description: req.body.description || null }
    });
    res.status(201).json({ status: 'success', data: { knowledgeBase } });
  } catch (error) { next(error); }
}

export async function deleteKnowledgeBase(req, res, next) {
  try {
    const result = await prisma.knowledgeBase.deleteMany({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!result.count) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Knowledge base not found' });
    res.status(200).json({ status: 'success', message: 'Knowledge base and its indexed chunks were deleted' });
  } catch (error) { next(error); }
}

export async function listKnowledgeDocuments(req, res, next) {
  try {
    const knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      select: { id: true }
    });
    if (!knowledgeBase) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Knowledge base not found' });
    const chunks = await prisma.documentChunk.findMany({
      where: { knowledgeBaseId: knowledgeBase.id },
      select: { title: true, chunkIndex: true, tokenCount: true, createdAt: true },
      orderBy: [{ title: 'asc' }, { chunkIndex: 'asc' }],
      take: 5000
    });
    const byTitle = new Map();
    for (const chunk of chunks) {
      const doc = byTitle.get(chunk.title) || { filename: chunk.title, chunkCount: 0, createdAt: chunk.createdAt };
      doc.chunkCount += 1;
      if (chunk.createdAt > doc.createdAt) doc.createdAt = chunk.createdAt;
      byTitle.set(chunk.title, doc);
    }
    res.status(200).json({ status: 'success', data: { documents: [...byTitle.values()] } });
  } catch (error) { next(error); }
}

export async function ingestKnowledgeDocument(req, res, next) {
  try {
    const knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.id, userId: req.user.id }, select: { id: true }
    });
    if (!knowledgeBase) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Knowledge base not found' });
    const parsed = await parseUploadedText({ req, ...req.body });
    const chunks = (parsed.chunks || []).filter((item) => typeof item.text === 'string' && item.text.trim());
    await prisma.$transaction(async (tx) => {
      await tx.documentChunk.deleteMany({ where: { knowledgeBaseId: knowledgeBase.id, title: parsed.filename } });
      if (chunks.length) {
        await tx.documentChunk.createMany({
          data: chunks.map((chunk) => ({
            knowledgeBaseId: knowledgeBase.id,
            title: parsed.filename,
            content: chunk.text,
            tokenCount: Math.max(1, Math.ceil(chunk.text.length / 4)),
            chunkIndex: chunk.chunk_index,
            metadata: JSON.stringify({ mimeType: parsed.mime_type, totalChars: parsed.total_chars })
          }))
        });
      }
    });
    const fileSizeBytes = parsed.total_bytes || (req.body.encoding === 'base64'
      ? Buffer.from(req.body.content, 'base64').length
      : Buffer.byteLength(req.body.content, 'utf8'));
    await auditService.logEvent({
      action: 'KNOWLEDGE_DOCUMENT_INGESTED', userId: req.user.id,
      resourceType: 'KNOWLEDGE_BASE', resourceId: knowledgeBase.id,
      details: { filename: parsed.filename, chunkCount: chunks.length, sizeBytes: fileSizeBytes, malwareScan: parsed.malware_scan },
      ip: req.ip
    });
    res.status(201).json({
      status: 'success',
      data: { document: { filename: parsed.filename, mimeType: parsed.mime_type, sizeBytes: fileSizeBytes, chunkCount: chunks.length, malwareScan: parsed.malware_scan } }
    });
  } catch (error) { next(error); }
}

export async function deleteKnowledgeDocument(req, res, next) {
  try {
    const knowledgeBase = await prisma.knowledgeBase.findFirst({
      where: { id: req.params.id, userId: req.user.id }, select: { id: true }
    });
    if (!knowledgeBase) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Knowledge base not found' });
    const result = await prisma.documentChunk.deleteMany({
      where: { knowledgeBaseId: knowledgeBase.id, title: req.params.filename }
    });
    if (!result.count) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Document not found' });
    res.status(200).json({ status: 'success', message: 'Document and indexed chunks deleted' });
  } catch (error) { next(error); }
}

export async function listMemories(req, res, next) {
  try {
    const memories = await prisma.memoryItem.findMany({
      where: { userId: req.user.id }, orderBy: { updatedAt: 'desc' }, take: 100
    });
    res.status(200).json({ status: 'success', data: { memories } });
  } catch (error) { next(error); }
}

export async function createMemory(req, res, next) {
  try {
    const memory = await prisma.memoryItem.create({
      data: { userId: req.user.id, category: req.body.category, content: req.body.content }
    });
    res.status(201).json({ status: 'success', data: { memory } });
  } catch (error) { next(error); }
}

export async function updateMemory(req, res, next) {
  try {
    const result = await prisma.memoryItem.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { ...(req.body.category ? { category: req.body.category } : {}), ...(req.body.content ? { content: req.body.content } : {}) }
    });
    if (!result.count) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Memory not found' });
    const memory = await prisma.memoryItem.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    res.status(200).json({ status: 'success', data: { memory } });
  } catch (error) { next(error); }
}

export async function deleteMemory(req, res, next) {
  try {
    const result = await prisma.memoryItem.deleteMany({ where: { id: req.params.id, userId: req.user.id } });
    if (!result.count) return res.status(404).json({ status: 'fail', statusCode: 404, message: 'Memory not found' });
    res.status(200).json({ status: 'success', message: 'Memory deleted' });
  } catch (error) { next(error); }
}

export async function getConversation(req, res, next) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          include: {
            attachments: {
              select: {
                id: true,
                filename: true,
                mimeType: true,
                sizeBytes: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        statusCode: 404,
        message: 'Conversation not found'
      });
    }

    assertOwnership(conversation.userId, req.user);

    res.status(200).json({
      status: 'success',
      data: { conversation }
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteConversation(req, res, next) {
  try {
    const existing = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true }
    });

    if (!existing) {
      return res.status(404).json({
        status: 'fail',
        statusCode: 404,
        message: 'Conversation not found'
      });
    }

    assertOwnership(existing.userId, req.user);

    await prisma.conversation.delete({ where: { id: existing.id } });
    res.status(200).json({
      status: 'success',
      message: 'Conversation deleted'
    });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req, res, next) {
  const abortController = new AbortController();
  const timeoutHandle = setTimeout(() => abortController.abort('timeout'), config.AI_STREAM_TIMEOUT_MS);
  let clientDisconnected = false;

  const handleClientClose = () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort('client_disconnect');
    }
  };
  res.on('close', handleClientClose);

  try {
    const { content, model, temperature, systemPrompt, attachmentIds = [] } = req.body;
    const conversationId = req.params.id;
    const uniqueAttachmentIds = [...new Set(attachmentIds)];

    // 1. Verify conversation existence & strict ownership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: 20,
          include: {
            attachments: {
              select: { id: true, filename: true, mimeType: true, parsedContent: true }
            }
          }
        }
      }
    });

    if (!conversation) {
      return res.status(404).json({
        status: 'fail',
        statusCode: 404,
        message: 'Conversation not found'
      });
    }

    assertOwnership(conversation.userId, req.user);
    const previousMessages = [...conversation.messages].reverse();
    const lastPreviousMessage = previousMessages.at(-1);
    const isPersistedRetry = lastPreviousMessage?.role === 'user' && lastPreviousMessage.content === content;

    let linkedAttachments = [];
    if (uniqueAttachmentIds.length > 0) {
      linkedAttachments = await prisma.attachment.findMany({
        where: {
          id: { in: uniqueAttachmentIds },
          conversationId
        },
        select: {
          id: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          parsedContent: true
        }
      });

      if (linkedAttachments.length !== uniqueAttachmentIds.length) {
        return res.status(400).json({
          status: 'fail',
          statusCode: 400,
          message: 'One or more attachments are invalid or do not belong to this conversation'
        });
      }
    } else if (isPersistedRetry && lastPreviousMessage.attachments.length > 0) {
      linkedAttachments = lastPreviousMessage.attachments;
    }

    // Retrieval data is loaded only through the authenticated owner's relations.
    const searchTerms = [...new Set((content.toLocaleLowerCase().match(/[\p{L}\p{N}_'-]{2,}/gu) || []))].slice(0, 8);
    const [knowledgeChunks, memories] = await prisma.$transaction([
      searchTerms.length ? prisma.documentChunk.findMany({
        where: {
          knowledgeBase: { userId: req.user.id },
          OR: searchTerms.map((term) => ({ content: { contains: term } }))
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true, title: true, content: true, chunkIndex: true, knowledgeBaseId: true,
          knowledgeBase: { select: { name: true } }
        }
      }) : Promise.resolve([]),
      prisma.memoryItem.findMany({
        where: { userId: req.user.id },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        select: { id: true, category: true, content: true }
      })
    ]);

    // 2. Persist user message, link attachments, and assign initial title if default
    const shouldRetitle =
      previousMessages.length === 0 &&
      (conversation.title === 'New F.R.I.D.A.Y. Session' || conversation.title === 'New Conversation');

    if (!isPersistedRetry) {
      await prisma.$transaction(async (tx) => {
        const userMessage = await tx.message.create({
          data: { conversationId, role: 'user', content }
        });

        if (linkedAttachments.length > 0) {
          await tx.attachment.updateMany({
            where: { id: { in: linkedAttachments.map((a) => a.id) }, conversationId },
            data: { messageId: userMessage.id }
          });
        }

        await tx.conversation.update({
          where: { id: conversationId },
          data: {
            ...(shouldRetitle ? { title: buildConversationTitle(content) } : {}),
            updatedAt: new Date()
          }
        });
      });
    }

    // 3. Assemble payload for authenticated Python Friday AI service (preserving within MAX_PROMPT_CHARS)
    const formatWithAttachments = (baseText, atts) => {
      if (!Array.isArray(atts) || atts.length === 0) return baseText;
      const blocks = atts.map((a) => {
        const excerpt = String(a.parsedContent || '').slice(0, 10000);
        return `[Attached File: ${a.filename} (${a.mimeType})]\n${excerpt}`;
      });
      const combined = `${baseText}\n\n${blocks.join('\n\n')}`;
      return combined.length > 32000 ? `${combined.slice(0, 31980)}\n[truncated]` : combined;
    };

    const formattedMessages = previousMessages.map((m) => ({
      role: m.role,
      content: formatWithAttachments(m.content, m.attachments)
    }));
    if (!isPersistedRetry) {
      formattedMessages.push({
        role: 'user',
        content: formatWithAttachments(content, linkedAttachments)
      });
    }

    const aiPayload = {
      model: model || conversation.modelPreference || 'claude-3-7-sonnet',
      messages: formattedMessages,
      system_prompt: systemPrompt || conversation.systemPrompt || 'You are F.R.I.D.A.Y.',
      knowledge_chunks: knowledgeChunks.map((chunk) => ({
        id: chunk.id,
        source: `${chunk.knowledgeBase.name}/${chunk.title || 'document'}`,
        title: chunk.title,
        text: chunk.content,
        chunk_index: chunk.chunkIndex,
        knowledge_base_id: chunk.knowledgeBaseId
      })),
      memories,
      ...(typeof temperature === 'number' ? { temperature } : {})
    };

    // 4. Call internal Friday AI SSE endpoint with service credentials & correlation ID
    const aiResponse = await fetch(`${getFridayAiUrl()}/v1/chat/stream`, {
      method: 'POST',
      signal: abortController.signal,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Service-Token': config.INTERNAL_SERVICE_SECRET,
        'X-User-Id': req.user.id,
        'X-Request-Id': req.id || ''
      },
      body: JSON.stringify(aiPayload)
    });

    if (!aiResponse.ok || !aiResponse.body) {
      let errorCode = 'AI_UPSTREAM_ERROR';
      try {
        const errJson = await aiResponse.json();
        if (errJson?.errorCode) errorCode = errJson.errorCode;
      } catch {
        // Ignore non-JSON error body
      }
      const statusCode = aiResponse.status === 400 ? 400 : aiResponse.status === 503 ? 503 : aiResponse.status === 504 ? 504 : 502;
      const providerMessages = {
        PROVIDER_NOT_CONFIGURED: 'The selected AI provider is not configured with a server-side API key.',
        MODEL_NOT_AVAILABLE: 'The selected model is not available in the configured provider.'
      };
      return res.status(statusCode).json({
        status: 'error',
        statusCode,
        errorCode,
        message: providerMessages[errorCode] || 'Failed to connect to F.R.I.D.A.Y. AI Intelligence Service'
      });
    }

    // 5. Pipe SSE stream to client with buffered partial-line assembly
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullAssistantResponse = '';
    let assistantMetadata = {};
    let sseLineBuffer = '';
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      if (!clientDisconnected && !res.writableEnded) {
        res.write(chunkText);
      }

      sseLineBuffer += chunkText;
      const lines = sseLineBuffer.split('\n');
      sseLineBuffer = lines.pop() ?? '';
      const parsed = extractSseData(lines);
      fullAssistantResponse += parsed.text;
      if (parsed.citations) assistantMetadata.citations = parsed.citations;
      Object.assign(assistantMetadata, parsed.metadata);
    }

    if (sseLineBuffer) {
      const parsed = extractSseData([sseLineBuffer]);
      fullAssistantResponse += parsed.text;
      if (parsed.citations) assistantMetadata.citations = parsed.citations;
      Object.assign(assistantMetadata, parsed.metadata);
    }

    // 6. Persist completed assistant message transactionally BEFORE closing SSE stream
    // so immediate follow-up fetches from the client see the committed assistant message.
    if (fullAssistantResponse.trim()) {
      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId,
            role: 'assistant',
            content: fullAssistantResponse.trim(),
            metadata: Object.keys(assistantMetadata).length ? JSON.stringify(assistantMetadata) : null
          }
        }),
        prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() }
        })
      ]);
    }

    if (!res.writableEnded) {
      res.end();
    }
  } catch (error) {
    if (clientDisconnected || abortController.signal.reason === 'client_disconnect') {
      if (!res.writableEnded) res.end();
      return;
    }

    if (res.headersSent) {
      logger.error({ err: error, requestId: req.id }, 'SSE stream/persistence error after headers sent');
      if (!res.writableEnded) {
        const payload = JSON.stringify({
          event: 'error',
          errorCode: error?.name === 'AbortError' ? 'AI_TIMEOUT' : 'AI_STREAM_INTERRUPTED',
          message: 'Response stream interrupted before completion.'
        });
        res.write(`event: error\ndata: ${payload}\n\n`);
        res.end();
      }
      return;
    }

    if (error?.name === 'AbortError') {
      return res.status(504).json({
        status: 'error',
        statusCode: 504,
        errorCode: 'AI_TIMEOUT',
        message: 'F.R.I.D.A.Y. AI Intelligence Service timed out'
      });
    }

    next(error);
  } finally {
    clearTimeout(timeoutHandle);
    res.off('close', handleClientClose);
  }
}

