import dotenv from 'dotenv';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../..');
const prismaDir = path.join(apiRoot, 'prisma');
const schemaPath = path.join(prismaDir, 'schema.prisma');

// Load environment configuration: root .env first, then API-local .env
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env') });

export function validateDatabaseUrl(databaseUrl = process.env.DATABASE_URL) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.trim()) {
    throw new Error('DATABASE_URL environment variable is required.');
  }
  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('MySQL migration requires DATABASE_URL to use the mysql:// protocol.');
  }
  return true;
}

export async function deployMigrations() {
  validateDatabaseUrl();

  const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
  console.log(`🚀 Deploying MySQL migrations using schema: ${path.relative(repoRoot, schemaPath)}`);

  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Prisma migrate deploy exited with code ${result.status}`);
  }
  return result.status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  deployMigrations()
    .then((code) => {
      process.exitCode = code ?? 0;
    })
    .catch((error) => {
      console.error(`❌ Migration deploy failed: ${error.message}`);
      process.exit(1);
    });
}

