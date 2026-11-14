# F.R.I.D.A.Y. + E.D.I.T.H. AI Platform

> **Version 2.1** — Monorepo Architecture and Implementation Reference

**F.R.I.D.A.Y.** *(Female Replacement Intelligent Digital Assistant Youth)*: General-purpose AI assistant and intelligence workspace targeting comparable user-facing capabilities and workflows to ChatGPT and Claude. Featuring an atmospheric **Nebula UI** with 3D energy core, conversational streaming, multimodal analysis, and persistent memory.

**E.D.I.T.H.** *(Even Dead, I'm The Hero)*: AI coding IDE and development workspace targeting comparable user-facing capabilities to Codex and Claude Code. Featuring a distraction-free **Developer IDE**, Monaco code editor, per-user workspace indexing, and policy-governed diff previews. Arbitrary code execution stays disabled until a verified isolation backend is configured.

---

## Architecture & Technology Stack

- **Frontend (`apps/web`):** React 18, JavaScript, Vite, Tailwind CSS, Three.js / React Three Fiber / Drei, Monaco Editor, xterm.js, Zustand.
- **Application Backend (`services/api`):** Node.js, Express.js, JavaScript, Prisma ORM (MySQL 8.4 canonical engine via `prisma/schema.prisma`), Zod validation.
- **AI Microservices:** Python, FastAPI, Pydantic (`services/friday-ai` on `:8001` and `services/edith-engine` on `:8002`), authenticated via `X-Internal-Service-Token` (`INTERNAL_SERVICE_SECRET`) + `X-User-Id`.
- **Code Execution:** Disabled by default. The current Windows VM and restricted-user scripts do not provision or verify an isolation boundary; the runner returns unavailable until a real backend is implemented.

---

## Repository Structure

```text
Friday-Edith/
|-- apps/
|   `-- web/                # React 18 + Vite frontend (F.R.I.D.A.Y. & E.D.I.T.H. screens)
|-- services/
|   |-- api/                # Public application backend (Node.js + Express + Prisma)
|   |-- friday-ai/          # AI assistant & RAG service (Python + FastAPI)
|   `-- edith-engine/       # Coding agent planner & diff/policy engine (Python + FastAPI)
|-- runner-host/            # Runner service (fails closed) & incomplete Windows provisioning scripts
|   |-- runner-service/     # Authenticated command runner microservice (:8003)
|   `-- windows/            # Restricted runner user & Hyper-V provisioning scripts
|-- packages/               # Shared contracts, event schemas, design tokens
|-- infrastructure/         # Native reverse-proxy, process manager, and DB migrations
|-- docs/                   # Architecture, product specs, and ADRs
`-- scripts/               # Dev, build, test, and release automation
```

---

## Quickstart

```powershell
# Install Node dependencies & copy environment baseline
npm install
Copy-Item .env.example .env

# Deploy database migrations & seed baseline records (MySQL 8.4)
npm run db:migrate
npm run db:validate:mysql
npm run db:seed

# Start native services (run each in its own terminal, sharing INTERNAL_SERVICE_SECRET)
npm run dev:api       # Starts Node.js Express backend (Port 3000)
npm run dev:web       # Starts React + Vite frontend (Port 5173)
npm run dev:runner    # Starts runner status service; command execution remains disabled
```

## Database migrations

MySQL 8.4 is the canonical database technology for development, staging, and production. Migrations are managed via Prisma in `services/api/prisma/migrations`. Use `npm run db:migrate` to apply pending migrations and `npm run db:validate:mysql` to verify schema compatibility and model definitions.

Set `DATABASE_URL` to a MySQL connection string before running `npm run db:deploy:mysql`. For an existing database, first confirm that its tables match the initial migration, then baseline that database with Prisma `migrate resolve --applied 20261113000000_init` using the matching schema. Do not apply the initial migration to a populated database that has not been baselined.

For Python microservices (`services/friday-ai` and `services/edith-engine`), activate each service's `.venv` and run Uvicorn on loopback (`127.0.0.1:8001` and `127.0.0.1:8002`).

### Friday provider gateway

F.R.I.D.A.Y. uses `FRIDAY_AI_PROVIDER=mock` by default so local development works without sending prompts outside your machine. Mock responses are labeled in the UI. Set `FRIDAY_AI_PROVIDER=auto` and provide one or more server-side `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `GEMINI_API_KEY` values to enable the matching provider; model IDs are configurable with `OPENAI_MODEL`, `ANTHROPIC_MODEL`, and `GEMINI_MODEL`. The model selector is populated from the models that the service can actually use. Missing credentials or unsupported models return an error instead of silently switching to mock output. Keep provider keys in the server `.env` or a secret manager; never put them in frontend variables.

The gateway normalizes OpenAI Chat Completions, Anthropic Messages, and Gemini `streamGenerateContent` streams into Friday's SSE event format. `AI_STREAM_TIMEOUT_MS` bounds the API-to-provider stream. External-provider requests require valid API keys and a network connection; the automated checks use local fixtures and do not send prompts to provider services.

### Friday documents, knowledge bases, and memory

The authenticated API supports personal knowledge bases and user-managed memory:

```text
GET/POST    /v1/friday/knowledge-bases
GET/POST    /v1/friday/knowledge-bases/:id/documents
DELETE      /v1/friday/knowledge-bases/:id/documents   { "filename": "guide.md" }
DELETE      /v1/friday/knowledge-bases/:id
GET/POST    /v1/friday/memory
PATCH/DELETE /v1/friday/memory/:id
```

Document ingestion accepts UTF-8 `.txt`, `.md`, `.csv`, and `.json`, plus `.pdf`, `.docx`, and `.xlsx`, up to 512 KiB at the application API. It checks extension/MIME agreement, text encoding or binary signatures, NUL bytes, JSON/CSV syntax, archive paths, ZIP expansion ratios, PDF page count, and extracted-text limits. PDF/DOCX/XLSX parsing uses pypdf/openpyxl and remains bounded by a parser timeout and size/page/archive limits; scanned-image OCR is not enabled. Production requires a local ClamAV daemon (`MALWARE_SCAN_MODE=clamd`); scanner outages and infected files fail closed. Local development defaults to `MALWARE_SCAN_MODE=off` and responses label this mode as `disabled-development`. Chunks are stored in Prisma and deleted with their knowledge base. Re-uploading a filename in the same knowledge base replaces its indexed chunks. Chat retrieves matching chunks only from the authenticated user's knowledge bases, sends at most five citations to the model, and stores citations in assistant-message metadata. Retrieval is bounded lexical matching for this development foundation; embeddings and semantic reranking remain later work. Memory is user-entered and editable/deletable; Friday does not silently extract personal facts from chat.

## Verification

```powershell
# Node workspace tests (API + Web + Runner) & production web build
npm test
npm run build:web
npm run build:api

# Python service tests
cd services\friday-ai; .\.venv\Scripts\python.exe app/tests/test_friday_ai.py
cd services\edith-engine; .\.venv\Scripts\python.exe -m pytest app/tests -v
```

See [docs/architecture/](file:///m:/Friday-Edith/docs/architecture/) for detailed design specs.

