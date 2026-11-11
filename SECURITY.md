# Security Policy & Architecture Safeguards

## Core Security Rules (Blueprint v2.1)

1. **Strict Execution Isolation:**
   - Arbitrary generated code is **never** executed inside the Node.js API, FastAPI processes, or normal host user sessions.
   - Code execution is strictly delegated to `runner-host` running on a separate restricted user or dedicated Hyper-V VM without Docker.
2. **Model Non-Authority:**
   - AI models never self-authorize destructive actions, package installations, network access, or Git push operations.
   - All tool calls must pass through the policy gateway and require explicit human-in-the-loop approvals when classified above the safe risk tier.
3. **Data Protection & Key Isolation:**
   - Provider API keys and database credentials are kept strictly server-side in encrypted OS storage.
   - Frontend client bundles (`apps/web`) never contain secret environment variables or direct database access.
4. **Vulnerability Reporting:**
   - Report security vulnerabilities privately to the repository security maintainers.

