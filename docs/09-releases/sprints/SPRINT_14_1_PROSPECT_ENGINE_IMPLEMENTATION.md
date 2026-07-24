# Sprint 14.1 — Prospect Engine Implementation (Phase 1)

## AI Summary

Sprint 14.1 implements the Atlas Core Prospect domain model as the first business object in code. Module at `backend/modules/prospects/` with repository, service, REST API, validation, and Supabase migration `atlas_core_prospects`. Business Event Engine and Timeline Service are placeholder interfaces only.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 14.1 |
| **Status** | Complete (Phase 1) |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Objective

Implement the Prospect Domain Model exactly as documented in the Prospect Engine architecture suite.

---

## Delivered

| Area | Path |
|------|------|
| Module | `backend/modules/prospects/` |
| Migration | `backend/database/migrations/003_atlas_core_prospects.sql` |
| Verification | `backend/dev/verifyProspectEngine.js` |
| Architecture contract | [PROSPECT_MODEL.md](../../04-architecture/prospect-engine/PROSPECT_MODEL.md) |

### Module structure (DDD)

```
backend/modules/prospects/
├── domain/
│   ├── Prospect.js                  # Aggregate root
│   ├── constants.js
│   ├── errors/ProspectDomainError.js
│   ├── repositories/ProspectRepositoryPort.js
│   └── value-objects/               # Contact, Status, LeadSource, …
├── application/
│   ├── ProspectApplicationService.js
│   └── validators/
├── infrastructure/persistence/      # Mapper + Supabase repository
├── interfaces/                      # Event + timeline placeholders
└── api/                             # REST controller + routes
```

### REST API (authenticated)

| Method | Route |
|--------|-------|
| POST | `/api/prospects` |
| GET | `/api/prospects` |
| GET | `/api/prospects/:id` |
| PATCH | `/api/prospects/:id` |
| POST | `/api/prospects/:id/archive` |
| POST | `/api/prospects/:id/restore` |
| POST | `/api/prospects/:id/assign` |
| POST | `/api/prospects/merge` |

---

## Key outcomes

- Prospect model aligned with PROSPECT_MODEL.md
- **Domain-Driven Design** layering — aggregate root, value objects, repository port, application service
- Lifecycle transition validation in `ProspectStatus` value object (PROSPECT_LIFECYCLE.md)
- Repository owns persistence only; domain owns invariants
- Business events and timeline hooks via injectable placeholders
- Separate `atlas_core_prospects` table — legacy `prospects` and Sprint 12.3 channel resolver unchanged
- In-memory fallback when migration not yet applied (dev/verify)

---

## Out of scope (Phase 1)

- Timeline Engine implementation
- Business Event Engine implementation
- Connector Layer
- Permissions middleware (PROSPECT_PERMISSIONS.md)

---

## Verification

```bash
node backend/dev/verifyProspectEngine.js
```

Apply migration in Supabase:

```
backend/database/migrations/003_atlas_core_prospects.sql
```

---

## Related Documents

- [CURRENT_STATE.md](../../CURRENT_STATE.md)
- [PROSPECT_ENGINE.md](../../04-architecture/prospect-engine/PROSPECT_ENGINE.md)
- [BUSINESS_EVENTS.md](../../04-architecture/prospect-engine/BUSINESS_EVENTS.md)
