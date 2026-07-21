# Atlas AI Changelog

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0600 |
| **Title** | Atlas AI Changelog |
| **Version** | 1.3 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 Phase A |
| **Related Release** | Release-11.4-A (production) |

> **Status values:** Draft · Review · Approved

---

## Related documents

| Document ID | Document | Description |
|-------------|----------|-------------|
| DOC-0001 | [Current_System_State.md](../00-executive/Current_System_State.md) | Production state reference |
| DOC-0002 | [Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md) | Meta Business Verification portfolio |
| DOC-0512 | [Sprint-11.4-Implementation-Plan.md](../05-sprints/Sprint-11.4-Implementation-Plan.md) | Sprint 11.4 engineering blueprint |
| — | [Roadmap.md](../00-executive/Roadmap.md) | Planned releases and milestones |

---

## Release 11.4-B — WhatsApp credentials + MVP readiness probe

| Field | Value |
|-------|-------|
| **Release** | 11.4-B |
| **Status** | Deployed to `main` |
| **Date** | 2026-07-21 |

Production outbound WhatsApp now prefers Embedded Signup stored credentials with env fallback. Added `/health/production` MVP readiness endpoint.

### Changes

- `whatsappSendCredentials.js` — Embedded Signup token + phone_number_id, env fallback
- `whatsappOutboundPipeline.js` — dynamic credentials, unified Graph API version
- `productionReadiness.js` + `GET /health/production` — Supabase, webhook, WhatsApp send, Google Calendar checks
- `calendarService` — `cancelInterview` deletes Google Calendar events when configured
- Verification: `node backend/dev/verifyProductionPipeline.js`

---

## Release 11.4-A — Production WhatsApp AI Pipeline (main)

| Field | Value |
|-------|-------|
| **Release** | 11.4-A |
| **Status** | Deployed to `main` |
| **Date** | 2026-07-21 |

Merged Sprint 11.4 Phase A onto production branch. Live WhatsApp webhooks now invoke the Conversation Engine and deliver automated replies via the Communication Hub.

### Production changes

- `communicationHub.js` — transport layer between engines and WhatsApp outbound
- `whatsappInboundPipeline.js` — post-persist AI invocation
- `channelMessage.js` — normalized message envelope
- Business-rules gate (BR-034) before automated outbound
- Verification: `node backend/dev/verifySprint11_4.js`
- `.env.example` — Google Calendar variables documented

### Launch blockers remaining

- Google Calendar `GOOGLE_*` credentials on Railway
- End-to-end live smoke test (Ad → WhatsApp → Calendar → Interview)

---

## Sprint 11.4 — Phase A Completed

| Field | Value |
|-------|-------|
| **Sprint** | 11.4 (Phase A) |
| **Status** | Complete |
| **Date** | 2026-07-21 |

Atlas now processes production WhatsApp conversations through a channel-agnostic **Communication Hub** and **AI Conversation Engine**, establishing the core architecture for future multi-channel communications.

### Highlights

- Production WhatsApp inbound pipeline wired to Conversation Engine
- Channel-agnostic normalized message envelope (`channelMessage.js`)
- Communication Hub transport layer (`communicationHub.js`)
- Automated replies delivered via WhatsApp outbound pipeline
- Business-rules gate before automated outbound (human ownership, workflow gate, closed prospects)
- Simulator and dev routes unified through Communication Hub
- Verification: `backend/dev/verifySprint11_4.js`

### Production flow

```
Meta Webhook → whatsappInboundPipeline → Communication Hub
  → Conversation Engine → Business Rules → whatsappOutboundPipeline
```

### Remaining (Sprint 11.4 Phases B–F)

- Full Communication Hub adapter interface
- WhatsApp UI integration (Mission Control / Prospect Workspace)
- Google Calendar integration
- Prospect Memory persistence
- Executive Intelligence hooks

See [Sprint-11.4-Implementation-Plan.md](../05-sprints/Sprint-11.4-Implementation-Plan.md) (DOC-0512).

---

## Documentation Foundation Completed

| Field | Value |
|-------|-------|
| **Milestone** | Documentation Foundation |
| **Status** | Complete |
| **Date** | 2026-07-20 |

### Highlights

- Executive documentation established (`00-executive/`)
- Architecture documentation established (`02-architecture/`)
- Meta approval package completed (`04-meta/` — DOC-0002 Approved)
- Sprint documentation established (`05-sprints/`)
- Release documentation established (`06-releases/`)
- GitHub confirmed as Atlas project memory (source of truth for docs, code, and sprint history)

### Documentation deliverables

| Area | Key documents |
|------|---------------|
| Executive | DOC-0001 Current System State (Approved) |
| Meta package | DOC-0002 Portfolio (Approved), DOC-0003 Privacy, DOC-0004 Q&A |
| Architecture | DOC-0010 Communication Hub |
| Sprint 11.4 | DOC-0511 Specification, DOC-0512 Implementation Plan |
| Releases | DOC-0600 Changelog |

> **Policy:** Documentation is frozen except for normal sprint updates, release notes, and ADRs.

---

## Sprint 11.3.1

| Field | Value |
|-------|-------|
| **Release** | Release-11.3.1 |
| **Release status** | Production |
| **Related sprint** | 11.3.1 |

### Highlights

- Public website launched
- Authentication completed
- Executive Dashboard completed
- Mission Control completed
- Prospect Center completed
- Prospect Workspace completed
- Quick Capture completed
- Contact Form integrated with Resend
- Railway backend deployed
- Vercel frontend deployed

### Documentation

- **DOC-0001** — [Current System State](../00-executive/Current_System_State.md) — Approved
- **DOC-0002** — [Meta Approval Portfolio](../04-meta/Meta_Approval_Portfolio.md) — Approved
- **DOC-0003** — [Privacy and Data Handling](../04-meta/Privacy_and_Data_Handling.md) — Draft
- **DOC-0004** — [Meta Review Q&A](../04-meta/Meta_Review_QA.md) — Draft

### Next sprint

| Sprint | Objective |
|--------|-----------|
| **Sprint 11.4** | AI Conversation Engine |

See [Sprint-11.4.md](../05-sprints/Sprint-11.4.md), [Sprint-11.4-Implementation-Plan.md](../05-sprints/Sprint-11.4-Implementation-Plan.md), and [Communication_Hub.md](../02-architecture/Communication_Hub.md) for planning detail.

---

## Document revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.2 | 2026-07-21 | Atlas Development Team | Sprint 11.4 Phase A — live Conversation Engine + Communication Hub wiring |
| 1.1 | 2026-07-20 | Atlas Development Team | Documentation Foundation milestone; Sprint 11.4 implementation plan indexed |
| 1.0 | 2026-07-20 | Atlas Development Team | Initial changelog — Sprint 11.3.1 production release |
