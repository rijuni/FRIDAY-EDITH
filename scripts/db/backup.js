#!/usr/bin/env node
/**
 * Production MySQL Database Backup Utility for F.R.I.D.A.Y. & E.D.I.T.H.
 * 
 * Exports all database models to timestamped, checksummed backup files.
 * Enforces data retention and cleans up backups older than RETENTION_DAYS.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { prisma } from '../../services/api/src/repositories/prisma.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../../backups/db');
const RETENTION_DAYS = 14;

// Models in foreign-key dependency order (top-level models first)
const MODELS = [
  'user',
  'session',
  'workspaceProject',
  'workspaceFile',
  'conversation',
  'message',
  'attachment',
  'memoryItem',
  'knowledgeBase',
  'knowledgeDocument',
  'providerKey',
  'integrationConnection',
  'integrationState',
  'toolInvocation',
  'toolApproval',
  'commandAudit',
  'auditLog',
  'feedback'
];

async function runBackup() {
  console.log('================================================================');
  console.log('  F.R.I.D.A.Y. + E.D.I.T.H. Database Backup Engine');
  console.log('================================================================');

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup_${timestamp}.json`;
  const backupFilePath = path.join(BACKUP_DIR, backupFileName);
  const checksumFilePath = path.join(BACKUP_DIR, `backup_${timestamp}.sha256`);

  console.log(`[1/3] Exporting canonical models from MySQL...`);
  const dump = {
    metadata: {
      timestamp: new Date().toISOString(),
      engineVersion: '2.1.0',
      database: 'friday_edith_db',
      models: {}
    },
    tables: {}
  };

  let totalRecords = 0;
  for (const model of MODELS) {
    if (typeof prisma[model]?.findMany === 'function') {
      try {
        const records = await prisma[model].findMany();
        dump.tables[model] = records;
        dump.metadata.models[model] = records.length;
        totalRecords += records.length;
        console.log(`  -> ${model}: ${records.length} records`);
      } catch (err) {
        console.warn(`  -> ${model}: skipped (${err.message})`);
      }
    }
  }

  console.log(`[2/3] Writing backup archive (${totalRecords} total records)...`);
  const jsonContent = JSON.stringify(dump, null, 2);
  fs.writeFileSync(backupFilePath, jsonContent, 'utf8');

  // Compute SHA-256 checksum for tamper evidence
  const checksum = crypto.createHash('sha256').update(jsonContent).digest('hex');
  fs.writeFileSync(checksumFilePath, `${checksum}  ${backupFileName}\n`, 'utf8');
  console.log(`  -> Archive written: ${backupFilePath} (${(Buffer.byteLength(jsonContent) / 1024).toFixed(1)} KB)`);
  console.log(`  -> SHA-256: ${checksum}`);

  console.log(`[3/3] Pruning backups older than ${RETENTION_DAYS} days...`);
  const now = Date.now();
  const maxAgeMs = RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const files = fs.readdirSync(BACKUP_DIR);
  let prunedCount = 0;

  for (const file of files) {
    const fullPath = path.join(BACKUP_DIR, file);
    const stat = fs.statSync(fullPath);
    if (now - stat.mtimeMs > maxAgeMs) {
      fs.unlinkSync(fullPath);
      prunedCount++;
    }
  }
  if (prunedCount > 0) {
    console.log(`  -> Pruned ${prunedCount} expired backup files.`);
  } else {
    console.log(`  -> No expired backups to prune.`);
  }

  console.log('================================================================');
  console.log('  BACKUP COMPLETE: SUCCESS');
  console.log('================================================================');

  await prisma.$disconnect();
}

runBackup().catch(async (err) => {
  console.error('Backup failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
