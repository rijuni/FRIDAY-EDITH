import { prisma } from '../repositories/prisma.js';
import { config } from '../config/index.js';
import { assertOwnership } from '../middleware/authorize.js';
import { logger } from '../utils/logger.js';

function getFridayAiUrl() {
  return process.env.FRIDAY_AI_SERVICE_URL || config.FRIDAY_AI_SERVICE_URL;
}

function buildConversationTitle(content) {
  const cleaned = String(content || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return 'New F.R.I.D.A.Y. Session';
  return cleaned.length > 52 ? `${cleaned.slice(0, 49)}...` : cleaned;
}

function extractSseChunkText(lines) {
  let text = '';
  for (const line of lines) {
    const trimmed = line.replace(/\r$/, '');
    if (!trimmed.startsWith('data: ')) continue;
    try {
      const parsed = JSON.parse(trimmed.slice(6));
      if (parsed.event === 'chunk' && typeof parsed.text === 'string') {
        text += parsed.text;
      }
    } catch {
      // Ignore partial or non-JSON data lines
    }
  }
  return text;
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

export async function getConversation(req, res, next) {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
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
  const timeoutHandle = setTimeout(() => abortController.abort('timeout'), config.AI_REQUEST_TIMEOUT_MS);
  let clientDisconnected = false;

  const handleClientClose = () => {
    if (!res.writableEnded) {
      clientDisconnected = true;
      abortController.abort('client_disconnect');
    }
  };
  res.on('close', handleClientClose);

  try {
    const { content, model } = req.body;
    const conversationId = req.params.id;

    // 1. Verify conversation existence & strict ownership
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: 20
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

    // 2. Persist user message and assign initial title if default
    const shouldRetitle =
      conversation.messages.length === 0 &&
      (conversation.title === 'New F.R.I.D.A.Y. Session' || conversation.title === 'New Conversation');

    await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId,
          role: 'user',
          content
        }
      }),
      prisma.conversation.update({
        where: { id: conversationId },
        data: {
          ...(shouldRetitle ? { title: buildConversationTitle(content) } : {}),
          updatedAt: new Date()
        }
      })
    ]);

    // 3. Assemble payload for authenticated Python Friday AI service
    const formattedMessages = conversation.messages.map((m) => ({
      role: m.role,
      content: m.content
    }));
    formattedMessages.push({ role: 'user', content });

    const aiPayload = {
      model: model || conversation.modelPreference || 'claude-3-7-sonnet',
      messages: formattedMessages,
      system_prompt: conversation.systemPrompt || 'You are F.R.I.D.A.Y.'
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
      return res.status(502).json({
        status: 'error',
        statusCode: 502,
        errorCode,
        message: 'Failed to connect to F.R.I.D.A.Y. AI Intelligence Service'
      });
    }

    // 5. Pipe SSE stream to client with buffered partial-line assembly
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    let fullAssistantResponse = '';
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
      fullAssistantResponse += extractSseChunkText(lines);
    }

    if (sseLineBuffer) {
      fullAssistantResponse += extractSseChunkText([sseLineBuffer]);
    }

    // 6. Persist completed assistant message transactionally BEFORE closing SSE stream
    // so immediate follow-up fetches from the client see the committed assistant message.
    if (fullAssistantResponse.trim()) {
      await prisma.$transaction([
        prisma.message.create({
          data: {
            conversationId,
            role: 'assistant',
            content: fullAssistantResponse.trim()
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

