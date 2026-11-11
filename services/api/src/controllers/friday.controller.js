import { prisma } from '../repositories/prisma.js';
import { config } from '../config/index.js';

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
    const conversations = await prisma.conversation.findMany({
      where: { userId: req.user.id, isArchived: false },
      orderBy: { updatedAt: 'desc' },
      take: 50
    });

    res.status(200).json({
      status: 'success',
      data: { conversations }
    });
  } catch (error) {
    next(error);
  }
}

export async function getConversation(req, res, next) {
  try {
    const conversation = await prisma.conversation.findFirst({
      where: { id: req.params.id, userId: req.user.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
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

    res.status(200).json({
      status: 'success',
      data: { conversation }
    });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req, res, next) {
  try {
    const { content, model } = req.body;
    const conversationId = req.params.id;

    // 1. Verify conversation ownership
    const conversation = await prisma.conversation.findFirst({
      where: { id: conversationId, userId: req.user.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' },
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

    // 2. Persist user message
    await prisma.message.create({
      data: {
        conversationId,
        role: 'user',
        content
      }
    });

    // 3. Assemble message payload for Python Friday AI service
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

    // 4. Connect to Python Friday AI service
    const aiResponse = await fetch(`${config.FRIDAY_AI_SERVICE_URL}/v1/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(aiPayload)
    });

    if (!aiResponse.ok) {
      return res.status(502).json({
        status: 'error',
        statusCode: 502,
        message: 'Failed to connect to F.R.I.D.A.Y. AI Intelligence Service'
      });
    }

    // 5. Pipe SSE stream to client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullAssistantResponse = '';
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunkText = decoder.decode(value, { stream: true });
      res.write(chunkText);

      // Extract streamed text chunks for persistence
      const lines = chunkText.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const parsed = JSON.parse(line.substring(6));
            if (parsed.event === 'chunk' && parsed.text) {
              fullAssistantResponse += parsed.text;
            }
          } catch {
            // ignore non-json frames
          }
        }
      }
    }

    res.end();

    // 6. Asynchronously persist completed assistant message and touch conversation
    if (fullAssistantResponse.trim()) {
      await prisma.message.create({
        data: {
          conversationId,
          role: 'assistant',
          content: fullAssistantResponse.trim()
        }
      });

      await prisma.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() }
      });
    }
  } catch (error) {
    next(error);
  }
}

