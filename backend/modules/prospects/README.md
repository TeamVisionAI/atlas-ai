# Atlas Core — Prospect Engine Module

Sprint 14.1 — Phase 1 domain model with **Domain-Driven Design** layering.

## Architecture contract

- [PROSPECT_MODEL.md](../../../docs/04-architecture/prospect-engine/PROSPECT_MODEL.md)
- [PROSPECT_LIFECYCLE.md](../../../docs/04-architecture/prospect-engine/PROSPECT_LIFECYCLE.md)
- [PROSPECT_ENGINE.md](../../../docs/04-architecture/prospect-engine/PROSPECT_ENGINE.md)
- [BUSINESS_EVENTS.md](../../../docs/04-architecture/prospect-engine/BUSINESS_EVENTS.md)

## DDD layers

```
backend/modules/prospects/
├── domain/                          # Pure business logic — no I/O
│   ├── Prospect.js                  # Aggregate root
│   ├── constants.js                 # Lifecycle, lead source, channel enums
│   ├── errors/ProspectDomainError.js
│   ├── repositories/ProspectRepositoryPort.js
│   └── value-objects/
│       ├── ContactInformation.js
│       ├── EmailAddress.js
│       ├── PhoneNumber.js
│       ├── LeadSource.js
│       ├── CommunicationChannel.js
│       ├── ProspectStatus.js        # Lifecycle state machine
│       └── AssignedAgent.js
├── application/                     # Use-case orchestration
│   ├── ProspectApplicationService.js
│   └── validators/                  # HTTP/command input parsing
├── infrastructure/                  # Persistence adapters
│   └── persistence/
│       ├── ProspectMapper.js
│       ├── SupabaseProspectRepository.js
│       └── InMemoryProspectStore.js
├── interfaces/                      # External engine ports (placeholders)
│   ├── businessEventEngine.js
│   └── timelineService.js
└── api/                             # REST delivery mechanism
    ├── prospect.controller.js
    └── prospect.routes.js
```

### Layer rules (Atlas Core alignment)

| Layer | Owns | Must not |
|-------|------|----------|
| **Domain** | Invariants, lifecycle transitions, merge/archive behavior | Query Supabase, emit HTTP, call Meta APIs |
| **Application** | Use cases, deduplication checks, event/timeline orchestration | Embed SQL or Express handlers |
| **Infrastructure** | Row mapping, Supabase/in-memory persistence | Business rule decisions |
| **API** | Auth, request/response, status codes | Domain logic or direct DB access |

The **Prospect aggregate** is the canonical business object (`one Prospect = one truth`). Connectors and channel APIs stay outside this bounded context per PROSPECT_ENGINE.md.

## Integration placeholders

```javascript
const { createProspectModule } = require("./modules/prospects");

const prospectModule = createProspectModule({
  businessEventEngine: myEventEngine,
  timelineService: myTimelineService
});

app.use("/api/prospects", prospectModule.routes);
```

## Database

Table: `atlas_core_prospects` (migration `003_atlas_core_prospects.sql`)

Legacy `prospects` table and `backend/prospects/` channel resolver are unchanged.

## Verification

```bash
node backend/dev/verifyProspectEngine.js
```

## Backward compatibility

Root-level files (`prospect.service.js`, `prospect.repository.js`, etc.) re-export the new layers. Prefer importing from `index.js` or layer paths directly.
