# Atlas Core — Timeline Engine

Sprint 14.3 — event projection derived exclusively from Business Events.  
Sprint 14.3.1 — idempotent replay / recovery from persisted Business Events.

## Architecture contract

- [PROSPECT_TIMELINE.md](../../../docs/04-architecture/prospect-engine/PROSPECT_TIMELINE.md)
- [BUSINESS_EVENTS.md](../../../docs/04-architecture/prospect-engine/BUSINESS_EVENTS.md)

## Authoritative vs projection

| Store | Role | Deleted by replay? |
|-------|------|--------------------|
| **Business Events** | Authoritative business history | Never |
| **Timeline entries** | Read-optimized projection | Rebuildable (append-only idempotent replay) |

Timeline **never** queries the Prospect module. History is rebuilt only from the Business Event stream.

## Projection model

```
Business Event published (live)
  → TimelineProjector.handle()
    → projectBusinessEvent()   ← shared mapping
      → TimelineRepository.append()

Business Event persisted (recovery)
  → TimelineReplayService.replay()
    → projectBusinessEvent()   ← same mapping
      → TimelineRepository.append()
```

Shared logic lives in `application/TimelineProjection.js` — do not duplicate mapping in projector or replay code.

## Idempotency

- Timeline entry `id` equals source Business Event `eventId` (`business_event_id`).
- Before append, projection checks for an existing entry.
- Replaying the same event increments `entriesSkipped`, not duplicates.

## Projection failures

`TimelineProjector`:

- logs `eventId`, `eventType`, `prospectId`, and error message;
- records failures in `projector.failures`;
- does **not** mark an event as projected unless append succeeds or an existing entry is confirmed;
- allows repair via replay after the underlying issue is fixed.

## Replay (recovery)

```bash
# Full rebuild — requires explicit confirmation
node backend/dev/rebuildTimelineProjection.js --confirm-full-replay

# One prospect
node backend/dev/rebuildTimelineProjection.js --prospect-id=<uuid>

# Optional date range
node backend/dev/rebuildTimelineProjection.js --prospect-id=<uuid> --from=2026-01-01 --to=2026-12-31
```

`TimelineReplayService.replay()` returns:

- `eventsRead`
- `entriesCreated`
- `entriesSkipped`
- `entriesIgnored` (system events without `prospectId`)
- `failures[]`

No public REST POST — replay is operational/CLI only.

## Layers

```
backend/modules/timeline/
├── domain/
├── application/
│   ├── TimelineProjection.js      # shared mapper
│   ├── TimelineProjector.js
│   ├── TimelineReplayService.js
│   └── TimelineService.js
├── infrastructure/persistence/
└── api/                           # Read-only REST
```

## REST API (authenticated, read-only)

| Method | Route |
|--------|-------|
| GET | `/api/timeline` |
| GET | `/api/prospects/:id/timeline` |

## Wiring

Timeline registers with the Projection Framework (Sprint 14.4):

```javascript
const projections = createProjectionModule({
  publisher: businessEvents.publisher,
  businessEventRepository: businessEvents.repository
});
const timeline = createTimelineModule({ projectionEngine: projections.engine });

await projections.engine.register(timeline.timelineProjection);
projections.engine.start();
```

Legacy direct publisher subscription is deprecated.

## Verification

```bash
node backend/dev/verifyProjectionFramework.js
node backend/dev/verifyTimelineEngine.js
```
