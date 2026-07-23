# Atlas Roadmap

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0005 |
| **Title** | Atlas AI Roadmap |
| **Version** | 2.0 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-23 |
| **Related Release** | Documentation Foundation v1.0 |

**Related:** [Current_System_State.md](./Current_System_State.md) · [RELEASE_HISTORY.md](../09-releases/RELEASE_HISTORY.md) · [ATLAS_PLATFORM_V1.md](../02-architecture/ATLAS_PLATFORM_V1.md) · [Product_Vision.md](../01-product/Product_Vision.md)

---

## Purpose

Single roadmap for **production delivery on `main`** and **Version 1 platform reference** (archived sprint-7 track). For exact production behavior today, see [Current_System_State.md](./Current_System_State.md).

---

## Release numbering strategy

| Series | Meaning | Example |
|--------|---------|---------|
| **Sprint X.Y** | Team Vision production sprints on `main` | Sprint 11.4 — Conversation Engine |
| **Release-11.x** | Production deployment milestones | Release-11.4-A |
| **Journey #N** | V1 platform increments (`sprint-7-engine-integration`) | Journey #6 — Gateway |
| **Release 1.N** | V1 product releases (packages, admin, intelligence) | Release 1.4 — Mission Control |
| **v1.N.0 tags** | Git tags for V1 product releases | `v1.4.0` |
| **Version 2** | Next major platform generation | TBD |

---

## Production track (`main`) — completed

| Release | Sprint(s) | Summary |
|---------|-----------|---------|
| Release-11.3.1 | 11.3.1 | Production API client; Vercel → Railway integration |
| Release-11.3 | 11.3 | Public Team Vision website; contact form; legal pages |
| Release-11.1 | 11.1 | Live WhatsApp webhook pipeline |
| Release-10.x | 10.1–10.3 | Quick Capture, Prospect Workspace, Prospect Center |
| Release-6.x | 6–6.1 | Meta WhatsApp Embedded Signup |

**Sprint 11.4 Phase A:** ✅ Deployed — WhatsApp → Communication Hub → Conversation Engine. See [Sprint-11.4.md](../09-releases/sprints/Sprint-11.4.md).

---

## Production track — current & next

| Field | Value |
|-------|-------|
| **Current baseline** | Release-11.4-A on Railway + Vercel |
| **Strategic pivot** | WhatsApp Cloud API deferred; MVP → **Messenger + Instagram** ([investigation](../08-operations/sprint-11.4-whatsapp-investigation.md)) |
| **Next (launch-critical)** | Messenger + Instagram connectors; Google Calendar production config; end-to-end smoke test |
| **Planned architecture** | [Atlas Communication Platform](../02-architecture/atlas-communication-platform.md) (Sprint 12) |

---

## Version 1 platform track (archived reference)

> Documents under [09-releases/archive/v1-platform/](../09-releases/archive/v1-platform/) and [01-product/archive/v1-platform/](../01-product/archive/v1-platform/) describe the **V1 platform branch** (`sprint-7-engine-integration`). Code for Journeys and Release 1.x is not on `main` today.

### Atlas Core v1.0 (LOCKED)

| Journey | Capability | Verify |
|---------|------------|--------|
| #1 | Onboarding, auth, organization setup | `verifyJourney1.js` |
| #2 | Appointment booking, confirmation | `verifyJourney2.js` |
| #3 | Meeting lifecycle, calendar, Zoom | `verifyJourney3.js` |
| #4 | Agent architecture (design) | [ATLAS_AGENT_ARCHITECTURE.md](../02-architecture/ATLAS_AGENT_ARCHITECTURE.md) |
| #5 Inc 1–4 | Agent, workflow intelligence, tools, runtime | `verifyJourney5Increment*.js` |
| #6 | Unified Communication Gateway | `verifyJourney6.js` |
| #7 | Production Connectors | `verifyJourney7.js` |

### Release 1.1–1.4 (LOCKED on V1 branch)

| Release | Docs |
|---------|------|
| 1.1 Team Vision Recruiting Pack | [RELEASE_1_1.md](../09-releases/archive/v1-platform/RELEASE_1_1.md) |
| 1.2 Organization Console | [RELEASE_1_2.md](../09-releases/archive/v1-platform/RELEASE_1_2.md) |
| 1.3 Daily Brief | [RELEASE_1_3.md](../09-releases/archive/v1-platform/RELEASE_1_3.md) |
| 1.4 Mission Control | [RELEASE_1_4.md](../09-releases/archive/v1-platform/RELEASE_1_4.md) |

**Version 1 Freeze:** Architecture, vision, RFCs frozen. See [RELEASE_HISTORY.md](../09-releases/RELEASE_HISTORY.md).

---

## Future (planned)

| Theme | Description |
|-------|-------------|
| Multichannel MVP | Messenger + Instagram DM connectors |
| Reusable UI component library | Shared Atlas form and dialog primitives |
| Formal user authentication | Full Atlas login beyond bootstrap token |
| Supabase workflow persistence | Replace file-based workflow state on Railway |
| i18n polish | Remaining backend-generated copy localization |

See [BACKLOG.md](../01-product/BACKLOG.md) for detail.

---

## Phase 2 — Operator experience (V1 platform vision)

| Initiative | Description |
|------------|-------------|
| Mission Control UI | Web dashboard consuming Release 1.4 API |
| Executive Dashboard UI | Morning brief + agency pulse |
| Organization Console UI | Admin interface for Release 1.2 |
| WebSocket layer | Real-time Mission Control push |

---

## Phase 3 — Ecosystem

Marketplace · Package SDK · Connector marketplace · SSO · Audit & compliance suite

Packages follow [RFC-005](../10-rfcs/RFC-005-package-manifest.md).

---

## Document maintenance

Update this roadmap when releases ship or priorities change. Completed items are recorded in [CHANGELOG.md](../09-releases/CHANGELOG.md) and [RELEASE_HISTORY.md](../09-releases/RELEASE_HISTORY.md).

**Remember: Simple Scales.**
