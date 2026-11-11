import test from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../repositories/prisma.js';

test('Database Persistence: F.R.I.D.A.Y. and E.D.I.T.H. data models', async () => {
  const testEmail = `test_${Date.now()}@friday-edith.internal`;

  // 1. Create User
  const user = await prisma.user.create({
    data: {
      email: testEmail,
      name: 'Test Engineer',
      passwordHash: 'dummy_hash_for_testing',
      role: 'DEVELOPER'
    }
  });
  assert.ok(user.id);
  assert.equal(user.email, testEmail);

  // 2. Create F.R.I.D.A.Y. Conversation & Message
  const conversation = await prisma.conversation.create({
    data: {
      userId: user.id,
      title: 'Database Persistence Test',
      messages: {
        create: [
          {
            role: 'user',
            content: 'How is the SQLite to MySQL migration plan structured?'
          },
          {
            role: 'assistant',
            content: 'The schema is designed canonically for MySQL 8.4 while running seamlessly on SQLite in local dev.'
          }
        ]
      }
    },
    include: { messages: true }
  });

  assert.equal(conversation.messages.length, 2);
  assert.equal(conversation.messages[0].role, 'user');
  assert.equal(conversation.messages[1].role, 'assistant');

  // 3. Create E.D.I.T.H. Workspace, Agent Task & Checkpoint
  const workspace = await prisma.workspaceProject.create({
    data: {
      userId: user.id,
      name: 'Test Project Workspace',
      localPath: 'M:\\Test-Workspace'
    }
  });

  const task = await prisma.agentTask.create({
    data: {
      projectId: workspace.id,
      userId: user.id,
      prompt: 'Implement database persistence',
      status: 'RUNNING'
    }
  });

  const checkpoint = await prisma.checkpoint.create({
    data: {
      taskId: task.id,
      snapshotHash: 'a1b2c3d4e5f6',
      description: 'Initial database checkpoint'
    }
  });

  assert.ok(checkpoint.id);
  assert.equal(checkpoint.taskId, task.id);

  // 4. Clean up test user (verifies cascade delete)
  await prisma.user.delete({ where: { id: user.id } });

  const checkConv = await prisma.conversation.findUnique({ where: { id: conversation.id } });
  assert.equal(checkConv, null, 'Cascade delete should remove associated conversation');
});

