# Contributing Guidelines

1. **Monorepo Discipline**:
   - Keep boundaries intact: `apps/web` (presentation), `services/api` (authoritative backend & Prisma), `services/friday-ai` & `services/edith-engine` (internal AI computation only).
2. **Database Migrations**:
   - Design schemas against the canonical MySQL target while keeping SQLite development compatibility intact.
   - Always rehearse data migrations before deployment.
3. **Commit Standards**:
   - Use conventional commit messages (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`).
