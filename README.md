# F.R.I.D.A.Y. + E.D.I.T.H. AI Platform

> **Version 2.1** — Monorepo Architecture and Implementation Reference

**F.R.I.D.A.Y.** *(Female Replacement Intelligent Digital Assistant Youth)*: General-purpose AI assistant and intelligence workspace targeting comparable user-facing capabilities and workflows to ChatGPT and Claude. Featuring an atmospheric **Nebula UI** with 3D energy core, conversational streaming, multimodal analysis, and persistent memory.

**E.D.I.T.H.** *(Even Dead, I'm The Hero)*: AI coding IDE and autonomous development workspace targeting comparable user-facing capabilities to Codex and Claude Code. Featuring a distraction-free **Developer IDE**, Monaco code editor, embedded isolated runner terminal, AST repository indexing, and policy-governed diff review.

---

## Architecture & Technology Stack

- **Frontend (`apps/web`):** React 18, JavaScript, Vite, Tailwind CSS, Three.js / React Three Fiber / Drei, Monaco Editor, xterm.js, Zustand.
- **Application Backend (`services/api`):** Node.js, Express.js, JavaScript, Prisma ORM (SQLite local dev via `prisma/schema.prisma`, MySQL 8.4 production target via `prisma/schema.mysql.prisma`), Zod validation.
- **AI Microservices:** Python, FastAPI, Pydantic (`services/friday-ai` on `:8001` and `services/edith-engine` on `:8002`), authenticated via `X-Internal-Service-Token` (`INTERNAL_SERVICE_SECRET`) + `X-User-Id`.
- **Code Execution:** Native execution (**Strictly No Docker**); dedicated restricted Node runner service (`runner-host/runner-service` on `:8003`) and Windows low-privilege provisioning scripts (`runner-host/windows`).

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
|-- runner-host/            # Isolated execution host & Windows VM/user setup (No Docker)
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

# Initialize database & validate MySQL 8.4 schema parity
npm run db:validate:mysql
npm run db:seed

# Start native services (run each in its own terminal, sharing INTERNAL_SERVICE_SECRET)
npm run dev:api       # Starts Node.js Express backend (Port 3000)
npm run dev:web       # Starts React + Vite frontend (Port 5173)
npm run dev:runner    # Starts restricted Runner Host service (Port 8003)
```

For Python microservices (`services/friday-ai` and `services/edith-engine`), activate each service's `.venv` and run Uvicorn on loopback (`127.0.0.1:8001` and `127.0.0.1:8002`).

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

