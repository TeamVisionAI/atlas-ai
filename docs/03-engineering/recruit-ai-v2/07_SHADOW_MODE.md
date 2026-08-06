# Recruit AI v2 — Production Shadow Mode (Phase 3)

**Rule:** BR-081  
**Status:** Capability deployed behind flags (default **off / inactive**). **Live CE cutover is not authorized.**

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
       → eligibility (enabled / non-empty org allowlist / sample rate)
       → processRecruitAiV2Turn (side effects denied, bounded timeout)
       → optional durable context persist
       → write recruit_ai_v2_shadow_evaluations
```

Shadow failures are logged sanitized and never interrupt the live turn.

## Feature flags

Defaults (production must remain here until explicit activation approval):

```json
{
  "enabled": false,
  "organizationIds": [],
  "sampleRate": 0
}
```

| Variable | Purpose |
|---|---|
| `RECRUIT_AI_V2_SHADOW_ENABLED` | Master switch (`false` by default) |
| `RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS` | **Required** org allowlist when enabling. Empty = **no orgs eligible** |
| `RECRUIT_AI_V2_SHADOW_SAMPLE_RATE` | `0..1` fraction or `0..100` percentage (`0` = no execution) |
| `RECRUIT_AI_V2_SHADOW_TIMEOUT_MS` | Bounded evaluation timeout (default `5000`, max `15000`) |
| `RECRUIT_AI_V2_SHADOW_CONFIG` | Optional JSON override |
| `RECRUIT_AI_V2_SHADOW` | Legacy alias for enabled only |

Fail-closed:

- missing config → disabled
- malformed JSON / malformed enabled flag → disabled
- empty allowlist → no organizations eligible
- sampleRate `0` → no shadow execution
- Meta Review scopes are excluded

`RECRUIT_AI_V2_EXECUTION_ENABLED` must remain unset/false. SideEffectAuthorizer stays deny-all.

## Performance

| Behavior | Value |
|---|---|
| Scheduling | `setImmediate` after live CE + BR-080 |
| Retries | **0** (single attempt; no retry storm) |
| Timeout | default **5000ms** (`RECRUIT_AI_V2_SHADOW_TIMEOUT_MS`) |
| Live path | never awaits shadow evaluation |

## Divergence taxonomy

- `exact_or_equivalent`
- `language_mismatch`
- `intent_mismatch`
- `time_counteroffer_missed_by_live`
- `time_counteroffer_missed_by_v2`
- `confirmation_duplicate_risk`
- `reschedule_missed`
- `appointment_state_mismatch`
- `unsafe_side_effect_difference`
- `diagnostic_leak_live`
- `diagnostic_leak_v2`
- `human_escalation_difference`
- `unsupported_for_comparison`
- `shadow_error`

## Ledger fields

Table: `recruit_ai_v2_shadow_evaluations` (migration 032)

Columns + sanitized `metadata` include organization, prospect, inbound message id, live intent, v2 intent/decision/confidence, live/v2 side-effect categories, language agreement, appointment-state agreement, divergence, diagnostic leak flags, escalation recommendation, evaluation status, safe error code, timestamp.

Never store: raw provider payloads, phone numbers, hidden reasoning, credentials, access tokens, stack traces.

## Activation stages (future — not authorized now)

1. **Deploy capability (this phase)** — code present, flags off.
2. **Controlled org allowlist** — enable for one org + low sample rate after explicit approval.
3. **Raise sample rate** — still advisory only.
4. **Cutover sprint** — separate authorization; not shadow mode.

## Rollback procedure

1. Set `RECRUIT_AI_V2_SHADOW_ENABLED=false` (or unset) on Railway.
2. Clear `RECRUIT_AI_V2_SHADOW_ORGANIZATION_IDS` and set `RECRUIT_AI_V2_SHADOW_SAMPLE_RATE=0`.
3. Redeploy/restart if needed; live CE path is unchanged by shadow code.
4. Shadow ledger rows are additive history only; do not delete unless explicitly authorized.

No Railway shadow variables should be changed during the disabled deploy.

## Invocation point

`backend/core/whatsappInboundPipeline.js` after live CE + BR-080, via `scheduleRecruitAiV2ShadowEvaluation`.

## Explicitly not authorized

- Production flag values (`enabled=true`)
- Team Vision allowlist / sample rate > 0
- Live CE cutover
- WhatsApp / appointment / BR-080 writes from v2
- Ad connection / template activation
