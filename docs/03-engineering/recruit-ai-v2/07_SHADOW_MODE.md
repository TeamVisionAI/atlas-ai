# Recruit AI v2 — Production Shadow Mode (Phase 3)

**Rule:** BR-081  
**Status:** Implemented behind flags (default **off**). Not a production CE cutover.

## Authoritative runtime

`semanticConversationEngine` remains the only source of:

- customer-visible copy
- WhatsApp sends
- appointment proposal / confirmation / reschedule execution
- BR-080 attention writes
- workflow advancement

Recruit AI v2 is advisory and silent.

## Flow

```
inbound persisted
  → live CE decides + reply proceeds normally
  → BR-080 attention updates (unchanged)
  → scheduleRecruitAiV2ShadowEvaluation (async, non-blocking)
       → eligibility (enabled / org allowlist / sample rate)
       → processRecruitAiV2Turn (side effects denied)
       → optional durable context persist
       → write recruit_ai_v2_shadow_evaluations
```

Shadow failures are logged sanitized and never interrupt the live turn.

## Feature flags

Defaults:

```json
{
  "enabled": false,
  "organizationIds": [],
  "sampleRate": 0
}
```

Environment:

| Variable | Purpose |
|---|---|
| `RECRUIT_AI_V2_SHADOW_ENABLED` | Master switch (`false` by default) |
| `RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS` | Optional comma-separated org allowlist (empty = all orgs when enabled) |
| `RECRUIT_AI_V2_SHADOW_SAMPLE_RATE` | `0..1` fraction or `0..100` percentage |
| `RECRUIT_AI_V2_SHADOW_CONFIG` | Optional JSON override of the object above |
| `RECRUIT_AI_V2_SHADOW` | Legacy alias for enabled only |

`RECRUIT_AI_V2_EXECUTION_ENABLED` must remain unset/false. SideEffectAuthorizer stays deny-all.

## Ledger fields

Table: `recruit_ai_v2_shadow_evaluations` (migration 032)

- inbound message id
- live CE response intent
- v2 interpreted intent
- v2 decision code
- v2 confidence
- v2 proposed side effect (always denied in Phase 3)
- divergence classification
- language agreement
- diagnostic-leak check (`true` = clean)
- sanitized metadata
- timestamp

## Divergence classes

`aligned` · `intent_mismatch` · `language_mismatch` · `action_mismatch` · `live_empty_v2_active` · `v2_safe_failure` · `v2_evaluation_failed` · `diagnostic_leak`

## Invocation point

`backend/core/whatsappInboundPipeline.js` after live CE + BR-080, via `scheduleRecruitAiV2ShadowEvaluation`.

## Explicitly not enabled by this PR

- Production flag values (`enabled=true`)
- Live CE cutover
- WhatsApp / appointment / BR-080 writes from v2
- Ad connection
- Template activation
