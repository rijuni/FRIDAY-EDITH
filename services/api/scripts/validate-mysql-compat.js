import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PRISMA_DIR = path.resolve(__dirname, '../prisma');

const LARGE_TEXT_FIELDS = new Set([
  'AuditLog.details',
  'ProviderKey.encryptedKey',
  'Conversation.systemPrompt',
  'Message.content',
  'Message.reasoningContent',
  'Message.metadata',
  'Attachment.storagePath',
  'Attachment.parsedContent',
  'MemoryItem.content',
  'DocumentChunk.content',
  'DocumentChunk.metadata',
  'WorkspaceProject.localPath',
  'WorkspaceProject.settings',
  'AgentTask.prompt',
  'AgentTask.plan',
  'AgentTask.resultSummary',
  'Checkpoint.description',
  'Checkpoint.filesChanged',
  'CommandApproval.command'
]);

function parseModels(schemaText) {
  const models = new Map();
  const modelRe = /model\s+(\w+)\s*\{([\s\S]*?)\}/g;
  for (const match of schemaText.matchAll(modelRe)) {
    const modelName = match[1];
    const body = match[2];
    const fields = new Map();
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/\/\/.*$/, '').trim();
      if (!line || line.startsWith('@@')) continue;
      const parts = line.split(/\s+/);
      if (parts.length < 2) continue;
      const [fieldName, fieldType] = parts;
      fields.set(fieldName, { type: fieldType, raw: line });
    }
    models.set(modelName, fields);
  }
  return models;
}

const EXPECTED_MODELS = new Set([
  'User',
  'Session',
  'AuditLog',
  'ProviderKey',
  'Conversation',
  'Message',
  'Attachment',
  'MemoryItem',
  'KnowledgeBase',
  'DocumentChunk',
  'WorkspaceProject',
  'AgentTask',
  'Checkpoint',
  'CommandApproval'
]);

export function validateMySqlCompatibility() {
  const schemaPath = path.join(PRISMA_DIR, 'schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    return { ok: false, modelCount: 0, errors: ['prisma/schema.prisma does not exist.'] };
  }

  const schemaText = fs.readFileSync(schemaPath, 'utf8');
  const errors = [];

  if (!/provider\s*=\s*"mysql"/.test(schemaText)) {
    errors.push('prisma/schema.prisma must declare provider = "mysql".');
  }

  const models = parseModels(schemaText);

  for (const expectedModel of EXPECTED_MODELS) {
    if (!models.has(expectedModel)) {
      errors.push(`Missing expected model in schema.prisma: ${expectedModel}`);
    }
  }

  for (const [modelName, fields] of models) {
    if (!fields.has('id')) {
      errors.push(`Model ${modelName} missing primary key 'id'.`);
    }

    for (const [fieldName, fieldMeta] of fields) {
      const key = `${modelName}.${fieldName}`;
      if (LARGE_TEXT_FIELDS.has(key) && !/@db\.(LongText|Text)\b/.test(fieldMeta.raw)) {
        errors.push(`Large text field ${key} in schema.prisma must specify @db.Text or @db.LongText.`);
      }
    }
  }

  return { ok: errors.length === 0, modelCount: models.size, errors };
}

const isMain =
  Boolean(process.argv[1]) && path.resolve(__filename) === path.resolve(process.argv[1]);

if (isMain) {
  const result = validateMySqlCompatibility();
  if (!result.ok) {
    console.error('❌ MySQL schema compatibility check failed:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`✅ MySQL canonical schema compatibility verified across all ${result.modelCount} Prisma models.`);
}

