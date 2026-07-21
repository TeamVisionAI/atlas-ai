# Sprint 11.4 — Conversation Engine & WhatsApp Business Integration

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0511 |
| **Title** | Sprint 11.4 Specification |
| **Version** | 0.1 |
| **Status** | Draft |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 |
| **Related Release** | Release-11.4 (planned) |

---

## Related documents

- [Current_System_State.md](../00-executive/Current_System_State.md)
- [Roadmap.md](../00-executive/Roadmap.md)
- [Communication_Hub.md](../02-architecture/Communication_Hub.md)
- [Sprint-11.4-Implementation-Plan.md](./Sprint-11.4-Implementation-Plan.md)
- [../deployment/sprint-11.4-meta-production.md](../deployment/sprint-11.4-meta-production.md)
- [../BUSINESS_RULES.md](../BUSINESS_RULES.md)
- [../SPRINT_11_1_LIVE_WHATSAPP.md](../SPRINT_11_1_LIVE_WHATSAPP.md)

---

## Purpose

Specify Sprint **11.4**: implement the Atlas AI **Conversation Engine** with WhatsApp Business integration and establish **Communication Hub** architecture for future multi-channel support.

> **Note:** Placeholder sprint spec. Expand with acceptance criteria, BR references, and verification script before sprint kickoff.

---

## Objective

Deliver a production-ready Conversation Engine that:

1. Orchestrates inbound/outbound WhatsApp messages through business rules
2. Persists conversation state with auditable workflow events
3. Surfaces conversations in Prospect Workspace / Mission Control
4. Documents Communication Hub boundaries for future channels

---

## Prerequisites (from Release-11.3.1)

| Prerequisite | Status |
|--------------|--------|
| Production API client (Vercel → Railway) | Done |
| Live WhatsApp webhook pipeline (11.1) | Done |
| Meta Embedded Signup | Done |
| Business Rules Engine | Done |
| Event catalog / workflow events | Done |

---

## Planned work areas

| Area | Description |
|------|-------------|
| Conversation Engine | Core module for thread lifecycle, routing, and reply composition |
| WhatsApp adapter | Extend existing 11.1 pipeline for engine-driven send/receive |
| Communication Hub API | Internal boundaries for channel adapters |
| UI integration | Prospect Workspace conversation panel |
| Verification | `backend/dev/verifySprint11_4.js` (planned) |

---

## Acceptance criteria (draft)

- [ ] Inbound WhatsApp message creates or updates conversation thread linked to prospect
- [ ] Outbound replies respect BR-008 and related messaging rules
- [ ] Workflow events emitted per [EVENT_CATALOG.md](../EVENT_CATALOG.md)
- [ ] Communication Hub architecture documented in [Communication_Hub.md](../02-architecture/Communication_Hub.md)
- [ ] Verification script passes in CI/local dev

---

## Out of scope (Sprint 11.4)

- Full user authentication (bootstrap token remains interim)
- Email/SMS channel implementation
- WhatsApp template admin UI
- i18n completion for all backend strings

---

## Verification

```bash
# Planned
node backend/dev/verifySprint11_4.js
```

---

## Status

| Phase | Status |
|-------|--------|
| **Phase A** — Live Conversation Engine wiring | ✅ **Complete** |
| Phase B — Communication Hub adapters | Planned |
| Phase C — WhatsApp UI | Planned |
| Phases D–F | Planned |

Phase A deliverables: production WhatsApp → Communication Hub → Conversation Engine → outbound pipeline. Verification: `node backend/dev/verifySprint11_4.js`.

---

## Meta production blocker (refined root cause)

During Meta **WhatsApp Cloud API initialization**, onboarding stopped before a test number could be claimed. **Root cause refined:** Meta **auto-selected a disabled Test WABA** instead of an approved production WABA.

| Classification | Detail |
|----------------|--------|
| **Root cause** | Disabled **Test WABA** auto-selected by Meta during Cloud API onboarding |
| **Production WABAs verified** | **Niovel Perez** — Approved → **786-752-8080**; **Ana Perez** — Approved → **786-296-7254** |
| **Meta-generated Test WABA** | **Disabled** — do not use for Cloud API onboarding |
| **Not caused by** | Atlas backend, Railway, webhook implementation, or Business Portfolio restrictions |
| **Portfolio status** | Operational — Business Home loads with Team Vision Financial profile and ad account |
| **Required before retry** | **Use cases → Step 2 (Production setup)** — not Step 1 (Testing); select Niovel Perez WABA |

**Final production decision approved (2026-07-21):** **786-752-8080** is the **dedicated Atlas AI production number**. Existing WhatsApp Business App history on **8080** does **not** need to be preserved. **Ana Perez / 786-296-7254** remains **independent** to avoid operational risk. **Authorized to proceed** with Cloud API migration on the **Niovel Perez WABA**. See [final decision](../deployment/sprint-11.4-meta-production.md#final-production-decision-approved-2026-07-21) (DOC-0701 v1.9).

**Production architecture approved (2026-07-21):** **+1 786-752-8080** (Niovel Perez WABA) is the **Atlas AI production number** — designated for WhatsApp Cloud API migration. Atlas owns this channel for automation, AI conversations, interview scheduling, and future integrations. **Ana Perez / 786-296-7254** remains **unchanged** to protect day-to-day business operations — out of scope for Atlas. See [production architecture](../deployment/sprint-11.4-meta-production.md#production-architecture-approved-2026-07-21) (DOC-0701 v1.8).

**Phone registration (2026-07-21):** **786-752-8080** registration **initiated** — **PAUSED before verification code**. Review migration warnings; capture all [confirmation screens](../deployment/sprint-11.4-meta-production.md#confirmation-screen-log-deployment-record). See [status](../deployment/sprint-11.4-meta-production.md#current-status-production-setup--registration-initiated-2026-07-21) (DOC-0701 v2.4).

**Major discovery (Meta confirmed 2026-07-21):** An existing **Approved WABA** can be associated with the **existing Atlas Developer App** through the WhatsApp use case in **Use cases**. No new Meta Developer App is required. Select **Niovel Perez** / **786-752-8080** only.

**Action:** Follow the [migration checklist](../deployment/whatsapp-cloud-api-migration-checklist.md) (DOC-0702) and [deployment checklist](../deployment/sprint-11.4-meta-production.md#deployment-checklist-before-cloud-api-onboarding) in [sprint-11.4-meta-production.md](../deployment/sprint-11.4-meta-production.md) (DOC-0701).

**WABA inventory (completed):** **Niovel Perez** → **786-752-8080**; **Ana Perez** → **786-296-7254** (both Approved). Meta-generated Test WABA is disabled. See [completed inventory](../deployment/sprint-11.4-meta-production.md#waba-inventory-completed-2026-07-21) (DOC-0701 v1.5).

**WABA migration policy:** Do **not** delete unused WABAs during migration. Inventory complete; perform cleanup only after Atlas is successfully running in the new production environment. See [WABA migration policy](../deployment/sprint-11.4-meta-production.md#waba-migration-policy-do-not-delete-during-migration).

**Pre-change gate (Meta AI guidance received):** Existing Approved WABA associable via **Use cases → WhatsApp configuration** on existing app — no new Developer App. Avoid legacy Meta docs with standalone WhatsApp product navigation. See [Use Cases UI](../deployment/sprint-11.4-meta-production.md#meta-developer-console--use-cases-ui-2026-07-21) (DOC-0701 v2.0).

---

## Live production smoke test (required before ads)

**Readiness probe:** `GET https://atlas-ai-production-01de.up.railway.app/health/production`  
When `mvpReady: true`, infrastructure is configured. Confirm with one real conversation:

1. From a personal phone, send a WhatsApp message to **+1 786-752-8080** (Atlas AI production number).
2. Confirm Atlas replies automatically within ~30 seconds.
3. Complete qualification through to interview scheduling (Google Calendar event created).
4. Verify confirmation message and calendar invite.
5. Check Railway logs for `conversation_engine_reply_sent`.

**Advisory:** Set `META_APP_SECRET` on Railway so webhook signatures are validated (currently skipped with warning).

See [Current_System_State.md](../00-executive/Current_System_State.md) for open post-launch items.

See [Sprint-11.4-Implementation-Plan.md](./Sprint-11.4-Implementation-Plan.md) and [Roadmap.md](../00-executive/Roadmap.md).
