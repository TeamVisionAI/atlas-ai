# Platform Consolidation — Sprint 19

**Status:** Complete (Sprint 19.1 closed remaining audit conditions)  
**Type:** Architecture consolidation (not a feature sprint)

---

## Problem Statement

Architecture Review v1.0 identified production-readiness gaps before multi-tenant SaaS scale:

- Cross-tenant prospect data exposure on several read paths
- Frontend Mission Control still authoritative for queue order and workflow gate
- Core engines importing HTTP controllers (layer inversion)
- Agent action orchestration embedded in controller (~425 LOC)
- Production startup silently accepting missing secrets and in-memory DB fallbacks
- Workflow gate suppressed by conversation outcomes (e.g. "Information Collected")

Sprint 19 completes the migration already in progress without redesigning the approved architecture.

---

## Scope

### In scope

1. Tenant isolation on all user-facing prospect/workflow/mission read paths
2. Backend-authoritative Mission Control queue and workflow gate
3. Extract `missionControlReadModel.js` — break core → controller imports
4. Extract `agentActionApplicationService.js` — thin HTTP controller
5. Production readiness validator (secrets, tables, in-memory fallback guard)
6. Workflow source-of-truth declaration
7. Mission Engine gate correctness fix
8. Regression verification (`verifySprint19.js`)

### Intentionally postponed

- Full JSON → Supabase workflow migration
- Capacity database migration
- Communication stack unification
- Scheduling stack merge
- Mission materialization table
- API versioning
- Documentation folder reorganization

---

## Tenant Isolation Model

- Organization context resolved **only** from authenticated session (`req.authContext.organizationId` / `req.tenantContext.organizationId`)
- Browser-supplied `organizationId` query/body params are **not** used for data selection on protected read paths
- `organizationGuard()` applied to dashboard, missions, and prospect-center routes
- Compound lookups: `organizationId + phone` via `findProspectInOrganization()`
- `loadProductionProspects(organizationId)` — required parameter; no unscoped selects
- `requireLegacyProspectAccess` scopes phone lookups by tenant organization

---

## Backend Authority Model

- Mission Control navigation order comes from `prioritizedWorkflowQueue` (backend)
- `MOCK_QUEUE_EXTRAS` removed from production frontend path
- Workflow gate visibility from `workspace.workflowGate` (backend `buildWorkflowGateDescriptor`)
- Missions from `/api/missions` (derived, Sprint 18.3 preserved)
- Frontend `localStorage` is **never authoritative** for milestone, gate, priority, or queue position

---

## Workflow Source of Truth

| Layer | Authority |
|-------|-----------|
| Backend `agentActionState.json` + workflow read models | **Authoritative** (temporary JSON legacy) |
| Backend `workflowState.json` | **Authoritative** (temporary JSON legacy) |
| Frontend `localStorage` | **Deprecated** — sync-only, not read for decisions |
| Derived missions | **Projection only** — never persisted as source of truth |
| UI milestone labels | **Display projection** |

New features must not introduce additional workflow state stores.

---

## Dependency Direction

```
HTTP Route → Controller → Application Service / Read Model → Core Domain → Repository
```

**Never:** `Core Engine → HTTP Controller`

Extracted services:

- `backend/core/missionControlReadModel.js` — `getMissionControlState`
- `backend/application/agentActionApplicationService.js` — agent actions + Mission Control assembly

---

## Agent Action Application Service

Business orchestration moved from `agentActionController.js` to `agentActionApplicationService.js`:

- Action validation and execution
- WhatsApp, calendar, capacity delegation
- Timeline logging
- Mission Control read-model assembly

Controller retains HTTP concerns only.

---

## Production Startup Validation

`backend/core/productionReadinessValidator.js`:

- Requires `JWT_SECRET` (or `ATLAS_JWT_SECRET`) in production
- Requires `GOOGLE_OAUTH_STATE_SECRET` when Google OAuth credentials are configured
- Validates required tables: `prospects`, `atlas_users`, `organizations`, `atlas_business_events`
- `forbidProductionInMemoryFallback()` — blocks silent in-memory repository use in production
- Google OAuth dev-only fallback: `atlas-dev-oauth-state` (development only)

---

## Mission Engine Correctness (Phase 7)

`isWorkflowGateActive` now distinguishes **interview outcomes** from **conversation outcomes**:

- Conversation outcomes (`Interested`, `Information Collected`) no longer suppress the post-interview gate
- Interview outcomes (`Recruited`, `No Show`, `Needs More Time`, `Not Interested`, `Rescheduled`) close the gate

---

## Regression Coverage

Run:

```bash
node backend/dev/verifySprint18_2.js
node backend/dev/verifySprint18_3.js
node backend/dev/verifySprint19.js
```

`verifySprint19.js` validates:

- Tenant isolation
- Mission rules + gate fix
- No core → controller imports
- No MOCK_QUEUE_EXTRAS
- Agent action application service
- Production secret validation
- Dashboard backend authority

---

## Remaining Technical Debt

| Item | Priority |
|------|----------|
| JSON file workflow/agent state (not tenant-scoped at file level) | High |
| `findProspectForSystemIngress(phone)` — WhatsApp/system ingress only (Sprint 19.1) | Medium |
| Dual scheduling stacks | Medium |
| Dual communication stacks | Medium |
| Mission generation O(N) | Medium |
| Capacity engine global file store | Medium |

---

## Temporary Legacy Components

These remain and are documented — not removed in Sprint 19:

- `backend/data/workflowState.json`
- `backend/data/agentActionState.json`
- `backend/data/capacity.json`
- Frontend `workflowEngine.js` localStorage sync (deprecated for authority)

**Sprint 19.1 follow-up:** See [Platform Consolidation Sprint 19.1](./Platform-Consolidation-Sprint-19.1.md) for authenticated-path tenant isolation completion.
