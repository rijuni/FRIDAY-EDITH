import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

async function main() {
  console.log('🌱 Seeding database...');

  // 1. Clean existing records for idempotent seed
  await prisma.commandApproval.deleteMany();
  await prisma.checkpoint.deleteMany();
  await prisma.agentTask.deleteMany();
  await prisma.workspaceProject.deleteMany();
  await prisma.documentChunk.deleteMany();
  await prisma.knowledgeBase.deleteMany();
  await prisma.memoryItem.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Admin and Developer users
  const adminPasswordHash = await argon2.hash('AdminPassword2026!', ARGON2_OPTIONS);
  const devPasswordHash = await argon2.hash('DeveloperPassword2026!', ARGON2_OPTIONS);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@friday-edith.internal',
      name: 'System Administrator',
      passwordHash: adminPasswordHash,
      role: 'ADMIN'
    }
  });

  const dev = await prisma.user.create({
    data: {
      email: 'dev@friday-edith.internal',
      name: 'Lead Engineer',
      passwordHash: devPasswordHash,
      role: 'DEVELOPER'
    }
  });

  console.log(`✅ Created users: ${admin.email} (ADMIN), ${dev.email} (DEVELOPER)`);

  // 3. Create initial F.R.I.D.A.Y. Conversation & Welcome Message
  const fridayConv = await prisma.conversation.create({
    data: {
      userId: dev.id,
      title: 'Welcome to F.R.I.D.A.Y.',
      modelPreference: 'claude-3-7-sonnet',
      systemPrompt: 'You are F.R.I.D.A.Y., a high-intelligence AI assistant running on Nebula UI.',
      messages: {
        create: [
          {
            role: 'assistant',
            content: 'Greetings. F.R.I.D.A.Y. systems are online. How may I assist your intelligence operations today?'
          }
        ]
      }
    }
  });

  console.log(`✅ Created F.R.I.D.A.Y. welcome conversation: ${fridayConv.id}`);

  // 4. Create initial E.D.I.T.H. Workspace Project & Task
  const edithWorkspace = await prisma.workspaceProject.create({
    data: {
      userId: dev.id,
      name: 'Friday-Edith Core Platform',
      repoUrl: 'https://github.com/rijuni/FRIDAY-EDITH.git',
      localPath: 'M:\\Friday-Edith',
      defaultBranch: 'main',
      settings: JSON.stringify({
        isolatedRunner: true,
        autoApproveReadOnly: true
      })
    }
  });

  const edithTask = await prisma.agentTask.create({
    data: {
      projectId: edithWorkspace.id,
      userId: dev.id,
      prompt: 'Bootstrap Phase 2 database persistence layer and run MySQL compatibility check.',
      status: 'SUCCEEDED',
      plan: JSON.stringify({
        steps: [
          { id: 1, title: 'Define schema.prisma', status: 'completed' },
          { id: 2, title: 'Sync SQLite dev database', status: 'completed' },
          { id: 3, title: 'Validate MySQL 8.4 compatibility', status: 'completed' }
        ]
      }),
      resultSummary: 'Database schema synchronized and seed executed successfully.'
    }
  });

  console.log(`✅ Created E.D.I.T.H. workspace (${edithWorkspace.id}) and initial task (${edithTask.id})`);
  console.log('🌱 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
