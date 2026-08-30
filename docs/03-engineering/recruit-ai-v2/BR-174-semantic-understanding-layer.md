# BR-174 — Semantic Understanding Layer (foundation)

## Current path (unchanged)

`communicationHub` → `liveAuthoringBridge` → `orchestrator` → regex `interpreter` → `decisionEngine` → `contextTurnUpdate` / `contextPersistenceService` → `responseRenderer`

V2 interpretation does **not** call a chat LLM today. OpenAI in production is `gpt-transcribe` for WhatsApp audio (BR-141) and a separate Communication Gateway `gpt-4o-mini` helper that is not on the V2 authoring path.

## Foundation added

- Internal schema: `SemanticInterpretation`
- Provider router + OpenAI JSON adapter
- Shadow observation hook in `processRecruitAiV2Turn`
- Flags default **off**; `applyEnabled` is hard-false

## Flags

| Env | Default | Effect |
|---|---|---|
| `RECRUIT_AI_V2_SEMANTIC_SHADOW_ENABLED` | false | Observe + compare only |
| `RECRUIT_AI_V2_SEMANTIC_CANARY_ENABLED` | false | Reserved; does not apply |
| `RECRUIT_AI_V2_SEMANTIC_ORGANIZATION_IDS` | empty | Optional shadow allowlist |
| `RECRUIT_AI_V2_SEMANTIC_USER_IDS` | empty | Optional shadow allowlist |
| `RECRUIT_AI_V2_SEMANTIC_PROVIDER` | openai | Router key |
| `RECRUIT_AI_V2_SEMANTIC_MODEL` | gpt-4o-mini | Fast/low-cost extractor |
| `RECRUIT_AI_V2_SEMANTIC_TIMEOUT_MS` | 1500 | Fail closed to legacy |

## Cost / latency (estimate, gpt-4o-mini)

Assume ~600 input tokens and ~180 output tokens per inbound.

- ~$0.00020 per inbound
- ~$1.60 per 1,000 conversations at 8 inbound turns each
- Added latency only when shadow is on: p50 ~400–900ms, p95 ~1.2–2.5s
- Timeout → no fact mutation, legacy interpreter remains authoritative
