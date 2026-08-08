# BR-114 — Live Conversation Authoring Cutover (One-User Canary)

Makes the authoritative WhatsApp hub **capable** of letting Recruit AI v2 author
customer-facing replies for exactly one allowlisted org + RVP.

Does **not** enable production authoring. BR-111 execution remains independent and OFF.

## Root cause addressed

BR-112 attached v2 too late (`completeInterview`). Legacy CE therefore:

- interpreted scheduling intent
- selected Mon–Fri-only days via `buildOfferedTimes` / `isBusinessDay`
- rendered robotic numbered WhatsApp copy
- only then invoked v2 with an isolated late message (e.g. email)

That produced BR-113 `LEGACY_FALLBACK` and ignored configured Sunday/evening availability.

## Old live path

```
WhatsApp inbound
  → whatsappInboundPipeline (persist + prospect)
  → communicationHub
  → semanticConversationEngine (authors reply)
  → sendAndPersistWhatsAppMessage
  → (later) completeInterview → BR-112 execution bridge only
```

## New canary path

```
WhatsApp inbound
  → whatsappInboundPipeline (persist + prospect + owner/RVP)
  → communicationHub.processNormalizedInboundMessage
       → if LIVE AUTHORING eligible (org + user + flag):
            liveAuthoringBridge.attemptLiveV2Authoring
              → durable context load/reconstruct
              → processRecruitAiV2Turn (actual inbound text)
                   → schedulingAvailabilityReader → getSlots (Sprint 22)
                   → decision + responseRenderer
              → on safe rendered text: hub sends ONCE via sendAndPersistWhatsAppMessage
              → SKIP legacy handleIncomingMessage
       → else / technical failure:
            legacy semanticConversationEngine once
  → post-live advisory (shadow/capture; never authors)
```

## Interception point

`backend/core/communicationHub.js` → `processNormalizedInboundMessage`  
**before** `conversationEngine.handleIncomingMessage`.

## Authoring gate (fail-closed)

| Env | Role |
|---|---|
| `RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED` | Master flag (exact `"true"`) |
| `RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS` | Exact org allowlist |
| `RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS` | Exact `atlas_users.id` allowlist |
| `RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS` | Optional timeout (default 8000) |

Independent of:

- `RECRUIT_AI_V2_EXECUTION_ENABLED` (BR-111)
- `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED` (BR-112)

Intended first validation:

```text
LIVE_AUTHORING=ON
EXECUTION=OFF
LIVE_EXECUTION_PATH=OFF
```

## Durable context

Bridge uses `buildReconstructionInput` + `createContextPersistenceService`
(`recruit_ai_conversation_contexts`) with `persistContext: true` so email/name
turns continue the same appointment flow.

## Availability + timezone

v2 uses existing `schedulingAvailabilityReader` →
`appointmentApplicationService.getSlots` →
`appointmentSchedulingEngine` → RVP `appointmentProfile`.

Wall-clock → UTC uses the PR #75 canonical fix (`buildIsoTimestamp` →
`zonedTimeToUtcMs` in the profile IANA timezone). BR-114 does **not** add a
parallel timezone converter.

Does **not** use legacy `buildOfferedTimes` / Mon–Fri-only CE day offering.
Org Mon–Fri 09:00–17:00 must not truncate personal Mon–Sat evenings or Sunday
13:00–21:00.

## Exactly one outbound

1. Successful authoring → hub sends via existing outbound pipeline
2. Legacy CE is not called for that turn
3. Bridge never sends WhatsApp itself
4. Shadow/advisory never author live replies

## Fallback semantics

| Outcome | Behavior |
|---|---|
| Valid v2 reply (incl. `clarify_once`) | Send v2; skip CE |
| Empty / diagnostic-blocked text | Fall through to legacy CE once |
| Throw / timeout | Fall through to legacy CE once |
| Ineligible org/user/flag | Legacy CE unchanged |

A valid `clarify_once` is **not** a failure.

## Future canary env (DO NOT SET YET)

```text
RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED=true
RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS=00000000-0000-4000-8000-000000000001
RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS=33ad243a-9d00-4a4d-810b-df2762c0f076
# keep execution OFF until authoring validated
RECRUIT_AI_V2_EXECUTION_ENABLED=false
RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=false
```

## Tests

`backend/test/recruitAiV2LiveAuthoringBr114.test.js`
