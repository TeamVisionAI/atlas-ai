# Development Context

## AI Summary

Atlas is a Node/React monorepo: `backend/` (Express, Railway), `frontend/` (Vite/React, Vercel), `docs/` (canonical documentation). Auth uses Atlas bearer sessions. Business logic lives in `backend/core/*Engine.js`. Never commit secrets; read `.env` locally only.

## Purpose

Give AI assistants a fast orientation to the Atlas repository without scanning the entire codebase.

## Status

Draft — Sprint 13.1

## Business Rules

Primary contract: [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md). Decision engine: `backend/core/businessRulesEngine.js`.

## Technical Notes

### Key paths

| Path | Role |
|------|------|
| `backend/server.js` | API entry |
| `backend/core/` | Business engines |
| `backend/routes/` | HTTP routes |
| `frontend/src/pages/` | App pages |
| `frontend/src/services/` | API clients |
| `docs/CURRENT_STATE.md` | Operational snapshot |
| `docs/06-business/BUSINESS_RULES.md` | Behavior contract |

### Environments

- **Local:** `frontend/.env`, `backend/.env`
- **Production:** Vercel (frontend), Railway (API), Supabase (data)

### Verification

```bash
node backend/dev/verifyKnowledgeHub.js
cd frontend && npm run build && npm run lint
```

## API

Atlas REST API under `/api/*`. Knowledge Hub: `/api/knowledge/*` (authenticated).

## Database

Supabase for app data. Documentation is **not** in the database.

## Related Documents

- [../03-engineering/DEVELOPMENT_WORKFLOW.md](../03-engineering/DEVELOPMENT_WORKFLOW.md)
- [../08-operations/local-development.md](../08-operations/local-development.md)
- [AI_GUIDELINES.md](./AI_GUIDELINES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | AI development context doc created for Sprint 13 |
