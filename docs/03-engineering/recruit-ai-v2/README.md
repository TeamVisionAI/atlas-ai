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
| [06_DURABLE_CONTEXT_SCHEMA.md](./06_DURABLE_CONTEXT_SCHEMA.md) | Phase 2 — durable context + shadow ledger tables |
| [07_SHADOW_MODE.md](./07_SHADOW_MODE.md) | Phase 3 — production shadow evaluation |
| [08_CONTINUOUS_CONTEXT_CAPTURE.md](./08_CONTINUOUS_CONTEXT_CAPTURE.md) | Phase 3B — 100% context capture ≠ 10% shadow |
| [09_FIRST_PRODUCTION_FEEDBACK.md](./09_FIRST_PRODUCTION_FEEDBACK.md) | BR-082 — greeting/partial location/language/fragments |
| [10_WORKFLOW_SIMULATOR_SCENARIOS.md](./10_WORKFLOW_SIMULATOR_SCENARIOS.md) | Ops Center v2 scenario pack (ephemeral regression) |
| [11_CUSTOM_CONVERSATION_PLAYGROUND.md](./11_CUSTOM_CONVERSATION_PLAYGROUND.md) | Interactive custom conversation playground (ephemeral) |
| [12_PLAYGROUND_FEEDBACK_FACT_CORRECTION.md](./12_PLAYGROUND_FEEDBACK_FACT_CORRECTION.md) | Fact correction, mid-flow questions, continuity |
| [13_PLAYGROUND_FEEDBACK_LICENSE_FAQ_MEETING_MODE.md](./13_PLAYGROUND_FEEDBACK_LICENSE_FAQ_MEETING_MODE.md) | BR-083 — work auth vs license, specific FAQs, Zoom modality |
| [14_PLAYGROUND_FEEDBACK_SCHEDULING_CONSTRAINTS.md](./14_PLAYGROUND_FEEDBACK_SCHEDULING_CONSTRAINTS.md) | BR-084 — availability constraints + direct-time scheduling |
| [15_PLAYGROUND_FEEDBACK_DATE_CANCEL_MEETING_MODE.md](./15_PLAYGROUND_FEEDBACK_DATE_CANCEL_MEETING_MODE.md) | BR-085 — date-only scheduling, cancellation taxonomy, OUTSIDE in-person travel confirm |
| [16_NATURAL_LANGUAGE_OPT_OUT.md](./16_NATURAL_LANGUAGE_OPT_OUT.md) | BR-086 — natural-language communication opt-out (no more messages, etc.) |
| [17_PLAYGROUND_FEEDBACK_SCHEDULING_MEMORY.md](./17_PLAYGROUND_FEEDBACK_SCHEDULING_MEMORY.md) | BR-087 — scheduling memory across modality, Zoom-link logistics, clean withdraw |
| [18_PLAYGROUND_FEEDBACK_INTENT_PRIORITY.md](./18_PLAYGROUND_FEEDBACK_INTENT_PRIORITY.md) | BR-088 — job/opportunity FAQ, intent priority, mañana disambiguation, contextual continuation |
| [19_LICENSE_REQUIREMENT_INTENT_PRECISION.md](./19_LICENSE_REQUIREMENT_INTENT_PRECISION.md) | BR-089 — license requirement question vs ambiguous license statement |
| [20_PUERTO_RICO_FIXED_EMPLOYMENT_PREFERENCE.md](./20_PUERTO_RICO_FIXED_EMPLOYMENT_PREFERENCE.md) | BR-090 — Puerto Rico work-auth + fixed-employment preference / not-now closure |
| [21_DIRECT_NO_INTEREST_WITHDRAWAL.md](./21_DIRECT_NO_INTEREST_WITHDRAWAL.md) | BR-091 — bare “No me interesa” / direct lack-of-interest withdrawal |
| [22_CITY_STATE_ABBREVIATION_NORMALIZATION.md](./22_CITY_STATE_ABBREVIATION_NORMALIZATION.md) | BR-094 — U.S. city/state abbreviation normalization (`miami fl`) |
| [23_INPUT_NORMALIZATION.md](./23_INPUT_NORMALIZATION.md) | BR-095 — deterministic inbound input normalization (case/accent/punctuation) |
| [24_WORK_AUTH_STATUS_SHORTHAND.md](./24_WORK_AUTH_STATUS_SHORTHAND.md) | BR-096 — pending work-auth status shorthand (`residente` / `ciudadano`) |
| [25_CONCISE_JOB_FAQ_OVERVIEW.md](./25_CONCISE_JOB_FAQ_OVERVIEW.md) | BR-097 — concise first-level job FAQ + progressive disclosure |
| [26_FAQ_ROUTING_PRIORITY_EXPERIENCE_INSURANCE.md](./26_FAQ_ROUTING_PRIORITY_EXPERIENCE_INSURANCE.md) | BR-098 — experience FAQ + insurance routing priority before location |
| [27_SALES_OBJECTION_RECOGNITION.md](./27_SALES_OBJECTION_RECOGNITION.md) | BR-099 — sales skill/aversion objection ≠ location correction |
| [28_AFFIRMATIVE_PREFIX_WORK_AUTH.md](./28_AFFIRMATIVE_PREFIX_WORK_AUTH.md) | BR-100 — `si soy ciudadano` affirmative-prefix work auth |
| [29_DAY_PART_MANANA_CONTEXT_PRIORITY.md](./29_DAY_PART_MANANA_CONTEXT_PRIORITY.md) | BR-101 — ask_day_part outranks mañana=tomorrow; hour inherits day-part |
| [30_PARTIAL_STATE_AFTER_TIME.md](./30_PARTIAL_STATE_AFTER_TIME.md) | BR-102 — state-only partial location + after-5 time constraint variants |

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
3. ~~Durable conversation context store (Phase 2)~~ — migration `032` + `contextPersistenceService`
4. ~~Shadow-mode CE wiring + divergence telemetry (Phase 3)~~ — Team Vision 10% when configured; production CE remains authoritative
5. ~~Continuous context capture (Phase 3B)~~ — separate flags; **defaults off** in code; 100% capture ≠ 10% shadow
6. Controlled cutover behind BR-075 + authorized appointment side effects (explicit sprint)

### Phase 2–3B notes

- Table: `recruit_ai_conversation_contexts` (unique active row per org + prospect + channel)
- Shadow ledger: `recruit_ai_v2_shadow_evaluations` (independent sample rate; empty allowlist = no orgs)
- Continuous capture: `RECRUIT_AI_V2_CONTEXT_CAPTURE_*` (default off; empty allowlist = none)
- Post-live advisory coordinator: `scheduleRecruitAiV2PostLiveAdvisory` (exactly-once context per inbound id)
- Backend-only RLS (deny anon/authenticated; service_role only)
- Optimistic `context_version` compare-and-set; duplicate `last_processed_message_id` is idempotent
- Persisted JSON is sanitized (no tokens, stack traces, hidden reasoning, unmasked phones)
- Customer-facing sends/booking/BR-080 writes remain denied
- Production CE (`semanticConversationEngine`) is unchanged as the customer-visible authority
