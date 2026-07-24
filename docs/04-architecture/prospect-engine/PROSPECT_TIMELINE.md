# Prospect Timeline

## AI Summary

The Prospect timeline is the single chronological historical record for each Prospect. Every interaction—lead creation, messages, appointments, outcomes, notes, and AI recommendations—appends as an ordered, immutable event. Connectors and services write through standard events; the timeline is queryable by `prospectId` and is the authoritative audit trail independent of any channel's native thread view.

## Purpose

Design the **Prospect timeline** — structure, event types, ordering, and consumption patterns — as the unified history layer of the Prospect Engine.

## Status

Approved — Architecture only (Sprint 14.0)

---

## Principles

1. **One timeline per Prospect** — keyed by `prospectId`
2. **Append-only** — corrections add new events; no silent edits
3. **Total ordering** — strict chronological sort by `timestamp` (tie-break by `eventId`)
4. **Channel-agnostic display** — UI renders standard event types, not raw payloads
5. **Source of truth for history** — channel apps are not the system of record

---

## Timeline structure

```json
{
  "eventId": "uuid",
  "prospectId": "uuid",
  "eventType": "message_received",
  "timestamp": "2026-07-24T14:00:00.000Z",
  "actor": "SYSTEM | ATLAS | AGENT:{userId} | CONNECTOR:{connectorId}",
  "channel": "whatsapp | messenger | email | manual | null",
  "summary": "Human-readable one line for lists",
  "payload": { },
  "correlationId": "optional-session-or-campaign-id",
  "lifecycleStateAtEvent": "conversation_started"
}
```

Envelope aligns with [EVENT_CATALOG.md](../../06-business/EVENT_CATALOG.md).

---

## Example timeline (chronological)

| Order | Event type | Summary |
|-------|------------|---------|
| 1 | `lead_created` | Lead created via website form |
| 2 | `message_sent` | Atlas sent welcome message (WhatsApp) |
| 3 | `message_received` | Prospect replied "Hola" |
| 4 | `ai_recommendation` | Suggest qualification questions |
| 5 | `lifecycle_transition` | Conversation Started |
| 6 | `note_added` | Agent: prefers evening calls |
| 7 | `lifecycle_transition` | Qualified |
| 8 | `appointment_created` | Interview scheduled Tue 3 PM |
| 9 | `message_sent` | Reminder sent |
| 10 | `appointment_completed` | Interview completed |
| 11 | `lifecycle_transition` | Interview Completed |
| 12 | `note_added` | Outcome discussion |
| 13 | `lifecycle_transition` | Client — policy sold |
| — | *alternate path* | |
| 13′ | `lifecycle_transition` | Recruit — joined team |
| — | *alternate path* | |
| 13″ | `lifecycle_transition` | Lost — not interested |

---

## Event categories

### Origin & assignment

- `lead_created`
- `channel_linked`
- `assignment_changed`

### Messaging (any connector)

- `message_received`
- `message_sent`
- `message_failed`

### Scheduling

- `appointment_created`
- `appointment_updated`
- `appointment_cancelled`
- `appointment_completed`
- `appointment_no_show`

### Voice & email

- `call_completed`
- `email_sent`
- `email_opened`

### Human & AI

- `note_added`
- `ai_recommendation`

### Lifecycle

- `lifecycle_transition` — includes `fromState`, `toState`, `reason`

---

## Consumers

| Consumer | Use |
|----------|-----|
| **Prospect Center** | Activity feed, full history tab |
| **Prospect Workspace** | Context panel beside conversation |
| **Mission Control** | Queue context and last event |
| **Executive Dashboard** | Aggregates (not raw timeline) |
| **Atlas AI / Copilot** | RAG context from recent events |
| **Audit / compliance** | Immutable trail |

---

## Query patterns

| Query | Purpose |
|-------|---------|
| `getTimeline(prospectId, { limit, before, after })` | Paginated history |
| `getLatest(prospectId, n)` | Recent context for AI |
| `filterByType(prospectId, eventTypes[])` | Messages only, appointments only |
| `searchSummary(prospectId, q)` | Phase 2 full-text (future) |

---

## Relationship to channel threads

WhatsApp and Messenger maintain their own thread UIs. Atlas timeline:

- **Superset** — includes cross-channel and system events
- **Authoritative for operations** — agents trust Atlas timeline for handoffs
- **Correlated** — `payload.providerMessageId` links back to channel (opaque)

If a channel is disconnected, timeline history remains complete.

---

## Implementation notes (future)

- Storage: append-only table or event stream per `prospectId`
- Retention: align with privacy policy ([Privacy_and_Data_Handling.md](../../07-security/Privacy_and_Data_Handling.md))
- PII in `payload`: minimize; reference IDs where possible

---

## Related Documents

- [PROSPECT_ENGINE.md](./PROSPECT_ENGINE.md)
- [PROSPECT_MODEL.md](./PROSPECT_MODEL.md)
- [PROSPECT_LIFECYCLE.md](./PROSPECT_LIFECYCLE.md)
- [COMMUNICATION_CONNECTORS.md](./COMMUNICATION_CONNECTORS.md)
- [EVENT_CATALOG.md](../../06-business/EVENT_CATALOG.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Timeline v1.0 — single historical record per Prospect |
