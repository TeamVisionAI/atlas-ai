# Communication Connectors

## AI Summary

Communication connectors are adapters between external platforms and Atlas. They normalize inbound webhooks and outbound sends into Atlas standard events (e.g. `message_received`, `appointment_created`) and never own Prospect truth. The Prospect Engine never calls third-party APIs directly. WhatsApp, Messenger, Email, SMS, and all other channels are interchangeable connectors — Atlas does not depend on any one of them.

## Purpose

Document the **connector philosophy** for Sprint 14: how channels integrate with the Prospect Engine while keeping Atlas platform-independent.

## Status

Approved — Architecture only (Sprint 14.0)

---

## Core philosophy

```
External Platform          Connector              Atlas Core
─────────────────         ───────────            ──────────────
WhatsApp API        →     WhatsApp Connector  →  message_received
Facebook Messenger  →     Messenger Connector →  message_received
Google Calendar     →     Calendar Connector  →  appointment_created
Manual UI           →     Internal Adapter    →  lead_created
CSV file            →     Import Connector    →  lead_created
                              ↓
                      Prospect Engine
                      (prospectId + timeline)
```

1. **Connectors translate; the engine persists.**
2. **Prospects exist without connectors** (manual entry, CSV, API).
3. **Disabling a connector does not delete Prospects or timeline history.**
4. **Adding a connector does not change the Prospect model.**

Contract reference: [RFC-007-connector-contract.md](../../10-rfcs/RFC-007-connector-contract.md).

---

## Connector catalog (examples)

| Connector | Direction | Role |
|-----------|-----------|------|
| **WhatsApp** | In + Out | Meta Cloud API; Embedded Signup credentials |
| **Facebook Messenger** | In + Out | Page webhook + send API |
| **Instagram** | In + Out | DM via Meta platforms (future) |
| **Email** | In + Out | Resend / SMTP / inbound parse |
| **SMS** | In + Out | Twilio or equivalent (future) |
| **Phone** | In + Out | Click-to-call logging; VoIP integration (future) |
| **Zoom** | Out + Events | Meeting links; completion webhooks |
| **Google Meet** | Out + Events | Calendar-embedded links |
| **Microsoft Teams** | Out + Events | Enterprise meetings (future) |
| **Website Chat** | In + Out | Embedded widget → standard events |
| **API** | In + Out | Partner / custom integrations |
| **Manual Entry** | In | Quick Capture, Prospect Center forms |
| **CSV Import** | In | Batch lead load |

None of these are **required** for Atlas to operate. At minimum, Manual Entry + API satisfies core workflows.

---

## Atlas standard events

Connectors MUST emit normalized events. The Prospect Engine consumes these — not raw provider payloads.

### Messaging

| Standard event | Description |
|----------------|-------------|
| `message_received` | Inbound message on any channel |
| `message_sent` | Outbound message delivered or queued |
| `message_failed` | Delivery failure |
| `message_read` | Read receipt (if supported) |

### Lead & identity

| Standard event | Description |
|----------------|-------------|
| `lead_created` | New Prospect or lead signal |
| `lead_updated` | Contact or attribute change from channel |
| `channel_linked` | New channel ID bound to Prospect |
| `channel_unlinked` | Channel removed from Prospect |

### Appointments

| Standard event | Description |
|----------------|-------------|
| `appointment_created` | Interview or meeting scheduled |
| `appointment_updated` | Time or status change |
| `appointment_cancelled` | Cancelled |
| `appointment_completed` | Marked complete |
| `appointment_no_show` | No-show recorded |

### Voice & email engagement

| Standard event | Description |
|----------------|-------------|
| `call_started` | Call initiated |
| `call_completed` | Call ended with duration |
| `call_missed` | Missed inbound |
| `email_sent` | Outbound email |
| `email_opened` | Open tracking (if available) |
| `email_clicked` | Link click (if available) |

### System & AI

| Standard event | Description |
|----------------|-------------|
| `note_added` | Human note |
| `ai_recommendation` | AI suggested action (no state change) |
| `lifecycle_transition` | State machine change |
| `assignment_changed` | Agent assignment |

Event envelope: [EVENT_CATALOG.md](../../06-business/EVENT_CATALOG.md) · [RFC-001-message-envelope.md](../../10-rfcs/RFC-001-message-envelope.md).

---

## Connector responsibilities

Each connector implements:

| Responsibility | Detail |
|----------------|--------|
| **Authenticate** | Verify webhooks; manage OAuth/tokens via secret store |
| **Normalize** | Map provider payload → Atlas standard event |
| **Resolve Prospect** | Lookup or create Prospect by channel ID + contact info |
| **Emit** | Publish event to event bus / timeline pipeline |
| **Send** | Accept outbound commands from Conversation / Response services |
| **Health** | `healthCheck()` per RFC-007 |

Connectors do **not**:

- Own lifecycle state
- Bypass business rules
- Write timeline directly without event envelope
- Store Prospect as channel-specific duplicate records

---

## Inbound flow

```
1. Webhook received (e.g. WhatsApp)
2. Connector validates signature
3. Connector resolves prospectId (lookup Communication Channels)
4. Connector emits message_received { prospectId, channel, payload }
5. Event engine appends timeline
6. Conversation / workflow engines react
7. Lifecycle engine evaluates automatic transitions
```

---

## Outbound flow

```
1. Conversation engine requests send (prospectId, channel, content)
2. Routing selects connector by channelType + org config
3. Connector sends via provider API
4. Connector emits message_sent or message_failed
5. Timeline updated
```

The Prospect Engine is not in the outbound HTTP path — it receives resulting events only.

---

## Platform independence guarantees

| Scenario | Atlas behavior |
|----------|----------------|
| WhatsApp disabled | Prospects remain; other channels work |
| New channel added | Implement connector; no engine schema change |
| Provider API change | Update connector only |
| Meta app rejected | Messenger/WhatsApp connectors off; Email/Manual remain |

---

## Related Documents

- [PROSPECT_ENGINE.md](./PROSPECT_ENGINE.md)
- [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md)
- [Communication_Hub.md](../../02-architecture/Communication_Hub.md)
- [RFC-007-connector-contract.md](../../10-rfcs/RFC-007-connector-contract.md)
- [RFC-010-event-bus-principles.md](../../10-rfcs/RFC-010-event-bus-principles.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Connectors emit Atlas standard events; engine never calls third-party APIs |
| 2026-07-24 | Atlas MUST NOT depend on any single communication platform |
