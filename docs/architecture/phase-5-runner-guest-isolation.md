# E.D.I.T.H. Phase 5 Architecture: Isolated Hyper-V Guest Runner & Sandbox Boundary

> **Document Version:** 1.0.0  
> **Target Milestone:** Phase 5 — Autonomous Coding Agent & Isolated Execution  
> **Security Posture:** Zero-Trust Host Boundary, Strict Non-Docker Virtualization, Fail-Closed  

---

## 1. Executive Summary & Threat Model

The primary security mandate of E.D.I.T.H. is that **arbitrary generated code must never execute on the host development machine, inside the application API process, or within a shared host user session**. 

Until a verified, isolated guest boundary is instantiated, `runner-host/runner-service/server.js` hardcodes `EXECUTION_ISOLATION_AVAILABLE = false` and returns HTTP 503 (`ISOLATED_EXECUTION_UNAVAILABLE`).

```
                                  HOST BOUNDARY
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │  [Browser / IDE Client]                                                     │
 │        │                                                                    │
 │        ▼ (HTTP + CSRF + Cookies)                                            │
 │  [Express API Gateway (:3000)]                                              │
 │        │                                                                    │
 │        ▼ (Internal Token + User ID)                                         │
 │  [Edith Engine Policy Gateway (:8002)] ──► [MySQL DB: CommandApproval]      │
 │        │                                                                    │
 │        ▼ (Policy Passed / Approved)                                         │
 │  [Runner Host Controller (:8003)]                                           │
 └────────┬────────────────────────────────────────────────────────────────────┘
          │ Internal Hyper-V Virtual Switch (No Host Access / No LAN Egress)
          ▼
 ┌─────────────────────────────────────────────────────────────────────────────┐
 │                         HYPER-V GUEST VM BOUNDARY                           │
 │                                                                             │
 │   [Guest Runner Agent (:9001)]                                              │
 │         │                                                                   │
 │         ▼ (Scoped to ephemeral workspace copy only)                         │
 │   [Target Workspace Mount]  ◄── Zero parent secrets, zero host paths        │
 │         │                                                                   │
 │         ▼ (CPU: 2 vCPU, RAM: 4GB, Timeout: 30s, Process Kill)               │
 │   [Sandboxed Process: npm test / pytest]                                    │
 │                                                                             │
 │   [Job Complete / Timeout / Crash] ──► Snapshot Revert / Diff Export        │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Strict Non-Docker Rule & Hyper-V Virtualization Specification

In compliance with project directives, **Docker containers are prohibited** for arbitrary code execution due to shared host kernel attack vectors, container breakout vulnerabilities, and Windows desktop host dependency issues. Virtualization is strictly anchored to native Hyper-V micro-VMs.

### VM Configuration Baseline

| Parameter | Specification | Purpose |
| :--- | :--- | :--- |
| **VM Generation** | Generation 2 (UEFI + Secure Boot) | Modern hardware virtualization, measured boot |
| **Virtual CPUs** | 2 vCPUs (cap at 80% host core) | Prevent CPU exhaustion / fork bombs |
| **Memory** | 4,096 MB Static RAM | Prevent memory bloat and host paging |
| **Virtual Switch** | `Internal-Isolated-Switch` | Zero host file sharing, zero local LAN routing |
| **Storage Base** | `EDITH-Guest-Base.vhdx` (Read-Only) | Immutable base OS image |
| **Differencing Disk** | `EDITH-Job-<JobID>.vhdx` (Discarded) | Per-job write layer destroyed on completion |
| **Network Egress** | Deny all by default | Blocks cloud metadata (`169.254.169.254`) & LAN |

---

## 3. Ephemeral Job Lifecycle & Workspace Packaging

Every execution request follows a strict 6-stage ephemeral lifecycle:

### Stage 1: Policy Gate & Approval Binding
1. Request arrives at `POST /v1/edith/execute`.
2. Evaluated against `CommandPolicyGateway`:
   - `DENIED` commands (`rmdir /s /q C:\`, `sudo rm -rf`, fork bombs) return HTTP 403.
   - `CONFIRMATION_REQUIRED` commands (`npm test`, `pytest`, `npm install`) require a durable `CommandApproval` record in MySQL.
3. Approval binds to: `(user_id, exact_command, exact_workspace_cwd, timestamp)`. Once approved, status moves atomically from `APPROVED` to `EXECUTING` to prevent replay.

### Stage 2: Workspace Scoping & Ephemeral Archive
1. The host runner controller packages **only** the target project's tracked files into an in-memory or ephemeral archive (tarball/zip).
2. **Strict Exclusions**:
   - Never package `.env`, `.git/config` with credentials, SSH keys, or parent directory contents.
   - Symlinks pointing outside the workspace root are severed or rejected.

### Stage 3: Differencing Disk Creation & VM Startup
1. Hyper-V creates an ephemeral differencing disk linked to `EDITH-Guest-Base.vhdx`.
2. VM starts or resumes from a hot-standby snapshot in < 1.5 seconds.
3. Ephemeral workspace files are transferred into the guest runner via Hyper-V PowerShell Direct or internal socket over the private switch.

### Stage 4: Sandboxed Command Execution
1. The guest runner agent inside the VM launches the command as a restricted, unprivileged guest user (`edith-sandbox`).
2. Execution is bounded by:
   - **Wall-clock timeout**: 30,000 ms (configurable up to 120,000 ms max).
   - **Output buffer cap**: 256 KB total across stdout and stderr.
   - **Process kill tree**: At timeout or completion, `Stop-Process -Force` kills the entire child process group.

### Stage 5: Artifact Extraction & Diff Capture
1. If the job created or modified files, the guest runner exports the modified files or a unified diff.
2. Results (`exitCode`, `stdout`, `stderr`, `durationMs`, `filesModified`) are sent back to the host runner controller.

### Stage 6: Deterministic Reset (Revert & Destroy)
1. The VM differencing disk is destroyed (`Remove-Item EDITH-Job-*.vhdx -Force`).
2. The VM state reverts to the clean baseline snapshot.
3. No cross-user state, temp files, or installed binaries persist.

---

## 4. Phase 5 Acceptance Test Harness (P5-01 through P5-12)

The 12 required verification test cases from Section 11 of the project audit must all pass before `EXECUTION_ISOLATION_AVAILABLE = true` is enabled in `server.js`:

```
┌───────┬──────────────────────────┬────────────────────────────────────────────────────────┐
│ ID    │ Test Case Name           │ Required Pass Condition                                │
├───────┼──────────────────────────┼────────────────────────────────────────────────────────┤
│ P5-01 │ Guest Readiness          │ VM baseline attestation, runner agent healthy          │
│ P5-02 │ Host Filesystem Boundary │ Guest cannot read C:\Users, C:\Windows, or host paths   │
│ P5-03 │ Workspace Escape Guard   │ Symlink, junction, and UNC traversal rejected          │
│ P5-04 │ Secret Isolation         │ No host API tokens, DB credentials, or SSH keys in VM  │
│ P5-05 │ Network Policy Guard     │ LAN, host, and cloud metadata (169.254.169.254) blocked│
│ P5-06 │ Resource Quota Bounds    │ Timeout kills process tree; RAM/CPU limits enforced    │
│ P5-07 │ Approval Binding         │ Replay, path mismatch, expired approval rejected       │
│ P5-08 │ Truthful Task Results    │ Non-zero exit code accurately reported; no fake output │
│ P5-09 │ Reviewable Patch         │ Patch generated as diff; never auto-applied to host    │
│ P5-10 │ Guest Reset              │ Clean baseline verified after crash, timeout, or error │
│ P5-11 │ Fail-Closed Gateway      │ Runner or VM down returns 503; zero host fallback      │
│ P5-12 │ Security Regressions     │ Shell chaining (;, |, &&), subshells, encoding blocked │
└───────┴──────────────────────────┴────────────────────────────────────────────────────────┘
```

---

## 5. Hyper-V Provisioning Automation Script Plan

The updated `runner-host/windows/provision-vm.ps1` implementation requirements:

1. **Prerequisite Check**: Detect elevation (`WindowsPrincipal.IsInRole([WindowsBuiltInRole]::Administrator)`). If unprivileged, exit with descriptive error detailing required elevation.
2. **Feature Validation**: Verify `Microsoft-Hyper-V-All` status is `Enabled`.
3. **Internal Switch**:
   ```powershell
   if (-not (Get-VMSwitch -Name "EDITH-Internal-Switch" -ErrorAction SilentlyContinue)) {
       New-VMSwitch -Name "EDITH-Internal-Switch" -SwitchType Internal
   }
   ```
4. **Base VHDX Validation**: Verify presence of verified base image (`EDITH-Guest-Base.vhdx`).
5. **Standby VM Pool**: Maintain one warm standby VM ready to accept differencing disks.

---

## 6. Implementation Readiness Sign-Off

- **Code Execution Status**: Currently **Fail-Closed** (`EXECUTION_ISOLATION_AVAILABLE = false`).
- **Prerequisite for Activation**: Elevated administrator configuration of the Hyper-V virtual switch and guest image.
- **Enforcement Rule**: **Never toggle `EXECUTION_ISOLATION_AVAILABLE = true` without executing and passing all 12 acceptance tests (P5-01 through P5-12).**
