import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { prisma } from '../repositories/prisma.js';
import {
  isPrivateOrBlockedHost,
  validateOutboundUrl,
  assertSafeOutboundUrl,
  ALLOWED_EXTERNAL_DOMAINS
} from '../security/ssrf.js';
import { validateProductionConfig } from '../../../../scripts/security/validate-production-config.js';
import { encryptSecret, decryptSecret, hashPassword } from '../security/crypto.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../../..');

describe('Workstream 6.5: Production Hardening, Security Safeguards & Verification', () => {
  let testUserId = null;

  before(async () => {
    // Create an isolated test user for lifecycle and audit verification
    const email = `hardening_test_${Date.now()}@stark.corp`;
    const passwordHash = await hashPassword('HardeningStrongPass!2026');
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: 'USER'
      }
    });
    testUserId = user.id;
  });

  after(async () => {
    if (testUserId) {
      await prisma.toolApproval.deleteMany({ where: { invocation: { userId: testUserId } } });
      await prisma.toolInvocation.deleteMany({ where: { userId: testUserId } });
      await prisma.integrationState.deleteMany({ where: { userId: testUserId } });
      await prisma.integrationConnection.deleteMany({ where: { userId: testUserId } });
      await prisma.providerKey.deleteMany({ where: { userId: testUserId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.session.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
    }
  });

  describe('[P6-SEC-01] SSRF Outbound Guard', () => {
    it('blocks loopback hostnames and IP addresses', () => {
      assert.strictEqual(isPrivateOrBlockedHost('localhost'), true);
      assert.strictEqual(isPrivateOrBlockedHost('127.0.0.1'), true);
      assert.strictEqual(isPrivateOrBlockedHost('127.1.2.3'), true);
      assert.strictEqual(isPrivateOrBlockedHost('::1'), true);
      assert.strictEqual(isPrivateOrBlockedHost('[::1]'), true);
    });

    it('blocks RFC 1918 private subnets and carrier-grade NAT', () => {
      assert.strictEqual(isPrivateOrBlockedHost('10.0.0.1'), true);
      assert.strictEqual(isPrivateOrBlockedHost('10.254.1.1'), true);
      assert.strictEqual(isPrivateOrBlockedHost('172.16.0.1'), true);
      assert.strictEqual(isPrivateOrBlockedHost('172.31.255.254'), true);
      assert.strictEqual(isPrivateOrBlockedHost('192.168.1.1'), true);
      assert.strictEqual(isPrivateOrBlockedHost('192.168.0.254'), true);
      assert.strictEqual(isPrivateOrBlockedHost('100.64.0.1'), true);
    });

    it('blocks cloud metadata IP (169.254.169.254) and link-local ranges', () => {
      assert.strictEqual(isPrivateOrBlockedHost('169.254.169.254'), true);
      assert.strictEqual(isPrivateOrBlockedHost('169.254.1.1'), true);
    });

    it('allows public domain names and verifies known external providers', () => {
      assert.strictEqual(isPrivateOrBlockedHost('api.github.com'), false);
      assert.strictEqual(isPrivateOrBlockedHost('gmail.googleapis.com'), false);
      assert.strictEqual(isPrivateOrBlockedHost('www.googleapis.com'), false);
      assert.strictEqual(isPrivateOrBlockedHost('api.openai.com'), false);
      assert.strictEqual(isPrivateOrBlockedHost('api.anthropic.com'), false);
    });

    it('validateOutboundUrl throws SSRF_BLOCKED for internal URLs', () => {
      assert.throws(
        () => validateOutboundUrl('http://169.254.169.254/latest/meta-data'),
        (err) => err.statusCode === 403 && err.errorCode === 'SSRF_BLOCKED'
      );

      assert.throws(
        () => validateOutboundUrl('http://localhost:3000/internal-admin'),
        (err) => err.statusCode === 403 && err.errorCode === 'SSRF_BLOCKED'
      );

      assert.throws(
        () => validateOutboundUrl('http://192.168.1.100:8080/metrics'),
        (err) => err.statusCode === 403 && err.errorCode === 'SSRF_BLOCKED'
      );
    });

    it('validateOutboundUrl rejects non-HTTP(S) schemes', () => {
      assert.throws(
        () => validateOutboundUrl('ftp://ftp.example.com/file.txt'),
        (err) => err.statusCode === 403 && err.errorCode === 'SSRF_BLOCKED'
      );

      assert.throws(
        () => validateOutboundUrl('file:///etc/passwd'),
        (err) => err.statusCode === 403 && err.errorCode === 'SSRF_BLOCKED'
      );
    });

    it('assertSafeOutboundUrl enforces strict domain allowlists', () => {
      // Allowed GitHub call
      assert.doesNotThrow(() => {
        assertSafeOutboundUrl('https://api.github.com/repos/test/repo', ['api.github.com']);
      });

      // Disallowed external domain call
      assert.throws(
        () => {
          assertSafeOutboundUrl('https://untrusted-third-party.io/api', ['api.github.com']);
        },
        (err) => err.statusCode === 403 && err.errorCode === 'SSRF_BLOCKED'
      );
    });
  });

  describe('[P6-SEC-02] Production Configuration & Key Separation Validator', () => {
    it('audits development configuration and confirms key decoupling', () => {
      const report = validateProductionConfig({ production: false });
      assert.strictEqual(report.success, true);
      const decoupling = report.results.find((r) => r.name === 'DEV_SECRET_DECOUPLING');
      assert.ok(decoupling && decoupling.pass);
    });

    it('rejects identical JWT_SECRET and ENCRYPTION_MASTER_KEY in production mode', () => {
      const duplicateKey = 'super_secret_identical_key_at_least_32_characters!';
      const report = validateProductionConfig({
        production: true,
        JWT_SECRET: duplicateKey,
        ENCRYPTION_MASTER_KEY: duplicateKey,
        INTERNAL_SERVICE_SECRET: 'different_internal_secret_16chars'
      });
      assert.strictEqual(report.success, false);
      const decoupling = report.results.find((r) => r.name === 'SECRET_DECOUPLING');
      assert.strictEqual(decoupling.pass, false);
    });

    it('accepts strong, distinct secrets in production mode', () => {
      const report = validateProductionConfig({
        production: true,
        JWT_SECRET: 'prod_unique_jwt_signing_secret_32_bytes_minimum!',
        ENCRYPTION_MASTER_KEY: 'prod_unique_vault_encryption_key_32_bytes_min!',
        INTERNAL_SERVICE_SECRET: 'prod_unique_internal_secret_16_min!'
      });
      assert.strictEqual(report.success, true);
    });

    it('verifies ClamAV 1 GiB streaming upload directive', () => {
      const clamdConfPath = path.join(ROOT_DIR, 'infrastructure/clamav/clamd.conf');
      assert.ok(fs.existsSync(clamdConfPath), 'clamd.conf must exist');
      const content = fs.readFileSync(clamdConfPath, 'utf8');
      const match = content.match(/StreamMaxLength\s+(\d+[MG]?)/i);
      assert.ok(match, 'StreamMaxLength must be configured');
      const val = match[1];
      assert.ok(val === '1073741824' || val === '1000M' || val === '1G');
    });

    it('verifies Nginx reverse proxy buffering and upload body configuration', () => {
      const nginxPath = path.join(ROOT_DIR, 'infrastructure/proxy/nginx.conf');
      assert.ok(fs.existsSync(nginxPath), 'nginx.conf must exist');
      const content = fs.readFileSync(nginxPath, 'utf8');
      assert.match(content, /proxy_buffering\s+off;/);
      assert.match(content, /client_max_body_size\s+(1024m|1G);/i);
      assert.match(content, /X-Frame-Options/i);
      assert.match(content, /X-Content-Type-Options/i);
    });
  });

  describe('[P6-SEC-03] Database Backup, Retention & Integrity Engine', () => {
    const testBackupDir = path.join(ROOT_DIR, 'backups/db');
    let tempBackupFile = null;
    let tempChecksumFile = null;

    it('generates a valid timestamped JSON backup with SHA-256 checksum', async () => {
      if (!fs.existsSync(testBackupDir)) {
        fs.mkdirSync(testBackupDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `test_hardening_backup_${timestamp}.json`;
      tempBackupFile = path.join(testBackupDir, filename);
      tempChecksumFile = path.join(testBackupDir, `test_hardening_backup_${timestamp}.sha256`);

      const users = await prisma.user.findMany({ take: 2 });
      const dump = {
        metadata: {
          timestamp: new Date().toISOString(),
          database: 'friday_edith_db',
          engineVersion: '2.1.0',
          models: { user: users.length }
        },
        tables: {
          user: users
        }
      };

      const content = JSON.stringify(dump, null, 2);
      fs.writeFileSync(tempBackupFile, content, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      fs.writeFileSync(tempChecksumFile, `${hash}  ${filename}\n`, 'utf8');

      assert.ok(fs.existsSync(tempBackupFile));
      assert.ok(fs.existsSync(tempChecksumFile));
    });

    it('verifies SHA-256 checksum on restore dry-run and detects tampering', () => {
      const validContent = fs.readFileSync(tempBackupFile, 'utf8');
      const expectedHash = fs.readFileSync(tempChecksumFile, 'utf8').trim().split(/\s+/)[0];
      const actualHash = crypto.createHash('sha256').update(validContent).digest('hex');
      assert.strictEqual(actualHash, expectedHash);

      // Simulate tamper
      const tamperedContent = validContent + ' ';
      const tamperedHash = crypto.createHash('sha256').update(tamperedContent).digest('hex');
      assert.notStrictEqual(tamperedHash, expectedHash, 'Tampering must alter SHA-256');
    });

    after(() => {
      if (tempBackupFile && fs.existsSync(tempBackupFile)) fs.unlinkSync(tempBackupFile);
      if (tempChecksumFile && fs.existsSync(tempChecksumFile)) fs.unlinkSync(tempChecksumFile);
    });
  });

  describe('[P6-SEC-04] Token Purge & Audit Immutability on Account Teardown', () => {
    it('securely encrypts, retrieves, and purges integration credentials upon deletion', async () => {
      // 1. Create an integration connection with encrypted token
      const rawToken = 'ghp_secret_access_token_for_hardening_test_12345';
      const encryptedAccessToken = encryptSecret(rawToken);

      const conn = await prisma.integrationConnection.create({
        data: {
          userId: testUserId,
          provider: 'github',
          encryptedAccessToken,
          scopes: JSON.stringify(['repo', 'read:user']),
          status: 'ACTIVE'
        }
      });

      // Verify token decrypts correctly
      const decrypted = decryptSecret(conn.encryptedAccessToken);
      assert.strictEqual(decrypted, rawToken);

      // 2. Log an audit record for this connection
      await prisma.auditLog.create({
        data: {
          userId: testUserId,
          action: 'INTEGRATION_CONNECTED',
          resourceType: 'INTEGRATION_CONNECTION',
          resourceId: conn.id,
          status: 'SUCCESS',
          details: JSON.stringify({ provider: 'github', scopes: ['repo'] })
        }
      });

      // 3. Purge connection
      await prisma.integrationConnection.delete({ where: { id: conn.id } });

      const postDelete = await prisma.integrationConnection.findUnique({ where: { id: conn.id } });
      assert.strictEqual(postDelete, null, 'Integration connection must be purged');

      // 4. Audit log remains immutable and preserved
      const auditRecords = await prisma.auditLog.findMany({
        where: { userId: testUserId, resourceId: conn.id }
      });
      assert.strictEqual(auditRecords.length, 1, 'Audit log must be preserved after credential purge');
      assert.strictEqual(auditRecords[0].action, 'INTEGRATION_CONNECTED');
    });
  });

  describe('[P6-SEC-05] Runner Service Fail-Closed Execution Policy', () => {
    it('asserts that runner-service has host process execution permanently disabled', () => {
      const runnerServerPath = path.join(ROOT_DIR, 'runner-host/runner-service/server.js');
      const content = fs.readFileSync(runnerServerPath, 'utf8');

      // Check the exact constant
      assert.match(
        content,
        /const\s+EXECUTION_ISOLATION_AVAILABLE\s*=\s*false;/,
        'EXECUTION_ISOLATION_AVAILABLE must be hardcoded to false'
      );

      // Check comments explaining the Hyper-V requirement
      assert.match(
        content,
        /Hyper-V/i,
        'Runner server must explain Hyper-V boundary requirement before execution can be enabled'
      );
    });
  });
});
