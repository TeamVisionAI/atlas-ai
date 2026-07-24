# Atlas Knowledge Hub

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0310 |
| **Title** | Atlas Knowledge Hub |
| **Version** | 1.0 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-24 |
| **Related Sprint** | Knowledge Hub Phase 1 |

---

## Purpose

Provide an authenticated in-app documentation browser for Atlas operators. The Knowledge Hub reads Markdown directly from the repository `/docs` folder — **no database copy, no second source of truth**.

---

## Routes

| Surface | Path |
|---------|------|
| Frontend (authenticated shell) | `/app/knowledge` |
| Legacy redirect | `/knowledge` → `/app/knowledge` |
| API tree | `GET /api/knowledge/tree` |
| API document | `GET /api/knowledge/document?path=<relative-md-path>` |

Both API routes require Atlas bearer authentication (`requireAtlasUser`).

---

## Default homepage

`docs/CURRENT_STATE.md` is the default document when no `?path=` query is provided.

Operational snapshot sections:

- Current Sprint
- Current Objective
- Working / In Progress / Blockers
- External Dependencies
- Next Actions
- Recent Decisions
- Recently Updated Documents

---

## Security

- **Path traversal blocked** — only `.md` files under `docs/` are readable
- **Authentication required** — same Atlas session bootstrap as Quick Capture
- **No write API in Phase 1** — read-only filesystem access

Implementation: `backend/core/knowledgeHubService.js`

---

## Frontend

| File | Role |
|------|------|
| `frontend/src/pages/KnowledgeHub.jsx` | Page layout: tree, search, recent, viewer |
| `frontend/src/services/knowledgeService.js` | Authenticated API client |
| `frontend/src/components/knowledge/MarkdownViewer.jsx` | Markdown rendering (`react-markdown` + GFM) |

Recent documents persist in `localStorage` key `atlas_knowledge_recent_v1`.

---

## Verification

```bash
node backend/dev/verifyKnowledgeHub.js
cd frontend && npm run build
```

---

## Related documents

- [CURRENT_STATE.md](../CURRENT_STATE.md) — Knowledge Hub homepage
- [SPRINT_KNOWLEDGE_HUB_PHASE_1.md](../09-releases/sprints/SPRINT_KNOWLEDGE_HUB_PHASE_1.md) — sprint record
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) — engineering workflow
