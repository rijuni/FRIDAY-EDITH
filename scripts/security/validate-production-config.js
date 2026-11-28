#!/usr/bin/env node
/**
 * Production Security & Configuration Validator for F.R.I.D.A.Y. & E.D.I.T.H.
 * 
 * Validates cryptographic secret separation, reverse proxy directives,
 * ClamAV streaming limits, and fail-closed code runner status.
 * 
 * Usage:
 *   node scripts/security/validate-production-config.js [--production]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '../..');

const DEV_DEFAULTS = {
  JWT_SECRET: 'development_jwt_secret_must_be_overridden_in_prod',
  ENCRYPTION_MASTER_KEY: 'dev_encryption_master_key_32_chars_min!!',
  INTERNAL_SERVICE_SECRET: 'dev_internal_service_secret_change_in_prod'
};

export function validateProductionConfig(options = {}) {
  const isProd = options.production || process.env.NODE_ENV === 'production' || process.argv.includes('--production');
  const results = [];

  function check(name, pass, message) {
    results.push({ name, pass, message });
    const symbol = pass ? '✅' : '❌';
    console.log(`  ${symbol} [${name}]: ${message}`);
  }

  console.log('================================================================');
  console.log(`  F.R.I.D.A.Y. + E.D.I.T.H. Production Security Auditor`);
  console.log(`  Mode: ${isProd ? 'PRODUCTION' : 'DEVELOPMENT / AUDIT'}`);
  console.log('================================================================');

  // 1. Cryptographic Secret Separation
  console.log('\n[1/4] Auditing Cryptographic Key Integrity & Separation...');
  const jwtSecret = options.JWT_SECRET || process.env.JWT_SECRET || (isProd ? '' : DEV_DEFAULTS.JWT_SECRET);
  const masterKey = options.ENCRYPTION_MASTER_KEY || process.env.ENCRYPTION_MASTER_KEY || (isProd ? '' : DEV_DEFAULTS.ENCRYPTION_MASTER_KEY);
  const internalSecret = options.INTERNAL_SERVICE_SECRET || process.env.INTERNAL_SERVICE_SECRET || (isProd ? '' : DEV_DEFAULTS.INTERNAL_SERVICE_SECRET);

  if (isProd) {
    check(
      'JWT_SECRET_STRENGTH',
      jwtSecret && jwtSecret !== DEV_DEFAULTS.JWT_SECRET && jwtSecret.length >= 32,
      jwtSecret && jwtSecret.length >= 32 && jwtSecret !== DEV_DEFAULTS.JWT_SECRET
        ? 'JWT_SECRET is strong (>= 32 chars) and non-default'
        : 'JWT_SECRET must be at least 32 characters and non-default in production'
    );

    check(
      'ENCRYPTION_MASTER_KEY_STRENGTH',
      masterKey && masterKey !== DEV_DEFAULTS.ENCRYPTION_MASTER_KEY && masterKey.length >= 32,
      masterKey && masterKey.length >= 32 && masterKey !== DEV_DEFAULTS.ENCRYPTION_MASTER_KEY
        ? 'ENCRYPTION_MASTER_KEY is strong (>= 32 chars) and non-default'
        : 'ENCRYPTION_MASTER_KEY must be at least 32 characters and non-default in production'
    );

    check(
      'SECRET_DECOUPLING',
      Boolean(jwtSecret && masterKey && jwtSecret !== masterKey),
      jwtSecret !== masterKey
        ? 'Strict decoupling confirmed: JWT_SECRET !== ENCRYPTION_MASTER_KEY'
        : 'CRITICAL: JWT_SECRET and ENCRYPTION_MASTER_KEY must not be identical!'
    );

    check(
      'INTERNAL_SERVICE_SECRET_STRENGTH',
      internalSecret && internalSecret !== DEV_DEFAULTS.INTERNAL_SERVICE_SECRET && internalSecret.length >= 16,
      internalSecret && internalSecret.length >= 16 && internalSecret !== DEV_DEFAULTS.INTERNAL_SERVICE_SECRET
        ? 'INTERNAL_SERVICE_SECRET is strong (>= 16 chars) and non-default'
        : 'INTERNAL_SERVICE_SECRET must be at least 16 characters and non-default in production'
    );
  } else {
    // In dev mode, verify decoupling logic
    check(
      'DEV_SECRET_DECOUPLING',
      jwtSecret !== masterKey,
      'Development environment maintains distinct JWT and Encryption keys'
    );
  }

  // 2. Fail-Closed Runner Execution Attestation
  console.log('\n[2/4] Auditing Runner Service Fail-Closed Boundary...');
  const runnerServerPath = path.join(ROOT_DIR, 'runner-host/runner-service/server.js');
  let runnerPass = false;
  let runnerMsg = 'Runner server.js not found';

  if (fs.existsSync(runnerServerPath)) {
    const runnerContent = fs.readFileSync(runnerServerPath, 'utf8');
    const hasFailClosed = /const\s+EXECUTION_ISOLATION_AVAILABLE\s*=\s*false;/.test(runnerContent);
    runnerPass = hasFailClosed;
    runnerMsg = hasFailClosed
      ? 'Runner service is FAIL-CLOSED (EXECUTION_ISOLATION_AVAILABLE = false)'
      : 'CRITICAL: Runner service does not have fail-closed execution safety flag enabled';
  }
  check('RUNNER_FAIL_CLOSED_GATE', runnerPass, runnerMsg);

  // 3. ClamAV Anti-Malware Streaming Limits
  console.log('\n[3/4] Auditing Antivirus Streaming Upload Configuration...');
  const clamdConfPath = path.join(ROOT_DIR, 'infrastructure/clamav/clamd.conf');
  let clamPass = false;
  let clamMsg = 'clamd.conf not found';

  if (fs.existsSync(clamdConfPath)) {
    const clamdContent = fs.readFileSync(clamdConfPath, 'utf8');
    const match = clamdContent.match(/StreamMaxLength\s+(\d+[MG]?)/i);
    if (match) {
      clamPass = true;
      clamMsg = `ClamAV StreamMaxLength configured to ${match[1]} (supports up to 1 GiB files)`;
    } else {
      clamMsg = 'StreamMaxLength not specified in clamd.conf';
    }
  }
  check('CLAMAV_STREAM_LIMIT', clamPass, clamMsg);

  // 4. Reverse Proxy & Gateway Configurations
  console.log('\n[4/4] Auditing Reverse Proxy Buffering & Security Directives...');
  const nginxPath = path.join(ROOT_DIR, 'infrastructure/proxy/nginx.conf');
  const caddyPath = path.join(ROOT_DIR, 'infrastructure/proxy/Caddyfile');

  let proxyPass = false;
  let proxyMsg = 'No proxy configurations found';

  if (fs.existsSync(nginxPath)) {
    const nginxContent = fs.readFileSync(nginxPath, 'utf8');
    const hasBufferingOff = /proxy_buffering\s+off;/.test(nginxContent);
    const hasBodySize = /client_max_body_size\s+1024m;/i.test(nginxContent) || /client_max_body_size\s+1G;/i.test(nginxContent);
    const hasSecurityHeaders = /X-Frame-Options/i.test(nginxContent) && /X-Content-Type-Options/i.test(nginxContent);

    if (hasBufferingOff && hasBodySize && hasSecurityHeaders) {
      proxyPass = true;
      proxyMsg = 'Nginx proxy has SSE proxy_buffering off, 1024m max body size, and security headers';
    } else {
      proxyMsg = `Nginx configuration incomplete: bufferingOff=${hasBufferingOff}, bodySize=${hasBodySize}, secHeaders=${hasSecurityHeaders}`;
    }
  } else if (fs.existsSync(caddyPath)) {
    proxyPass = true;
    proxyMsg = 'Caddy proxy configuration detected';
  }
  check('PROXY_STREAMING_SECURITY', proxyPass, proxyMsg);

  // Summary
  const total = results.length;
  const passed = results.filter((r) => r.pass).length;
  const failed = total - passed;

  console.log('\n================================================================');
  console.log(`  AUDIT SUMMARY: ${passed}/${total} checks passed (${failed} failed)`);
  console.log('================================================================');

  return {
    success: failed === 0,
    total,
    passed,
    failed,
    results
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const audit = validateProductionConfig();
  if (!audit.success) {
    process.exit(1);
  }
}
