# Atlas Current State

## AI Summary

Atlas Core Platform v1.0 Release Candidate 1 is **certified** (2026-07-24). Sprint 16 begins Phase 2 — Production Recruiting Automation for Team Vision Operations.

## Current Sprint

Sprint 16 — Production Recruiting Automation

## Product Stage

Phase 2 — Team Vision Operations

## Overall Status

🟢 Atlas RC1 Certified

## Current Objective

Build the first fully automated recruiting workflow:

```
Facebook Lead
→ Atlas
→ WhatsApp Conversation
→ Qualification
→ Interview Scheduling
→ Mission Control
→ Executive Dashboard
```

**Goal:** First interview scheduled without human intervention.

## Working

- **Atlas RC1 certification** — seed, verify, and replay pipeline pass (`verifyRC1.js`)
- **Atlas Core migrations** — 002–007 applied; Ana + Niovel seeded in `atlas_users`
- **RC1 environment tooling** — `backend/dev/environment/` (reset, seed, replay, verify, certify)
- **Prospect Engine + Business Events** — assignments, timeline summaries, projection replay
- **Mission Control projection** — operational metrics from Business Events
- **Executive Dashboard projection** — funnel, conversion, trends, KPIs
- **Shared UI kit** — skeletons, toasts, empty/error states, confirm dialog
- **Prospect Workspace feature** — composition layer over read models + Prospect Engine
- **Engine unit verification** — all core verify scripts pass

## In Progress

- **Sprint 16** — Facebook Lead → WhatsApp → qualification → interview scheduling automation
- **BR-075** — WhatsApp outbound customer-care window + approved-template gate (production safety); outside-window messaging requires operational Meta template configuration

## Architecture freeze (v1.0)

- Prospect Engine — bug fixes only
- Business Event Engine — bug fixes only
- Projection Framework — bug fixes only
- Timeline Engine — bug fixes only
- Mission Control — bug fixes only
- Executive Dashboard — bug fixes only

## Architecture baseline — RC2 / RC3 Financial Intelligence

| Field | Value |
|-------|--------|
| **RC2 – Financial Intelligence Architecture** | **APPROVED** |
| **RC3 Phase A – Invest-the-Difference foundation** | **IMPLEMENTED** |
| **RC3 Phase B – Runtime integration** | **IMPLEMENTED** |
| **RC3 production acceptance** | **APPROVED WITH MINOR LIMITATIONS** (2026-08-04) |
| Canonical doc | [08-financial-intelligence/FINANCIAL_INTELLIGENCE_ARCHITECTURE.md](./08-financial-intelligence/FINANCIAL_INTELLIGENCE_ARCHITECTURE.md) |
| Acceptance | [RC3_PRODUCTION_ACCEPTANCE.md](./08-financial-intelligence/RC3_PRODUCTION_ACCEPTANCE.md) |
| Release notes | [RC3_FINANCIAL_INTELLIGENCE_RELEASE_NOTES.md](./09-releases/RC3_FINANCIAL_INTELLIGENCE_RELEASE_NOTES.md) |
| Runtime module | `backend/modules/financial-intelligence/` · `/api/financial-intelligence` |
| Governance | BR-062–BR-065, **BR-066**, BR-067–BR-073 |
| Freeze | Recruit OS · Policy Intelligence (frozen) · Knowledge Center — extend, do not redesign PI |
| Deferred (RC4+) | Official Primerica quote · verified fund catalog · native PDF · automated eligibility · suitability |

## Recent Decisions

- **2026-09-01:** **BR-207** — Authenticated sidebar groups operational pages (Pipeline, People & Outcomes, Intelligence, Growth) without changing routes or permissions. Recruits is reserved until a dedicated page exists.
- **2026-09-01:** **BR-206** — Manual Agenda recovery uses client/recruit/production evidence. Recruiter credit is explicit (not appointment owner). Dual RECRUITED + CLIENT is allowed. No silent prospect create. Production splits cannot exceed policy premium.
- **2026-09-01:** **BR-204** — Recorded appointment/interview outcomes are canonical across Appointments, Today’s Agenda, Prospect Workspace, Follow Up, and dashboard pending counts. FOLLOW_UP_NEEDED completes the appointment.
- **2026-09-01:** **BR-203** — Native WhatsApp Business app HUMAN/AGENT echoes persist for contact-only conversations so delivery lifecycle can attach. No prospect create and no eligibility mutation.
- **2026-09-01:** **BR-201** — Connection-only `META_AD_DESTINATION` is not operational lead provenance. Lists require inbound-specific CTWA / QR / campaign / explicit create. No row delete or owner rewrite.
- **2026-08-31:** **BR-193** — Meta Ad Destination fallback: unknown inbound without CTWA metadata may promote only on a CONNECTED WhatsApp connection explicitly marked for Meta ad automation. Default OFF. Greeting / `from_user_id` are not proof.
- **2026-08-31:** **BR-192** — Terminal prospect close (Not Interested / Disqualified / DNC) cancels OPEN follow-ups in domain logic. History kept. No UI-only hide.
- **2026-08-31:** **BR-189** — Policy Review dashboard lives on `/app/policy-reviews` (Dashboard | Pipeline). Reuses BR-186/188; no new sidebar item; spend/CPL/ROAS stay null.
- **2026-08-13:** **Conversations unread + latest-message-first** — Unread is prospect inbound WhatsApp vs `conversationsLastReadInboundAt` (not BR-080 / NEEDS_ATTENTION). List sorts by `lastCommunicationAt` from real WhatsApp. Open thread anchors above sticky composer; poll ~12s; scrolled-up live inbound shows “New message ↓”.
- **2026-08-13:** **BR-131 first-turn resume guard** — Brand-new info asks (e.g. “Hello! Can I get more info on this?”) must use canonical overview + city/state, not `clarify_once`. Resume/`clarify_once` requires conversation evidence (`lastAtlasOutboundText` / V2 ask-key), not `current_step` / missingFields.
- **2026-08-13:** **Conversations status badge** — Third header badge is allowlisted lifecycle/status only. `current_step` qualification tokens (e.g. `DAY_PART`) must not leak. `appointment_status` is no longer silently substituted with `current_step`.
- **2026-08-13:** **BR-080 ≠ BR-034** — Attention must not trigger stall clearance or false Conversations HUMAN. Durable stall = `stalledAt`/`stallEpisodeKey`. Read paths (MC/dashboard/queue) do not persist ownership. HUMAN requires sticky seal (`manualAgentOwnership` + `humanTakenOverAt`).
- **2026-08-13:** **BR-139** — Canonical `INTERVIEW_READY` outranks stale QUAL_CAPTURE / brain gaps on Mission Control (Schedule Interview, no Complete Qualification contradiction). Read-time only; no QUAL_CAPTURE backfill.
- **2026-08-12:** **BR-138** — WhatsApp inbound provider-message atomic claim (partial unique on `whatsapp:inbound:{wamid}` only; claim before locate/log/hub). Phase 3 QR first-turn still paused.
- **2026-08-04:** **RC3 production APPROVED WITH MINOR LIMITATIONS** — migration 025 live; deploy `4e49e6f` (+ print fix `355abec`); live formula/projection/print acceptance; see `RC3_PRODUCTION_ACCEPTANCE.md`
- **2026-08-04:** Meta Review locker scoped to `meta_review_user` sessions (`5159e8e`); FI print layout fix (`b776305`)
- **2026-08-04:** **RC3 Phase B IMPLEMENTED** — Live API-backed FI Discussion scenarios tab; frontend calc duplication removed; migration 025 verification
- **2026-08-04:** **RC3 Phase A IMPLEMENTED** — Invest-the-Difference Strategy Evaluation foundation (FI module, APIs, UI, BR-062–073)
- **2026-08-03:** **RC2 APPROVED** — Financial Intelligence Architecture finalized; BR-066 Human Recommendation Boundary
- **2026-08-03:** Sprint RC2 — Financial Intelligence architecture documented (above PI; no code)
- **2026-08-03:** Policy Intelligence Sprint 6 — Executive Review PX (presentation only; architecture frozen)
- **2026-08-03:** Policy Intelligence Sprint 5 — Comparison Engine (BR-061) + Comparison Workspace
- **2026-08-03:** Policy Intelligence Sprint 4A — Annual Values Engine (BR-060); F&G fixture timeline + metrics
- **2026-08-03:** Policy Intelligence Sprint 3 — deterministic Rule Engine (BR-059), PI-001…PI-010 on frozen pipeline
- **2026-07-24:** Atlas RC1 certified — `ATLAS RC1 CERTIFIED` from `verifyRC1.js`
- **2026-07-24:** Timeline `prospect_created` summary defaults to "Lead created" via EventFactory
- **2026-07-24:** Sprint 16 starts Phase 2 — Production Recruiting Automation

## Recently Updated Documents

| Document | Path |
|----------|------|
| RC2 Financial Intelligence (APPROVED) | [08-financial-intelligence/FINANCIAL_INTELLIGENCE_ARCHITECTURE.md](./08-financial-intelligence/FINANCIAL_INTELLIGENCE_ARCHITECTURE.md) |
| BR-066 Human Recommendation Boundary | [06-business/BUSINESS_RULES.md](./06-business/BUSINESS_RULES.md) |
| Sprint RC2 record | [09-releases/sprints/SPRINT_RC2_FINANCIAL_INTELLIGENCE_ARCHITECTURE.md](./09-releases/sprints/SPRINT_RC2_FINANCIAL_INTELLIGENCE_ARCHITECTURE.md) |
| Sprint 5 Comparison | [09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_COMPARISON.md](./09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_COMPARISON.md) |
| Sprint 4A Annual Values | [09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_ANNUAL_VALUES.md](./09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_ANNUAL_VALUES.md) |
| Sprint 3 Rule Engine | [09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_RULE_ENGINE.md](./09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_RULE_ENGINE.md) |
| RC1 Certification | [10-release-candidate/RC1_CERTIFICATION.md](./10-release-candidate/RC1_CERTIFICATION.md) |
| Sprint 16 Plan | [00-executive/Sprint_16.md](./00-executive/Sprint_16.md) |
| Environment tooling | [backend/dev/environment/](../backend/dev/environment/) |

## Environment Status

### Development

| Component | Status |
|-----------|--------|
| Database | 🟢 Connected |
| Atlas Core | 🟢 Certified |
| Business Events | 🟢 Running |
| Mission Control | 🟢 Running |
| Executive Dashboard | 🟢 Running |
| Projection Replay | 🟢 Healthy |
| Engine unit verifies | ✅ All pass |
| RC1 seed/verify | ✅ Certified |

## Last Updated

2026-08-13
