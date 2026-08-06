# Recruit AI v2 — Forensic Audit & Communications Architecture

**Sprint status:** Evidence and architecture only — conversation engine not rewritten.  
**Branch:** `feature/recruit-ai-v2-communications-audit`  
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

## Regression fixture

`backend/test/fixtures/recruitAiV2/tv000028-scheduling-replay.json`  
Contract test: `backend/test/recruitAiV2Tv000028ReplayContract.test.js`

## Boundaries (audit phase)

Do **not** change in this sprint:

- Meta Review auth/session/allowlist/language lock
- BR-075 gate, WhatsApp/WABA config
- Google Calendar, appointment canonical truth
- Migrations 026–030, RLS, securities, Policy Intelligence
- Production prospect/appointment rows
- Live WhatsApp sends

## Next implementation sprints (not this PR)

1. Communications Center read model (unified chronological view)
2. Durable conversation context store
3. Structured decision contract + side-effect authorization
4. Replay harness driving CE against this fixture (no live WhatsApp)
