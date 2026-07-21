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

## Meta production blocker (account-level)

During Meta **WhatsApp Cloud API initialization**, onboarding stopped with a **WhatsApp Business Account (WABA) restriction** before a test number could be claimed.

| Classification | Detail |
|----------------|--------|
| **Root cause** | Meta account / WABA policy restriction |
| **Not caused by** | Atlas backend, Railway, or webhook implementation |

**Action:** Verify WABA status in Meta Business Suite before retrying Cloud API setup. Full troubleshooting: [sprint-11.4-meta-production.md](../deployment/sprint-11.4-meta-production.md) (DOC-0701).

---

## Live production smoke test (required before ads)

**Readiness probe:** `GET https://atlas-ai-production-01de.up.railway.app/health/production`  
When `mvpReady: true`, infrastructure is configured. Confirm with one real conversation:

1. From a personal phone, send a WhatsApp message to the Team Vision business number.
2. Confirm Atlas replies automatically within ~30 seconds.
3. Complete qualification through to interview scheduling (Google Calendar event created).
4. Verify confirmation message and calendar invite.
5. Check Railway logs for `conversation_engine_reply_sent`.

**Advisory:** Set `META_APP_SECRET` on Railway so webhook signatures are validated (currently skipped with warning).

See [Current_System_State.md](../00-executive/Current_System_State.md) for open post-launch items.

See [Sprint-11.4-Implementation-Plan.md](./Sprint-11.4-Implementation-Plan.md) and [Roadmap.md](../00-executive/Roadmap.md).
