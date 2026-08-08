# BR-112 — Live Execution Path Cutover Capability

Makes the authoritative live Conversation Engine **capable** of requesting Recruit AI v2 execution for confirmed appointment creation.  
Does **not** enable the canary. BR-111 remains final mutation authority.

## Live invocation path

```
WhatsApp inbound
  → whatsappInboundPipeline
  → communicationHub.processConversationAfterInbound
  → semanticConversationEngine (authoritative)
  → completeInterview (confirmed slot)
       → liveExecutionBridge.attemptLiveV2AppointmentExecution
            allowExecution = (LIVE_PATH_ENABLED && source==live_ce)
            → processRecruitAiV2Turn({ allowExecution })
                 → SideEffectAuthorizer (BR-111)
                 → sideEffectExecutor → executeScheduleInterview (BR-050)
       → on v2 success: use mission result
       → else: existing CE executeScheduleInterview fall-through
  → buildPersistedAppointmentConfirmation (single WhatsApp confirmation)
  → outbound pipeline
  → post-live advisory (shadow/capture; allowExecution:false)
```

## How `allowExecution` is derived

| Caller | `allowExecution` |
|---|---|
| Live CE bridge + `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=true` | `true` |
| Live CE bridge + flag absent/false/malformed | `false` (not invoked) |
| Shadow evaluation | forced `false` |
| Advisory / context capture | never set `true` |
| Unit/playground callers | only if they explicitly pass it (tests) |

`allowExecution=true` is **not** permission. BR-111 still requires execution flag + org + user + profileConfigured + supported confirmed create.

## Dual fail-closed gates

1. **BR-112 live path flag** — may the live CE *request* execution?
2. **BR-111 authorizer** — may mutation *occur*?

Either gate closed → zero v2 mutations.

## Non-goals / safety

- No Railway variable changes in this PR
- No production writes from this PR
- No second WhatsApp send path from v2
- No role-based permission
- No hard-coded canary UUIDs in authorization logic
- Non-canary users: live path off → CE unchanged

## Future canary env (DO NOT SET YET)

```text
RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=true
RECRUIT_AI_V2_EXECUTION_ENABLED=true
RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS=00000000-0000-4000-8000-000000000001
RECRUIT_AI_V2_EXECUTION_USER_IDS=33ad243a-9d00-4a4d-810b-df2762c0f076
```
