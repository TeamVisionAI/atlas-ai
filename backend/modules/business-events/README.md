# Atlas Core — Business Event Engine

Sprint 14.2 — append-only event store with in-process publish/subscribe.

## Architecture contract

- [BUSINESS_EVENTS.md](../../../docs/04-architecture/prospect-engine/BUSINESS_EVENTS.md)
- [ATLAS_CORE_v1.md](../../../docs/04-architecture/ATLAS_CORE_v1.md)

## Layers

```
backend/modules/business-events/
├── domain/
│   ├── BusinessEvent.js       # Immutable aggregate (internal create)
│   ├── EventTypes.js          # Centralized event type constants
│   ├── EventVersion.js        # Payload schema versioning
│   └── EventMetadata.js
├── application/
│   ├── EventFactory.js        # All new events created here
│   ├── BusinessEventService.js
│   ├── InProcessEventPublisher.js
│   ├── TimelineSubscriber.js  # Placeholder consumer
│   └── BusinessEventProspectAdapter.js
├── infrastructure/persistence/
└── api/                       # Read-only REST
```

## Event lifecycle

1. **Create** — `EventFactory.prospectCreated()` (or other factory method) builds an immutable `BusinessEvent`.
2. **Record** — `BusinessEventService.record()` persists the event (append-only).
3. **Publish** — `InProcessEventPublisher.publish()` notifies registered subscribers.
4. **Consume** — Subscribers (e.g. `TimelineSubscriber` placeholder) react without the service knowing them.

Events are never updated or deleted. Corrections append new events.

## Versioning strategy

| Field | Meaning |
|-------|---------|
| `version` | **Payload schema version** for this `eventType` (not the type catalog) |
| Default | `"1"` |
| Legacy | `"1.0"` stored events remain readable |

Rules:

- New events default to version `"1"` via `EventVersion.normalizeForCreate()`.
- Breaking payload shape changes increment the major version (e.g. `"1"` → `"2"`).
- Historical events keep their stored version — consumers must tolerate older versions.
- Unknown future versions should be logged and skipped by display consumers.

## EventFactory usage

All Business Events must be created through `EventFactory` — do not call `BusinessEvent.create()` directly.

```javascript
const { EventFactory } = require("./modules/business-events");

// Prospect lead events
EventFactory.prospectCreated({ prospectId, actor, leadSource, organizationId });
EventFactory.prospectUpdated({ prospectId, actor, changedFields });
EventFactory.prospectAssigned({ prospectId, actor, assignedAgentId });
EventFactory.prospectArchived({ prospectId, actor, archivedBy });
EventFactory.prospectRestored({ prospectId, actor, restoredBy });
EventFactory.prospectMerged({ prospectId, actor, survivorId, mergedId });

// Generic (connectors, system, future producers)
EventFactory.create({ eventType, prospectId, actor, payload });

// Prospect adapter envelope
EventFactory.fromProspectEmit(legacyEnvelope);

await businessEventService.record(EventFactory.prospectCreated({ ... }));
```

## Integration

```javascript
const { createBusinessEventModule } = require("./modules/business-events");

const businessEvents = createBusinessEventModule();
const prospectModule = createProspectModule({
  businessEventEngine: businessEvents.prospectAdapter
});
```

Events are created only by business logic — never via REST POST.

## Verification

```bash
node backend/dev/verifyBusinessEventEngine.js
node backend/dev/verifyProspectEngine.js
```
