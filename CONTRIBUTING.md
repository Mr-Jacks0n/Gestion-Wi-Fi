# Contributing to Adven's Manager

Thanks for your interest in this project!

## Ground rules

- This codebase is **proprietary** — see `LICENSE` and `SECURITY.md`.
  Contributed code is gratefully reviewed and is licensed to
  Adven's Center on merge (see the *Derived works* clause there).
- Report bugs via **Issues** (use the bug template) and propose ideas
  via **Feature requests**. Security topics → private reporting only
  (`SECURITY.md`).

## Development setup

```bash
# Backend
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python -r requirements.txt

# Frontend
cd ../frontend && npm install
```

Local dev stack (PostgreSQL 16 + API + Vite):

```bash
./stop-local.sh && ./run-local.sh
```

## Workflow

1. Create a branch from `main`:
   `feat/<short-name>`, `fix/<short-name>` or `docs/<short-name>`.
2. Keep PRs small and focused; one topic per PR.
3. Before a frontend PR: `npm run lint && npm run build` must pass
   (TypeScript strict is enabled).
4. Backend changes: run the app locally and smoke-test affected
   endpoints (`http://localhost:8000/docs` in dev mode).
5. Use [Conventional Commits](https://www.conventionalcommits.org/):
   `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `security:` …
6. **Never** commit secrets, real customer data, backups, dumps or
   generated artifacts — the CI and the maintainer will reject them.
   Use `.env` (git-ignored) for local configuration.

## Code style

- Backend: formatted the way the codebase does it (4-space Python,
  descriptive module docstrings); endpoints documented in French or
  English, keep field labels French when user-facing.
- Frontend: React function components, TypeScript strict, inline
  comments when adding a non-obvious piece of logic.
