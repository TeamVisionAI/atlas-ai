# Phase 3 — Communications Inventory

## Source-of-truth map (verified)

| Concern | Actual truth | Not sufficient alone |
|---|---|---|
| Message content | `conversation_logs.message` | `workflow_events.payload.bodyPreview` (≤280) |
| Delivery status | `whatsapp_outbound_deliveries` | conversation_logs (no status) |
| Conversation ordering | `conversation_logs.created_at` | Mission Control live index (ephemeral) |
| Workflow current state | `workflowState.json` (+ milestone derivation) | `prospects.workflow_state` (unused live) |
| Workflow transition audit | `workflow_events` | business events (UUID path; often empty here) |
| Appointment truth | `atlas_appointments` | prospect appointment fields / MC JSON |
| Human takeover | `workflowState.json` ownership + agent actions | — |
| AI / system decision trace | **Missing as first-class store** | Infer from logs + code path |

---

## Durable stores

### `conversation_logs` — canonical transcript

| | |
|---|---|
| Purpose | Full inbound/outbound WhatsApp + agent-note text |
| Org field | Column exists; **writer leaves null** (TV-000028: 32/32 null) |
| Prospect link | `prospect_phone` only (no `prospect_id`) |
| Appointment link | none |
| Direction | `incoming` / `outgoing` |
| Writers | `logService.js` ← inbound/outbound pipelines, CE, agent actions |
| Readers / UI | Mission Control thread, `/timeline/:phone`, activity feed merge, BR-075 window |
| Production | Yes |
| Gap | No org on insert; no decision/confidence fields; agent notes encoded as message text |

### `whatsapp_outbound_deliveries` — canonical delivery

| | |
|---|---|
| Purpose | BR-075 attempt ledger + idempotency |
| Linkage | `organization_id`, phone, `conversation_log_id`, `provider_message_id`, `idempotency_key` |
| Writers | `whatsappOutboundDeliveryRepository` ← outbound pipeline |
| UI | Not first-class (ops/diagnostics only) |
| Production | Yes |
| Gap | No inbound delivery table; content not stored |

### `workflow_events` — phone audit stream

| | |
|---|---|
| Purpose | MessageReceived/Sent, lifecycle, ownership, notes |
| Linkage | `prospect_phone`, `correlation_id`; optional `conversationLogId` in payload |
| Writers | `eventEngine` / bridges |
| UI | Prospect Workspace activity feed |
| Gap | No org FK; previews only; parallel to UUID business events |

### `atlas_business_events` + `atlas_timeline_entries`

| | |
|---|---|
| Purpose | Org-scoped domain events → timeline projection |
| Canonical? | Domain analytics — **not** message truth |
| TV-000028 | **0 events** in forensic window |
| Gap | Not reliable for Communications Center transcript |

### `atlas_appointments`

| | |
|---|---|
| Purpose | Appointment write model + calendar metadata |
| Communication-adjacent | confirmation/reminder flags; history JSON |
| Production | Yes (required) |

### Mission Control / Executive projection tables

Derived read models from business events. Day-to-day MC UI uses **live** compose (`conversation_logs` + `workflowState.json` + appointments), not only projection tables.

### `atlas_audit_log`

Security/identity audit — not a customer message store.

### `whatsapp_integrations`

Channel credentials / routing — not history.

---

## File / JSON stores

| Store | Role | Risk |
|---|---|---|
| `workflowState.json` | Live workflow ownership/milestones | Multi-instance unsafe; not SQL |
| `appointmentReminders.json` | Reminder queue | Produced conflicting confirmation in TV-000028 |
| `agentActionState.json` | Agent flags / notes side state | Parallel to log notes |
| `appointments.json` | Dev fallback only | Not production truth |

---

## Ephemeral

| Store | Role |
|---|---|
| `capacityEngine` bookings Map | Conversational slot holds |
| Orchestrator `qualificationStateByPhone` | Edge detection |
| Gateway `ConversationManager` | Routing session |
| Live MC in-memory index | “Now” snapshot |

---

## Overlap / Communications Center implications

1. **Three parallel streams:** full text (logs) · phone audit (workflow_events) · UUID business events (often missing).
2. **Two timelines in product:** message thread vs business-event timeline panel.
3. **Two Mission Controls:** live compose vs projection tables.
4. **Notes** are log rows + optional JSON — no notes table.
5. **No decision ledger** — cannot answer “why did Atlas say X?” without re-running code.

### Recommended Communications Center backing (design only)

```text
Primary feed: conversation_logs (content + order)
Enrich with:  whatsapp_outbound_deliveries (delivery)
              workflow_events (system/lifecycle)
              atlas_appointments (appointment chips)
Optional:     atlas_business_events / timeline_entries when present
Future:       conversation_decisions (v2 structured decisions)
```

Require `organization_id` + `prospect_id` on all new writes; backfill logs where possible.
