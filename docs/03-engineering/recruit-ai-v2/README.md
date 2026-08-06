# Recruit AI v2 — Forensic Audit & Communications Architecture

**Canonical forensic case:** TV-000028 / Juanito Garcia (Team Vision)  
**Conversation window (America/New_York):** 2026-08-05 ~20:06 – 21:36 ET  
**(UTC records):** 2026-08-06T00:06Z – 2026-08-06T01:36Z

## Documents

| Doc | Contents |
|---|---|
| [01_TV000028_FORENSIC_TIMELINE.md](./01_TV000028_FORENSIC_TIMELINE.md) | Phases 1–2 identity + chronological reconstruction; Phase 5 response grades |
| [02_COMMUNICATIONS_INVENTORY.md](./02_COMMUNICATIONS_INVENTORY.md) | Phase 3 — every communication source + source-of-truth map |
| [03_CURRENT_ARCHITECTURE_MAP.md](./03_CURRENT_ARCHITECTURE_MAP.md) | Phase 4 — inbound→outbound execution path |
| [04_RECRUIT_AI_V2_ARCHITECTURE.md](./04_RECRUIT_AI_V2_ARCHITECTURE.md) | Phase 6 — v2 engine + Communications Center design |
| [05_COMMUNICATIONS_CENTER_READ_MODEL.md](./05_COMMUNICATIONS_CENTER_READ_MODEL.md) | Communications Center MVP — `GET /api/prospects/:id/communications` |

## Regression fixture

`backend/test/fixtures/recruitAiV2/tv000028-scheduling-replay.json`  
Contract tests:
- `backend/test/recruitAiV2Tv000028ReplayContract.test.js`
- `backend/test/communicationsCenterReadModel.test.js`

## Boundaries

Do **not** change without an explicit sprint:

- Meta Review auth/session/allowlist/language lock
- BR-075 gate, WhatsApp/WABA config
- Google Calendar, appointment canonical truth
- Migrations 026–030, RLS, securities, Policy Intelligence
- Production prospect/appointment rows
- Live WhatsApp sends
- Recruit AI decision / parser / response-generation logic (until v2 cutover sprint)

## Implementation order

1. ~~Communications Center read model (unified chronological view)~~ — MVP API
2. ~~Structured conversation context + decision engine (BR-081, side effects disabled)~~ — `backend/core/recruitAiV2/`
3. ~~Durable conversation context store (Phase 2)~~ — migration `032_br081_recruit_ai_conversation_contexts.sql` + `contextPersistenceService` (simulation/shadow-ready; **not** production CE cutover)
4. Shadow-mode semantic CE wiring + divergence telemetry (explicit approval)
5. Controlled cutover behind BR-075 + authorized appointment side effects (explicit sprint)

### Phase 2 persistence notes

- Table: `recruit_ai_conversation_contexts` (unique active row per org + prospect + channel)
- Shadow ledger table present but unused: `recruit_ai_v2_shadow_evaluations`
- Backend-only RLS (deny anon/authenticated; service_role only)
- Optimistic `context_version` compare-and-set; duplicate `last_processed_message_id` is idempotent
- Persisted JSON is sanitized (no tokens, stack traces, hidden reasoning, unmasked phones)
- Customer-facing sends/booking/BR-080 writes remain denied
