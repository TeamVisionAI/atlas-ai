# Atlas Core — Projection Framework

Sprint 14.4 — reusable read-model projection layer for all Atlas consumers.

## Purpose

Centralize how read models consume Business Events. Future projections (Mission Control, Executive Dashboard, Analytics, AI Context, Notifications) register with `ProjectionEngine` — they must **not** subscribe directly to the Business Event publisher.

**Mission Control (Sprint 15.0)** is the first production projection on this framework besides Timeline.

## Architecture

```
Business Event published
  → ProjectionEngine.dispatch()
    → Projection.handle()   (timeline, mission-control, …)

Business Event replay
  → ProjectionEngine.replay()
    → Projection.replay(events)
```

## Module layout

```
backend/modules/projections/
├── interfaces/
│   └── Projection.js           # initialize, handle, replay, health, name
└── application/
    ├── ProjectionEngine.js     # subscribe, dispatch, replay, logging
    ├── ProjectionRegistry.js   # register, unregister, list
    └── ProjectionLifecycle.js  # registered → initialized → running → stopped
```

## Projection interface

Every projection implements:

| Method | Purpose |
|--------|---------|
| `name()` | Unique registry key |
| `initialize()` | One-time setup |
| `handle(event)` | Live event projection |
| `replay(events)` | Batch rebuild |
| `health()` | Operational status |

## Wiring

```javascript
const businessEvents = createBusinessEventModule({ registerTimelineSubscriber: false });
const projections = createProjectionModule({
  publisher: businessEvents.publisher,
  businessEventRepository: businessEvents.repository
});
const timeline = createTimelineModule({ projectionEngine: projections.engine });

await projections.engine.register(timeline.timelineProjection);
projections.engine.start();
```

## Lifecycle

1. **register** — add projection, call `initialize()`
2. **start** — subscribe engine to Business Events, mark running
3. **dispatch** — fan-out to all running projections (isolated failures)
4. **replay** — coordinated rebuild from persisted events
5. **stop** — unsubscribe (operational maintenance)

## Failure handling

- One failing projection does not stop others.
- Failures logged as `[ProjectionEngine:<name>]`.
- Recorded in `engine.failures[]` for operational visibility.
- Repair via projection-specific replay.

## Timeline migration

`TimelineProjection` implements `Projection`. Behavior is unchanged from Sprint 14.3 — only registration moved to `ProjectionEngine`.

## Verification

```bash
node backend/dev/verifyProjectionFramework.js
node backend/dev/verifyTimelineEngine.js
node backend/dev/verifyBusinessEventEngine.js
node backend/dev/verifyProspectEngine.js
```
