# Sprint 14.2 — Business Event Engine

## AI Summary

Sprint 14.2 implements the Atlas Business Event Engine — immutable append-only events, centralized event types, repository, in-process publisher with subscriber registration, and read-only REST API. Prospect Engine publishes real events via `BusinessEventProspectAdapter`. Timeline receives events through `TimelineSubscriber` placeholder only.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 14.2 |
| **Status** | Complete |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Objective

Implement the Business Event Engine exactly as documented — Atlas becomes event-driven.

---

## Delivered

| Area | Path |
|------|------|
| Module | `backend/modules/business-events/` |
| Migration | `backend/database/migrations/004_atlas_business_events.sql` |
| Verification | `backend/dev/verifyBusinessEventEngine.js` |
| Architecture contract | [BUSINESS_EVENTS.md](../../04-architecture/prospect-engine/BUSINESS_EVENTS.md) |

### Module structure

```
backend/modules/business-events/
├── domain/
│   ├── BusinessEvent.js
│   ├── EventTypes.js
│   └── EventMetadata.js
├── application/
│   ├── BusinessEventService.js
│   ├── InProcessEventPublisher.js
│   ├── TimelineSubscriber.js
│   └── BusinessEventProspectAdapter.js
├── infrastructure/persistence/
└── api/                         # Read-only REST
```

### REST API (authenticated, read-only)

| Method | Route |
|--------|-------|
| GET | `/api/business-events` |
| GET | `/api/business-events/:id` |
| GET | `/api/prospects/:id/events` |

No POST — events created only by business logic.

### Event categories (EventTypes.js)

Lead · Communication · Appointment · Recruiting · Sales · AI · System

Prospect Engine publishes: `prospect_created`, `prospect_updated`, `prospect_assigned`, `prospect_archived`, `prospect_restored`, `prospect_merged`

---

## Key outcomes

- Immutable `BusinessEvent` aggregate
- Centralized event type constants — no magic strings
- Append-only repository with search methods
- In-process publish/subscribe (`subscribe`, `unsubscribe`, `publish`)
- `TimelineSubscriber` placeholder registered on boot
- Prospect module integrated via `BusinessEventProspectAdapter`

---

## Out of scope

- Timeline Engine implementation
- External message broker (Kafka, Redis, etc.)
- Event creation via REST

---

## Verification

```bash
node backend/dev/verifyBusinessEventEngine.js
node backend/dev/verifyProspectEngine.js
```

Apply migration:

```
backend/database/migrations/004_atlas_business_events.sql
```

---

## Related Documents

- [CURRENT_STATE.md](../../CURRENT_STATE.md)
- [BUSINESS_EVENTS.md](../../04-architecture/prospect-engine/BUSINESS_EVENTS.md)
- [SPRINT_14_1_PROSPECT_ENGINE_IMPLEMENTATION.md](./SPRINT_14_1_PROSPECT_ENGINE_IMPLEMENTATION.md)
