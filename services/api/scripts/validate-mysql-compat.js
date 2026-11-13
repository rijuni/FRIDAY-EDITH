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

export function validateMySqlCompatibility() {
  const sqliteSchemaPath = path.join(PRISMA_DIR, 'schema.prisma');
  const mysqlSchemaPath = path.join(PRISMA_DIR, 'schema.mysql.prisma');
  const mysqlMigrationSchemaPath = path.join(PRISMA_DIR, 'mysql', 'schema.prisma');

  const sqliteText = fs.readFileSync(sqliteSchemaPath, 'utf8');
  const mysqlText = fs.readFileSync(mysqlSchemaPath, 'utf8');
  const mysqlMigrationSchemaText = fs.readFileSync(mysqlMigrationSchemaPath, 'utf8');
  const errors = [];

  if (mysqlText.replace(/\r\n/g, '\n').trim() !== mysqlMigrationSchemaText.replace(/\r\n/g, '\n').trim()) {
    errors.push('prisma/mysql/schema.prisma must match canonical schema.mysql.prisma.');
  }

  if (!/provider\s*=\s*"mysql"/.test(mysqlText)) {
    errors.push('schema.mysql.prisma must declare provider = "mysql".');
  }

  const sqliteModels = parseModels(sqliteText);
  const mysqlModels = parseModels(mysqlText);

  for (const [modelName, sqliteFields] of sqliteModels) {
    const mysqlFields = mysqlModels.get(modelName);
    if (!mysqlFields) {
      errors.push(`Missing model in schema.mysql.prisma: ${modelName}`);
      continue;
    }

    for (const [fieldName, sqliteMeta] of sqliteFields) {
      const mysqlMeta = mysqlFields.get(fieldName);
      if (!mysqlMeta) {
        errors.push(`Missing field in schema.mysql.prisma: ${modelName}.${fieldName}`);
        continue;
      }
      if (sqliteMeta.type !== mysqlMeta.type) {
        errors.push(
          `Field type mismatch on ${modelName}.${fieldName}: sqlite=${sqliteMeta.type} vs mysql=${mysqlMeta.type}`
        );
      }

      const key = `${modelName}.${fieldName}`;
      if (LARGE_TEXT_FIELDS.has(key) && !/@db\.(LongText|Text)\b/.test(mysqlMeta.raw)) {
        errors.push(`Large text field ${key} in schema.mysql.prisma must specify @db.Text or @db.LongText.`);
      }
    }
  }

  for (const modelName of mysqlModels.keys()) {
    if (!sqliteModels.has(modelName)) {
      errors.push(`Extra model in schema.mysql.prisma not present in schema.prisma: ${modelName}`);
    }
  }

  return { ok: errors.length === 0, modelCount: sqliteModels.size, errors };
}

const isMain =
  Boolean(process.argv[1]) && path.resolve(__filename) === path.resolve(process.argv[1]);

if (isMain) {
  const result = validateMySqlCompatibility();
  if (!result.ok) {
    console.error('❌ MySQL 8.4 compatibility check failed:');
    for (const err of result.errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log(`✅ MySQL 8.4 schema compatibility verified across all ${result.modelCount} Prisma models.`);
}

