import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import argon2 from 'argon2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONOREPO_ROOT = path.resolve(__dirname, '../../../..');

const prisma = new PrismaClient();

const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
};

function resolveSeedPassword(envKey, label) {
  const configured = (process.env[envKey] || '').trim();
  if (configured) {
    if (configured.length < 12) {
      throw new Error(`${envKey} must be at least 12 characters.`);
    }
    return { password: configured, generated: false };
  }
  const generated = crypto.randomBytes(18).toString('base64url');
  console.log(`ℹ️ Generated one-time dev seed password for ${label}: ${generated}`);
  return { password: generated, generated: true };
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_PROD_SEED !== 'true') {
    throw new Error('Refusing to seed database in production without ALLOW_PROD_SEED=true.');
  }

  console.log('🌱 Running idempotent, non-destructive database seed...');

  const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@friday-edith.internal';
  const devEmail = process.env.SEED_DEV_EMAIL || 'dev@friday-edith.internal';

  // Ensure initial accounts exist cleanly via upsert without wiping user data
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    const adminCred = resolveSeedPassword('SEED_ADMIN_PASSWORD', adminEmail);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: 'System Administrator',
        passwordHash: await argon2.hash(adminCred.password, ARGON2_OPTIONS),
        role: 'ADMIN'
      }
    });
    console.log(`✅ Seeded ADMIN user: ${admin.email}`);
  } else {
    console.log(`↷ Preserved existing ADMIN user: ${admin.email}`);
  }

  let dev = await prisma.user.findUnique({ where: { email: devEmail } });
  if (!dev) {
    const devCred = resolveSeedPassword('SEED_DEV_PASSWORD', devEmail);
    dev = await prisma.user.create({
      data: {
        email: devEmail,
        name: 'Lead Engineer',
        passwordHash: await argon2.hash(devCred.password, ARGON2_OPTIONS),
        role: 'DEVELOPER'
      }
    });
    console.log(`✅ Seeded DEVELOPER user: ${dev.email}`);
  } else {
    console.log(`↷ Preserved existing DEVELOPER user: ${dev.email}`);
  }

  const existingConv = await prisma.conversation.findFirst({
    where: { userId: dev.id, title: 'Welcome to F.R.I.D.A.Y.' }
  });
  if (!existingConv) {
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
              content:
                'Greetings. F.R.I.D.A.Y. systems are online. How may I assist your intelligence operations today?'
            }
          ]
        }
      }
    });
    console.log(`✅ Created welcome F.R.I.D.A.Y. conversation: ${fridayConv.id}`);
  }

  const existingWorkspace = await prisma.workspaceProject.findFirst({
    where: { userId: dev.id, name: 'Friday-Edith Core Platform' }
  });
  if (!existingWorkspace) {
    const workspacePath = process.env.SEED_WORKSPACE_PATH || MONOREPO_ROOT;
    const edithWorkspace = await prisma.workspaceProject.create({
      data: {
        userId: dev.id,
        name: 'Friday-Edith Core Platform',
        repoUrl: 'https://github.com/rijuni/FRIDAY-EDITH.git',
        localPath: workspacePath,
        defaultBranch: 'main',
        settings: JSON.stringify({
          isolatedRunner: true,
          autoApproveReadOnly: true
        })
      }
    });
    console.log(`✅ Created initial E.D.I.T.H. workspace: ${edithWorkspace.id} (${workspacePath})`);
  }

  console.log('🌱 Seed completed cleanly.');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
