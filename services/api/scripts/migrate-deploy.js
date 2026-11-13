import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(apiRoot, '../..');
const prismaDir = path.join(apiRoot, 'prisma');

// Match API configuration precedence: root .env first, then the API-local .env.
dotenv.config({ path: path.join(repoRoot, '.env') });
dotenv.config({ path: path.join(apiRoot, '.env') });

export function resolveSqliteFile(databaseUrl) {
  if (typeof databaseUrl !== 'string' || !databaseUrl.startsWith('file:')) {
    throw new Error('SQLite migration requires DATABASE_URL to use the file: protocol.');
  }

  const [rawPath, query = ''] = databaseUrl.slice('file:'.length).split('?', 2);
  if (!rawPath || rawPath === ':memory:' || query.split('&').includes('mode=memory')) {
    return null;
  }

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error('DATABASE_URL contains an invalid encoded SQLite path.');
  }

  return path.isAbsolute(decodedPath)
    ? path.normalize(decodedPath)
    : path.resolve(prismaDir, decodedPath);
}

async function prepareSqliteFile() {
  const databasePath = resolveSqliteFile(process.env.DATABASE_URL);
  if (!databasePath) return;

  await fs.mkdir(path.dirname(databasePath), { recursive: true });
  const handle = await fs.open(databasePath, 'a');
  await handle.close();
}

async function main() {
  const provider = process.argv[2];
  const schemaPath = provider === 'sqlite'
    ? path.join(prismaDir, 'schema.prisma')
    : provider === 'mysql'
      ? path.join(prismaDir, 'mysql', 'schema.prisma')
      : null;

  if (!schemaPath) throw new Error('Choose a supported database provider: sqlite or mysql.');
  if (provider === 'sqlite') {
    await prepareSqliteFile();
  } else if (!process.env.DATABASE_URL?.startsWith('mysql://')) {
    throw new Error('MySQL migration requires DATABASE_URL to use the mysql:// protocol.');
  }

  const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');
  const result = spawnSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
    cwd: apiRoot,
    env: process.env,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main().catch((error) => {
    console.error(`Migration deploy failed: ${error.message}`);
    process.exitCode = 1;
  });
}
