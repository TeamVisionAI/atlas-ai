# Phase 6 — Recruit AI v2 & Communications Center Architecture

Design only. Reuses Atlas engines; does **not** redesign auth, BR-075, Meta Review, or appointment canonical truth.

## Design goals (from TV-000028 failures)

1. Durable conversation context (offered slots, last question, confirmed fields, language, appointment type).
2. Structured decisions before side effects.
3. Side effects only after authorization + explicit confirmation rules.
4. One chronological Communications Center view across sources.
5. Permanent replay of TV-000028 as regression.
6. Meta Review remains strict / reviewer-safe; production flexibility is an explicit policy flag.

---

## Layered engine (v2)

```
Inbound normalized message
  → ContextLoader (durable conversation context + transcript tail)
  → Interpreter (intent + entities + confidence; parsers/LLM behind interface)
  → Tools (availability, prospect profile, appointment read)
  → DecisionEngine → StructuredDecision (JSON contract)
  → ResponseRenderer (language-locked templates / constrained NL)
  → SideEffectAuthorizer (BR-075 + mayCreateAppointment + confirmation gates)
  → Executors (WhatsApp send, appointment create, calendar, reminders)
  → OutcomePersistence (logs, deliveries, decision ledger, context patch)
```

Conversation Engine (BR-049) remains the orchestrator that **delegates** — it must not reimplement scheduling/appointments.

### Separation of concerns

| Layer | Owns | Must not own |
|---|---|---|
| Context | memory of offers, questions, language, type | WhatsApp send |
| Interpretation | intent/entities/confidence | booking |
| Tools | availability / profile reads | customer copy |
| Decision | nextAction + flags + reasonCodes | raw Graph API |
| Renderer | customer-visible text | DB writes except via outcome |
| Authorizer | BR-075 + appointment permission | inventing slots |
| Executors | side effects | changing intent |
| Persistence | transcript + decision audit | silent overwrites of appointment truth |

---

## Structured decision contract

```json
{
  "conversationId": "string",
  "prospectId": "string",
  "organizationId": "string",
  "preferredLanguage": "en",
  "intent": "scheduling_counteroffer",
  "entities": {
    "requestedDate": null,
    "requestedTime": "18:30",
    "appointmentType": "in_person"
  },
  "context": {
    "previouslyOfferedSlots": [
      { "date": "2026-08-10", "time": "17:00", "timezone": "America/New_York" },
      { "date": "2026-08-10", "time": "17:15", "timezone": "America/New_York" }
    ],
    "lastQuestionAsked": "offer_time_choices",
    "knownLocation": "office",
    "confirmedFields": ["city", "state", "interview_type", "day_preference", "period"],
    "unresolvedFields": ["final_time"]
  },
  "availability": {
    "requestedSlotAvailable": false,
    "nearestAlternatives": []
  },
  "decision": {
    "nextAction": "offer_alternatives_or_escalate",
    "requiresExplicitConfirmation": true,
    "mayCreateAppointment": false,
    "shouldEscalate": true
  },
  "confidence": 0.94,
  "reasonCodes": [
    "COUNTEROFFER_OUTSIDE_OFFERED_SET",
    "SAME_SLOTS_ALREADY_REJECTED",
    "ESCALATE_AFTER_REPEATED_MISMATCH"
  ],
  "customerReplyPlan": {
    "acknowledgeRequest": true,
    "forbidInternalDiagnostics": true,
    "templateKey": "schedule_unavailable_acknowledge"
  }
}
```

### Decision rules (initial)

- `mayCreateAppointment=true` only if `requiresExplicitConfirmation` satisfied and agent resolved.
- Never send internal error strings; map to safe customer copy + `shouldEscalate`.
- If counteroffer time ∉ offered set and unavailable → acknowledge + alternatives **or** escalate after N mismatches (TV-000028: N≥2).
- Do not re-offer identical slot set without new availability result.
- Preferred language is sticky for all automated copy (including reminders).
- Exactly one customer confirmation message per appointment id (idempotency key required end-to-end).

### Meta Review

- Interpreter flexibility policy: `conversationalScheduleFlexibility = !isMetaReviewModeEnabled()` (preserve today’s gate).
- Decision ledger + Communications Center still work; reviewer allowlist/language lock untouched.
- No Google / securities / PI exposure via new surfaces.

---

## Durable context store (proposed)

New table (future migration — **not** in this audit PR), e.g. `atlas_conversation_contexts`:

- `organization_id`, `prospect_id`, `conversation_id`
- `preferred_language`, `last_question_asked`
- `previously_offered_slots` JSONB
- `confirmed_fields` / `unresolved_fields` JSONB
- `active_appointment_id` nullable
- `mismatch_count`, `updated_at`

Companion: `atlas_conversation_decisions` append-only decision JSON + `conversation_log_id` + reasonCodes.

Until migrated, v2 may stage behind feature flag writing decisions to a JSON audit file in non-prod only.

---

## Communications Center (product architecture)

### Purpose

One chronological view of everything Atlas said/heard/did for a prospect — for RVP/admin coaching and Recruit AI debugging.

### Read model composition

```
UnifiedEvent {
  timestamp, timezone,
  source,              // conversation_logs | workflow_events | deliveries | appointments | decisions
  direction,           // inbound | outbound | system
  actor,               // prospect | atlas | agent | system
  summary,
  body?,               // full text when from logs
  deliveryStatus?,
  decisionId?,
  appointmentId?,
  grade?               // optional offline QA annotation
}
```

Merge key: timestamp + source id; prefer log id as stable message key; attach delivery by `conversation_log_id`.

### UI principles

- Single timeline (not separate “messages” vs “activity” vs “business timeline” for this surface).
- Filters: inbound / outbound / system / appointments / failures.
- Deep link from Mission Control prospect.
- Tenant + ownership middleware unchanged (Express); service-role only on server.
- Meta Review: only reviewer-safe seeded prospects; no production TV rows.

### Implementation order

1. Read-only API aggregating existing tables (no CE rewrite).
2. Decision ledger writes (feature-flagged).
3. CE consumes StructuredDecision (v2 cutover).
4. Replay harness uses TV-000028 fixture.

---

## Mapping TV-000028 → v2 expected decisions

| Prospect turn | v2 intent | nextAction | mayCreateAppointment |
|---|---|---|---|
| Opportunity ask | `opportunity_question` | `answer_brief_value_prop_then_qualify` | false |
| Echo of Atlas question | `echo_or_noop` | `clarify_once` | false |
| “I prefer at 6” | `scheduling_counteroffer` | `check_availability` → alternatives/escalate | false |
| “What about 6:30?” / “6?” | `scheduling_counteroffer` | acknowledge + do **not** repeat same menu | false |
| “Ok” after explicit 5:15 confirm ask | `schedule_confirm` | `create_appointment` (if agent ok) | true |
| Post-confirm “What about 6?” | `reschedule_request` | `offer_reschedule_flow` | false |

---

## Non-goals

- Replacing BR-075
- Browser Supabase clients
- Tenant JWT RLS redesign
- Storage policy work
- Live WhatsApp during replay tests
