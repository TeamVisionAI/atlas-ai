# Sprint 14.3 — Timeline Engine

## AI Summary

Sprint 14.3 implements the Timeline Engine as an event projection. `TimelineProjector` subscribes to all Business Events and appends immutable `TimelineEntry` records. Timeline history is derived exclusively from Business Events — never from the Prospect module. Read-only REST API at `/api/timeline` and `/api/prospects/:id/timeline`.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 14.3 |
| **Status** | Complete |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Objective

Implement the Timeline Engine as an event projection consuming the frozen Business Event Engine.

---

## Delivered

| Area | Path |
|------|------|
| Module | `backend/modules/timeline/` |
| Migration | `backend/database/migrations/005_atlas_timeline_entries.sql` |
| Verification | `backend/dev/verifyTimelineEngine.js` |
| Architecture contract | [PROSPECT_TIMELINE.md](../../04-architecture/prospect-engine/PROSPECT_TIMELINE.md) |

### Module structure

```
backend/modules/timeline/
├── domain/
│   ├── TimelineEntry.js
│   └── TimelineEntryType.js
├── application/
│   ├── TimelineProjector.js
│   └── TimelineService.js
├── infrastructure/persistence/
└── api/
```

### REST API (authenticated, read-only)

| Method | Route |
|--------|-------|
| GET | `/api/timeline` |
| GET | `/api/prospects/:id/timeline` |

---

## Key outcomes

- TimelineProjector subscribes to `*` on Business Event publisher
- Entries idempotent by `businessEventId` (same as source `eventId`)
- No Prospect module queries for history
- Business Event Engine unchanged (placeholder subscriber disabled in server wiring only)
- Prospect Engine unchanged

---

## Verification

```bash
node backend/dev/verifyTimelineEngine.js
node backend/dev/verifyBusinessEventEngine.js
node backend/dev/verifyProspectEngine.js
```

Apply migration:

```
backend/database/migrations/005_atlas_timeline_entries.sql
```

---

## Related Documents

- [CURRENT_STATE.md](../../CURRENT_STATE.md)
- [SPRINT_14_2_BUSINESS_EVENT_ENGINE.md](./SPRINT_14_2_BUSINESS_EVENT_ENGINE.md)
- [PROSPECT_TIMELINE.md](../../04-architecture/prospect-engine/PROSPECT_TIMELINE.md)
