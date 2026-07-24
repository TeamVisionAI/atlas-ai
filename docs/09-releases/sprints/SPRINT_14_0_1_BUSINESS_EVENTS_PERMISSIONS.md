# Sprint 14.0.1 — Business Events & Permissions

## AI Summary

Sprint 14.0.1 completes the Prospect Engine architecture with Business Events (official language of Atlas — one action, one event) and Prospect Permissions (roles, ownership, audit). Documentation only; no implementation. Complements Sprint 14.0 core engine docs.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 14.0.1 |
| **Status** | Complete (architecture) |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Objective

Complete Prospect Engine architecture by defining **Business Events** and **Permissions & Ownership**.

---

## Delivered (documentation)

| Document | Path |
|----------|------|
| Business Events | [04-architecture/prospect-engine/BUSINESS_EVENTS.md](../../04-architecture/prospect-engine/BUSINESS_EVENTS.md) |
| Prospect Permissions | [04-architecture/prospect-engine/PROSPECT_PERMISSIONS.md](../../04-architecture/prospect-engine/PROSPECT_PERMISSIONS.md) |

---

## Key decisions

1. **Business Events = official language** — timeline, AI, dashboards, automations consume same event stream
2. **One meaningful action = one event** — standardized schema with `eventId`, `eventType`, `prospectId`, `actor`, `version`
3. **Seven event categories** — Lead, Communication, Appointment, Recruiting, Sales, AI, System
4. **Role-based permissions** — Administrator through Read Only + future External API
5. **Audit by design** — modifications, assignments, merges, delete attempts, permission changes emit events

---

## Prospect Engine architecture suite (14.0 + 14.0.1)

| Document | Sprint |
|----------|--------|
| PROSPECT_ENGINE, MODEL, LIFECYCLE, CONNECTORS, TIMELINE | 14.0 |
| BUSINESS_EVENTS, PROSPECT_PERMISSIONS | 14.0.1 |

---

## Out of scope

- Event bus implementation
- Permission middleware in API routes
- Database RBAC tables

---

## Related Documents

- [SPRINT_14_PROSPECT_ENGINE_ARCHITECTURE.md](./SPRINT_14_PROSPECT_ENGINE_ARCHITECTURE.md)
- [CURRENT_STATE.md](../../CURRENT_STATE.md)
- [PROSPECT_ENGINE.md](../../04-architecture/prospect-engine/PROSPECT_ENGINE.md)
