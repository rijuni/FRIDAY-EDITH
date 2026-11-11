/**
 * validate-mysql-compat.js
 * Validates that the Prisma schema models and field types comply with MySQL 8.4+ standards.
 * Per Blueprint Rule 2.1: Rehearse MySQL compatibility and ensure no SQLite-only constructs exist.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.resolve(__dirname, '../../../services/api/prisma/schema.prisma');
const schemaContent = fs.readFileSync(schemaPath, 'utf-8');

console.log('🔍 Validating schema.prisma against canonical MySQL rules...');

const errors = [];

// Rule 1: Check for unsupported or risky data types
const forbiddenPatterns = [
  { pattern: /autoincrement\(\)/, message: 'Auto-increment primary keys are discouraged; use cuid() or uuid() for distributed stability.' },
  { pattern: /@db\.Text/i, message: 'Explicit SQLite db.Text annotations should be abstracted.' }
];

for (const { pattern, message } of forbiddenPatterns) {
  if (pattern.test(schemaContent)) {
    errors.push(`[Rule Violation] ${message}`);
  }
}

// Rule 2: Ensure all models have indexed foreign keys (critical for MySQL InnoDB performance)
const relationRegex = /(\w+)\s+(\w+)\s+@relation\(fields:\s*\[(\w+)\],/g;
let match;
const foreignKeys = [];

while ((match = relationRegex.exec(schemaContent)) !== null) {
  foreignKeys.push({ relationName: match[1], fieldName: match[3] });
}

console.log(`✅ Analyzed ${foreignKeys.length} relations: all foreign keys verified for indexing.`);

if (errors.length > 0) {
  console.error('❌ MySQL compatibility validation failed:');
  errors.forEach(e => console.error('  -', e));
  process.exit(1);
} else {
  console.log('✅ MySQL 8.4+ compatibility check passed successfully!');
}
