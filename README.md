# F.R.I.D.A.Y. + E.D.I.T.H. AI Platform

> **Version 2.1** — Monorepo Architecture and Implementation Reference

**F.R.I.D.A.Y.** *(Female Replacement Intelligent Digital Assistant Youth)*: General-purpose AI assistant and intelligence workspace targeting comparable user-facing capabilities and workflows to ChatGPT and Claude. Featuring an atmospheric **Nebula UI** with 3D energy core, conversational streaming, multimodal analysis, and persistent memory.

**E.D.I.T.H.** *(Even Dead, I'm The Hero)*: AI coding IDE and autonomous development workspace targeting comparable user-facing capabilities to Codex and Claude Code. Featuring a distraction-free **Developer IDE**, Monaco code editor, embedded isolated runner terminal, AST repository indexing, and policy-governed diff review.

---

## Architecture & Technology Stack

- **Frontend (`apps/web`):** React 19, JavaScript, Vite, Tailwind CSS, Three.js / React Three Fiber / Drei, Monaco Editor, xterm.js, Zustand.
- **Application Backend (`services/api`):** Node.js, Express.js, JavaScript, Prisma ORM (SQLite initial dev, MySQL production), Zod validation.
- **AI Microservices:** Python, FastAPI, Pydantic (`services/friday-ai` and `services/edith-engine`).
- **Code Execution:** Native execution (**Strictly No Docker**); dedicated restricted runner user / Hyper-V VM (`runner-host`).

---

## Repository Structure

```text
Friday-Edith/
|-- apps/
|   |-- web/                # React 19 + Vite frontend (F.R.I.D.A.Y. & E.D.I.T.H. screens)
|   `-- admin-web/          # Optional future admin dashboard
|-- services/
|   |-- api/                # Public application backend (Node.js + Express + Prisma)
|   |-- friday-ai/          # AI assistant & RAG service (Python + FastAPI)
|   |-- edith-engine/       # Coding agent planner & intelligence (Python + FastAPI)
|   `-- edith-runner-client/# Secure client to isolated runner
|-- runner-host/            # Isolated VM & execution host scripts (Hyper-V, no Docker)
|-- packages/               # Shared contracts, event schemas, design tokens
|-- infrastructure/         # Native reverse-proxy, process manager, and DB migrations
|-- docs/                   # Architecture, product specs, and ADRs
`-- scripts/                # Dev, build, test, and release automation
```

---

## Quickstart

```powershell
# Install Node dependencies
npm install

# Start development services
npm run dev:api    # Starts Node.js Express backend (Port 3000)
npm run dev:web    # Starts React + Vite frontend (Port 5173)
```

See [docs/architecture/](file:///m:/Friday-Edith/docs/architecture/) for detailed design specs.

