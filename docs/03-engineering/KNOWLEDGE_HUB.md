# Atlas Knowledge Hub

## AI Summary

The Knowledge Hub is Atlas's authenticated in-app browser for repository `/docs`. Phase 1 added tree navigation and Markdown viewing; Sprint 13.1 adds a dashboard home on `CURRENT_STATE.md`, client-side favorites/pinned/recent activity, weighted keyword search, and AI documentation standards. GitHub `/docs` remains the only source of truth—no database copy.

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0310 |
| **Title** | Atlas Knowledge Hub |
| **Version** | 1.1 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-24 |
| **Related Sprint** | Knowledge Hub Phase 1, Sprint 13.1 |

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
| API platform status | `GET /api/platform-status` (`?refresh=1` to bypass cache) |

Both Knowledge Hub API routes require Atlas bearer authentication (`requireAtlasUser`).

---

## Platform status (Sprint 17.0)

The Knowledge Hub dashboard reads **live platform status** from `GET /api/platform-status`. Never hardcode current sprint, version, release status, or project dates in frontend components.

### Source-of-truth priority

1. `docs/00-executive/CURRENT_SPRINT.md` — current sprint (YAML frontmatter)
2. `docs/CURRENT_STATE.md` — overall status, environment health table
3. `docs/10-release-candidate/RC1_CERTIFICATION.md` — release label and certification
4. Root `package.json` — application version
5. Git metadata — branch, short commit, message, date, dirty flag
6. `backend/data/externalReviewStatus.json` — **manual** Meta review status only

If a required source is missing, the API returns `null` / `"Unknown"` and includes a nonfatal `warnings` array. The UI shows **Unknown** — it never falls back to stale hardcoded sprint numbers.

### Automatic vs manual fields

| Field | Source | Automatic |
|-------|--------|-----------|
| Platform version | `package.json` | Yes |
| Release label / certification | RC1 certification doc | Yes |
| Current sprint | `CURRENT_SPRINT.md` | Yes |
| Phase / objective | `CURRENT_SPRINT.md` | Yes |
| Overall status | `CURRENT_STATE.md` or RC1 doc | Yes |
| Environment health | `CURRENT_STATE.md` table | Yes |
| Git branch / commit | Git | Yes (when `.git` available) |
| Documentation freshness | Authoritative doc mtimes | Yes |
| Meta Tech Provider review | `externalReviewStatus.json` | **Manual** |

### Starting a new sprint

1. Update `docs/00-executive/CURRENT_SPRINT.md` frontmatter (`sprint`, `title`, `phase`, `status`, `started`, `objective`).
2. Update `docs/CURRENT_STATE.md` narrative sections when appropriate.
3. Use **Refresh home** in the Knowledge Hub (no page reload required).

### Updating Meta external review status

Edit `backend/data/externalReviewStatus.json`:

```json
{
  "meta": {
    "techProviderAccessVerification": {
      "status": "in_review",
      "submittedAt": "2026-07-25",
      "note": "Waiting for Meta review"
    }
  }
}
```

The Knowledge Hub labels this field as an external manual review status.

### API contract

```json
{
  "ok": true,
  "data": {
    "platform": { "name", "version", "releaseLabel", "certification", "overallStatus" },
    "sprint": { "number", "title", "phase", "objective", "status", "started" },
    "git": { "branch", "shortCommit", "commitMessage", "commitDate", "isDirty" },
    "documentation": { "lastUpdated", "currentStatePath", "currentSprintPath", "roadmapPath", "changelogPath" },
    "external": { "metaTechProviderStatus", "metaTechProviderSubmittedAt", "metaTechProviderNote" },
    "environmentHealth": [{ "component", "status" }],
    "generatedAt": "ISO-8601"
  },
  "warnings": [],
  "generatedAt": "ISO-8601",
  "cached": false
}
```

Implementation: `backend/services/platformStatusService.js`, `frontend/src/hooks/usePlatformStatus.js`

---

## Default homepage

When no `?path=` query is provided, the hub shows a **dashboard** parsed from `docs/CURRENT_STATE.md`, with the full Markdown rendered below.

Dashboard cards:

- Current Sprint, Overall Status, Current Objective
- Recently opened / recently viewed (client `localStorage`)
- Quick links (Architecture, Backlog, README, CURRENT_STATE, sprints index)

Operational snapshot sections in `CURRENT_STATE.md`:

- Current Sprint, Product Stage, Overall Status
- Current Objective, Working, In Progress, Blockers
- External Dependencies, Next Actions, Recent Decisions
- Recently Updated Documents, Last Updated

---

## Client activity (Sprint 13.1)

| Feature | Storage key |
|---------|-------------|
| Recently opened / viewed | `atlas_knowledge_activity_v2` |
| Pinned documents | same |
| Favorites (star) | same |

Migrates legacy `atlas_knowledge_recent_v1` automatically.

---

## Search (Sprint 13.1)

Weighted keyword search over filename, title, folder, and path (`frontend/src/utils/knowledgeSearch.js`). Architecture supports swapping to semantic search in Phase 2.

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
| `frontend/src/pages/KnowledgeHub.jsx` | Page layout: dashboard, tree, search, activity, viewer |
| `frontend/src/components/knowledge/KnowledgeHubHome.jsx` | Home dashboard |
| `frontend/src/utils/knowledgeStorage.js` | Favorites, pinned, recent lists |
| `frontend/src/utils/knowledgeSearch.js` | Keyword search (semantic-ready) |
| `frontend/src/services/knowledgeService.js` | Authenticated API client |
| `frontend/src/services/platformStatusService.js` | Platform status API client |
| `frontend/src/hooks/usePlatformStatus.js` | Dashboard status hook |
| `frontend/src/utils/platformStatusDisplay.js` | Status formatting helpers |
| `frontend/src/components/knowledge/MarkdownViewer.jsx` | Markdown rendering (`react-markdown` + GFM) |

---

## Verification

```bash
node backend/dev/verifyKnowledgeHub.js
node backend/dev/verifyPlatformStatus.js
node frontend/dev/verifyPlatformStatusDisplay.mjs
cd frontend && npm run build
```

---

## Related documents

- [CURRENT_STATE.md](../CURRENT_STATE.md) — Knowledge Hub homepage
- [KNOWLEDGE_HUB_VISION.md](../01-product/KNOWLEDGE_HUB_VISION.md) — product vision
- [DOCUMENTATION_STANDARD.md](./DOCUMENTATION_STANDARD.md) — doc template
- [12-ai/](../12-ai/README.md) — AI assistant documentation
- [SPRINT_KNOWLEDGE_HUB_PHASE_1.md](../09-releases/sprints/SPRINT_KNOWLEDGE_HUB_PHASE_1.md) — Phase 1 sprint
- [SPRINT_13_1_KNOWLEDGE_HUB_ENHANCEMENTS.md](../09-releases/sprints/SPRINT_13_1_KNOWLEDGE_HUB_ENHANCEMENTS.md) — Sprint 13.1
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) — engineering workflow
