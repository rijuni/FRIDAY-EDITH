import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../repositories/prisma.js';

test('Database Persistence: F.R.I.D.A.Y. and E.D.I.T.H. full 14-model suite and cascade rules', async () => {
  const nonce = Date.now();
  const testEmail = `db_test_${nonce}@friday-edith.internal`;

  // 1. Create User (Shared Platform)
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: 'Database Test Engineer',
      passwordHash: 'dummy_argon2_hash',
      role: 'DEVELOPER'
    }
  });
  assert.ok(user.id);
  assert.equal(user.email, testEmail);

  // 2. Create Session & ProviderKey & AuditLog
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: `hash_${nonce}`,
      expiresAt: new Date(Date.now() + 3600000)
    }
  });
  assert.ok(session.id);

  const providerKey = await prisma.providerKey.create({
    data: {
      userId: user.id,
      provider: 'openai',
      encryptedKey: 'encrypted_openai_api_key_test'
    }
  });
  assert.ok(providerKey.id);

  const auditLog = await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: 'TEST_PERSISTENCE',
      resourceType: 'DATABASE',
      resourceId: user.id,
      details: JSON.stringify({ testRun: nonce, models: 14 })
    }
  });
  assert.ok(auditLog.id);

  // 3. Create F.R.I.D.A.Y. Conversation, Message, and Attachment
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: 'Database Persistence Test',
      messages: {
        create: [
          {
            role: 'user',
            content: 'How is MySQL 8.4 canonical storage verified?'
          },
          {
            role: 'assistant',
            content: 'Every model uses native MySQL 8.4 types, UTF-8 collation, and verified foreign keys.'
          }
        ]
      }
    },
    include: { messages: true }
  });
  assert.equal(conversation.messages.length, 2);

  const attachment = await prisma.attachment.create({
    data: {
      conversationId: conversation.id,
      messageId: conversation.messages[0].id,
      filename: 'architecture.md',
      mimeType: 'text/markdown',
      sizeBytes: 1024,
      storagePath: '/uploads/architecture.md',
      parsedContent: '# F.R.I.D.A.Y. + E.D.I.T.H. System Architecture\n'.repeat(50)
    }
  });
  assert.ok(attachment.id);

  // 4. Create F.R.I.D.A.Y. MemoryItem, KnowledgeBase, and DocumentChunk
  const memory = await prisma.memoryItem.create({
    data: {
      userId: user.id,
      category: 'developer_preferences',
      content: 'Prefers dark nebula tactical theme with high contrast.',
      confidence: 0.95
    }
  });
  assert.ok(memory.id);

  const knowledgeBase = await prisma.knowledgeBase.create({
    data: {
      userId: user.id,
      name: 'Platform Engineering Docs',
      description: 'Internal reference documents for E.D.I.T.H. and F.R.I.D.A.Y.'
    }
  });
  assert.ok(knowledgeBase.id);

  const chunk = await prisma.documentChunk.create({
    data: {
      knowledgeBaseId: knowledgeBase.id,
      title: 'Section 1: Architecture',
      content: 'MySQL 8.4 database persistence layer with connection pooling.'.repeat(30),
      tokenCount: 450,
      chunkIndex: 0
    }
  });
  assert.ok(chunk.id);

  // 5. Create E.D.I.T.H. Workspace, Agent Task, Checkpoint, and CommandApproval
  const workspace = await prisma.workspaceProject.create({
    data: {
      userId: user.id,
      name: 'Test Project Workspace',
      localPath: 'M:\\Test-Workspace'
    }
  });
  assert.ok(workspace.id);

  const task = await prisma.agentTask.create({
    data: {
      projectId: workspace.id,
      userId: user.id,
      prompt: 'Implement database persistence',
      status: 'RUNNING'
    }
  });
  assert.ok(task.id);

  const checkpoint = await prisma.checkpoint.create({
    data: {
      taskId: task.id,
      snapshotHash: 'a1b2c3d4e5f6',
      description: 'Initial database checkpoint',
      filesChanged: JSON.stringify(['schema.prisma', 'database.test.js'])
    }
  });
  assert.ok(checkpoint.id);

  const approval = await prisma.commandApproval.create({
    data: {
      taskId: task.id,
      command: 'npm run test:api',
      riskTier: 'LOW',
      status: 'APPROVED',
      approvedByUserId: user.id
    }
  });
  assert.ok(approval.id);

  // 6. Verify Cascade Deletes
  // Deleting user must cascade-delete Sessions, Conversations, Attachments, Memories, Workspaces, Tasks, Checkpoints
  await prisma.user.delete({ where: { id: user.id } });

  const [checkConv, checkSession, checkWorkspace, checkTask, checkAudit] = await Promise.all([
    prisma.conversation.findUnique({ where: { id: conversation.id } }),
    prisma.session.findUnique({ where: { id: session.id } }),
    prisma.workspaceProject.findUnique({ where: { id: workspace.id } }),
    prisma.agentTask.findUnique({ where: { id: task.id } }),
    prisma.auditLog.findUnique({ where: { id: auditLog.id } })
  ]);

  assert.equal(checkConv, null, 'Cascade delete should remove associated conversation');
  assert.equal(checkSession, null, 'Cascade delete should remove associated session');
  assert.equal(checkWorkspace, null, 'Cascade delete should remove associated workspace project');
  assert.equal(checkTask, null, 'Cascade delete should remove associated agent task');
  assert.ok(checkAudit, 'Audit log must be preserved');
  assert.equal(checkAudit.userId, null, 'Audit log userId should be set to null on user deletion (SetNull)');

  // Clean up audit record
  await prisma.auditLog.delete({ where: { id: auditLog.id } });
});

test('Database Transactions: Atomic rollback on failure in MySQL 8.4', async () => {
  const nonce = Date.now();
  const testEmail = `rollback_test_${nonce}@friday-edith.internal`;

  let rollbackErrorTriggered = false;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          email: testEmail,
          name: 'Rollback Candidate',
          passwordHash: 'dummy_hash',
          role: 'USER'
        }
      });

      // Deliberately throw error to verify rollback
      throw new Error('INTENTIONAL_TRANSACTION_FAILURE');
    });
  } catch (err) {
    if (err.message === 'INTENTIONAL_TRANSACTION_FAILURE') {
      rollbackErrorTriggered = true;
    }
  }

  assert.equal(rollbackErrorTriggered, true);
  const foundUser = await prisma.user.findUnique({ where: { email: testEmail } });
  assert.equal(foundUser, null, 'Transaction failure must roll back user creation atomically');
});

test('Database Connection Pooling: Concurrent queries execute without exhaustion', async () => {
  const queryCount = 20;
  const queries = Array.from({ length: queryCount }, (_, i) =>
    prisma.$queryRaw`SELECT ${i} AS test_index, NOW() AS now_time`
  );

  const results = await Promise.all(queries);
  assert.equal(results.length, queryCount);
  assert.ok(results[0][0].now_time);
});

