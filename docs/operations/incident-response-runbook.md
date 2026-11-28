# F.R.I.D.A.Y. & E.D.I.T.H. Incident Response & Operations Runbook

**Classification**: Confidential / Operations  
**Platform Version**: 2.1.0 (Phase 6 Production Sign-Off)  
**Target Environments**: Production, Staging, On-Premises Host  

---

## 1. Incident Severity Matrix & SLAs

| Severity | Definition | Response SLA | Target Resolution | Escalation Contact |
|---|---|---|---|---|
| **P0 - Critical** | Active token leakage, master key compromise, data corruption, or uncontained remote code execution attempt. | < 15 mins | < 2 hours | Security Lead & Principal Ops |
| **P1 - High** | Complete outage of an AI provider (OpenAI, Anthropic, Gemini), DB connection loss, or runner failure. | < 30 mins | < 4 hours | On-call Platform Engineer |
| **P2 - Medium** | Degradation of third-party integration (e.g. GitHub rate limits, Google OAuth refresh latency). | < 2 hours | < 12 hours | Integration SME |
| **P3 - Low** | Minor UI anomaly, non-blocking telemetry delay, or documentation discrepancy. | < 1 business day | Next release | Feature Team |

---

## 2. Emergency Drill 1: OAuth Token Compromise & Instant Revocation

### Scenario
An external token (e.g., GitHub Personal Access Token or Google Workspace OAuth refresh token) is suspected of being exposed or compromised.

### Immediate Containment Steps
1. **Revoke Upstream Token at Provider**:
   - **GitHub**: Navigate to GitHub Settings -> Developer Settings -> Personal access tokens (or OAuth Apps) -> Revoke Token immediately.
   - **Google Cloud**: Navigate to Google Cloud Console -> APIs & Services -> Credentials -> OAuth 2.0 Client IDs -> Revoke user grant or disable the OAuth client ID.
2. **Purge Integration State from Database**:
   - Execute an administrative connection purge to zero out all encrypted access/refresh tokens:
     ```bash
     # Purge via API administration or SQL
     mysql -u friday_edith -p friday_edith_db -e "DELETE FROM integration_connections WHERE provider IN ('github', 'google') AND userId = '<compromised_user_id>';"
     ```
   - All encrypted blobs (`encryptedAccessToken`, `encryptedRefreshToken`) are removed instantly.
3. **Audit Verification**:
   - Query the immutable audit table to verify no unauthorized write invocations occurred during the window:
     ```bash
     mysql -u friday_edith -p friday_edith_db -e "SELECT id, action, resourceType, status, createdAt FROM audit_logs WHERE userId = '<compromised_user_id>' ORDER BY createdAt DESC LIMIT 50;"
     ```
4. **Notify User**:
   - Request the user to reconnect their integration via the F.R.I.D.A.Y. / E.D.I.T.H. UI settings panel, triggering a new PKCE S256 OAuth grant.

---

## 3. Emergency Drill 2: Master Encryption Key Rotation Runbook

### Scenario
The `ENCRYPTION_MASTER_KEY` needs to be rotated due to scheduled security hygiene or suspected environment variable leakage.

### Architecture Principle
- The `ENCRYPTION_MASTER_KEY` is decoupled from `JWT_SECRET`.
- Secrets in `provider_keys` and `integration_connections` are encrypted using AES-256-GCM with envelope formatting: `v1:<salt>:<iv>:<auth_tag>:<ciphertext>`.
- Rotating the master key requires re-encrypting ciphertext envelopes with the new derived key.

### Rotation Procedure
1. **Generate New Cryptographic Master Key**:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
2. **Execute In-Flight Rotation Script**:
   - Run the rotation tool with the current and new keys:
     ```bash
     OLD_KEY="$ENCRYPTION_MASTER_KEY" NEW_KEY="<new_generated_32_byte_key>" node scripts/security/rotate-master-key.js
     ```
   - The script decrypts each secret with `OLD_KEY`, re-encrypts with `NEW_KEY` using fresh salt and 96-bit IV, and updates the database records transactionally.
3. **Deploy Updated Environment**:
   - Update `ENCRYPTION_MASTER_KEY` in the container/host environment or secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault).
   - Perform a rolling restart of the API services (`services/api`).
4. **Validate Vault Decryption**:
   - Invoke `node scripts/security/validate-production-config.js --production` to attest that keys are loaded, decoupled, and functional.

---

## 4. Emergency Drill 3: External Provider Outages & Circuit Breaking

### Scenario
An upstream AI API (OpenAI, Anthropic, Google Gemini) or third-party service experiences high error rates (HTTP 502/503/504) or rate exhaustion (HTTP 429).

### Containment & Resilience Policies
1. **SSRF Guard Protection**:
   - All outbound requests are filtered through `services/api/src/security/ssrf.js`.
   - Outbound endpoints are strictly allowlisted to `api.github.com`, `gmail.googleapis.com`, `www.googleapis.com`, and official AI provider hosts.
   - Internal addresses (RFC 1918, `169.254.169.254`, `localhost`) are hard-blocked.
2. **Failover Execution**:
   - If an AI provider becomes unresponsive, F.R.I.D.A.Y. and E.D.I.T.H. fall back to alternate configured providers registered in the user vault (`provider_keys`).
   - Requests time out gracefully at `AI_REQUEST_TIMEOUT_MS` (30s default) without hanging caller threads.
3. **Integration Backoff**:
   - Connector adapters (`github.adapter.js`, `google.adapter.js`) enforce a 15-second AbortSignal timeout and return structured `statusCode: 502` with typed error codes (`GITHUB_NETWORK_ERROR`, `GOOGLE_NETWORK_ERROR`).

---

## 5. Operations Drill 4: Database Backup & Disaster Recovery

### Automated Daily Backup
- Database backups run on a scheduled cron/service window via:
  ```powershell
  powershell -ExecutionPolicy Bypass -File scripts/db/backup.ps1
  ```
- Backups are stored in `backups/db/backup_<timestamp>.json` alongside a companion SHA-256 checksum file `backup_<timestamp>.sha256`.
- Backups older than **14 days** are automatically pruned by retention logic.

### Disaster Recovery Restore Procedure
1. **Identify Target Backup**:
   - Locate the latest valid backup archive in `backups/db/`.
2. **Validate Integrity & Dry-Run**:
   - Execute a dry run to verify the checksum and schema compatibility without mutating live state:
     ```powershell
     powershell -ExecutionPolicy Bypass -File scripts/db/restore.ps1 backups/db/backup_YYYY-MM-DDTHH-mm-ss.json -DryRun
     ```
   - Verify that output logs show: `SHA-256 verified` and `DRY RUN RESTORE VALIDATION: SUCCESS`.
3. **Execute Full Restore**:
   - If dry-run passes, execute the live database restore:
     ```powershell
     powershell -ExecutionPolicy Bypass -File scripts/db/restore.ps1 backups/db/backup_YYYY-MM-DDTHH-mm-ss.json
     ```
   - The restore engine applies topological foreign-key ordering (users -> workspaces -> conversations -> integrations -> audits) using upserts to avoid primary key collisions.

---

## 6. Security Gate: Fail-Closed Runner Execution Policy

### Critical Policy Requirement
- **Status**: Host execution in `runner-host/runner-service/server.js` is **PERMANENTLY DISABLED** (`EXECUTION_ISOLATION_AVAILABLE = false`).
- Direct process spawning on the host OS is prohibited.
- Any request to `POST /v1/execute` will fail closed immediately with HTTP 503:
  ```json
  {
    "error": "Isolated runner execution is currently unavailable. Hyper-V isolation is not active."
  }
  ```
- **Requirements to Enable Runner Execution**:
  1. Attested Hyper-V or Kata Container microVM boundary active.
  2. Verified network isolation restricting egress to internal endpoints.
  3. Ephemeral disposable disk snapshots mounted per task execution.
  4. Formal security review and sign-off by Platform Security Lead.

---

## 7. Operational Health Checks & Log Hygiene

### Health Endpoints
- **API Core**: `GET /v1/health` -> Checks database connectivity and service status.
- **Runner Service**: `GET /health` (Port 8003) -> Reports `executionUnavailable: true` (fail-closed).
- **Friday AI Service**: `GET /health` (Port 8001) -> Fastify/Python readiness probe.
- **Edith Engine**: `GET /health` (Port 8002) -> Fastify/Python engine readiness probe.

### Zero-Token Logging Mandate
- **Rule**: Tokens, client secrets, and passwords MUST NEVER appear in raw logs, error payloads, or frontend client responses.
- `maskSecret()` in `services/api/src/security/crypto.js` masks secrets to at most the trailing 4 characters (e.g. `sk-...1234`).
- All tool outputs returned to the AI engine are enclosed in untrusted context wrappers (`[EXTERNAL_UNTRUSTED_CONTENT]`) to prevent prompt injection.
