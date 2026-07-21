# Current System State

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0001 |
| **Title** | Current System State |
| **Version** | 1.1 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 Phase A |
| **Related Release** | Release-11.4-A |

> **Status values:** Draft · Review · Approved

---

## Purpose

This document is the **single executive reference** for the current production state of Atlas AI. It exists so that leadership, product owners, and engineering can answer—without reading sprint specs or source code:

- What is deployed and operational today
- How the public website and private Atlas application are separated
- Where production services run (Vercel, Railway, Supabase, Resend)
- What is locked, in progress, or intentionally deferred
- What milestone comes next

It is updated at the close of each production-facing release. For architecture depth, business rules, and sprint implementation detail, see the [Related Documents](#related-documents) and [Documentation index](#documentation-index).

---

## Document scope

### Covered in this document

- Production deployment topology and URLs
- Technology stack summary
- Public website routes and release status
- Atlas application (`/app/*`) routes and operational status
- Core backend capabilities at a glance
- Production-critical environment variables
- Local development entry points
- Locked releases and change policy
- Known open items affecting production or near-term delivery
- Next planned milestone (Sprint 11.4)

### Intentionally excluded

- Detailed API contracts and endpoint schemas (see engineering docs)
- Business rule definitions (see [BUSINESS_RULES.md](../BUSINESS_RULES.md))
- Sprint implementation tasks and acceptance criteria (see sprint documents)
- Meta Business Verification submission copy and checklists (see [Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md))
- Conversation engine and Communication Hub design (see Sprint 11.4 documentation)
- Historical commit-by-commit changelog

---

## Related documents

| Category | Document | Description |
|----------|----------|-------------|
| Strategy | [Vision.md](./Vision.md) | Long-term product vision for Atlas AI |
| Strategy | [Roadmap.md](./Roadmap.md) | Planned releases and milestone sequence |
| Compliance | [Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md) | Meta Business Verification materials |
| Compliance | [Privacy_and_Data_Handling.md](../04-meta/Privacy_and_Data_Handling.md) | Privacy and data handling (Meta package) |
| Compliance | [Meta_Review_QA.md](../04-meta/Meta_Review_QA.md) | Meta reviewer Q&A |
| Architecture | [Communication_Hub.md](../02-architecture/Communication_Hub.md) | Multi-channel communication architecture (Sprint 11.4+) |
| Sprint | [Sprint-11.4.md](../05-sprints/Sprint-11.4.md) | Conversation Engine and WhatsApp Business integration |
| Sprint | Sprint documentation (engineering) | See [Documentation index](#documentation-index) |

---

## Executive summary

Atlas AI is a **live, multi-surface application** — not a placeholder scaffold. It combines:

1. A **public marketing website** for Team Vision Financial (`teamvisionfinancial.com`)
2. A **private Atlas recruiting platform** for agents and leadership (`/app/*`)

Both surfaces share one codebase. The frontend deploys to **Vercel**; the API deploys to **Railway**. Data persists in **Supabase**.

> **Repository snapshot**  
> **Product:** Atlas AI — Team Vision Financial  
> **Branch:** `main`  
> **Latest commit:** Sprint 11.4 Phase A — Live WhatsApp → AI pipeline + public site Meta readiness

---

## Production MVP pipeline (launch target)

```
Facebook / Instagram Ads → WhatsApp Business → Atlas AI → Qualification
  → Google Calendar → Interview Scheduled → Human Follow-up
```

| Stage | Production status |
|-------|-------------------|
| Ads → WhatsApp (Click-to-WhatsApp) | External (Meta Ads); Atlas tags `CLICK_TO_WHATSAPP` on first message |
| WhatsApp inbound | ✅ Live webhook, persist, events |
| Atlas AI qualification | ✅ **Sprint 11.4 Phase A** — webhook → Communication Hub → Conversation Engine → outbound |
| Google Calendar booking | ⚠️ Engine supports `createInterview`; requires `GOOGLE_*` on Railway; `cancelInterview` deletes Google events when configured |
| Human follow-up | 🟡 Mission Control + agent actions; reminder engine not yet built |

**Success criterion:** A real prospect completes Ad → WhatsApp → AI qualification → calendar booking → confirmation without manual intervention until the interview is scheduled.

---

## Deployment topology

| Surface | Host | URL (production) |
|---------|------|------------------|
| Public website + Atlas UI | Vercel | `https://atlas-ai-three-ruby.vercel.app` (and custom domain when configured) |
| Atlas API | Railway | `https://atlas-ai-production-01de.up.railway.app` |
| MVP readiness probe | Railway | `GET /health/production` — returns `mvp_ready` or lists blockers |
| Database | Supabase | Configured via `SUPABASE_URL` / `SUPABASE_ANON_KEY` |
| Contact email delivery | Resend | Server-side only (`RESEND_API_KEY`) |

> **API routing (Sprint 11.3.1):** All frontend services use `frontend/src/services/apiClient.js`, which calls Railway via `VITE_API_BASE_URL` (defaults to production Railway URL when unset).

---

## Technology stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite 8, React Router 7 |
| Backend | Node.js, Express 5 |
| Database | Supabase (PostgreSQL) |
| Email (contact form) | Resend |
| WhatsApp onboarding | Meta Embedded Signup |
| Auth (Atlas app) | Bootstrap token + bearer sessions (Sprint 10.1) |

> **Docker:** Not used. Vercel + Railway handle deployment.

---

## Public website (approved for release)

| Route | Purpose |
|-------|---------|
| `/` | Homepage (Hero, About, Services, Careers, Contact) |
| `/privacy` | Privacy Policy |
| `/legal` | Legal disclosures |
| `/terms` | Terms of Service |
| `/app` | Atlas Sign In → private application |

**Contact form:** Submits to `POST /api/contact` on Railway. Delivers email via Resend to `CONTACT_FORM_TO_EMAIL`.

**Navigation:** Single-page hash sections on `/` (`#about`, `#services`, `#careers`, `#contact`); legal routes at `/privacy`, `/legal`, `/terms`. Mobile hamburger menu (≤900px).

**Status:** ✅ Production-ready for Meta review (`teamvisionfinancial.com`). Vercel SPA rewrites enabled via `frontend/vercel.json`.

---

## Atlas application (private `/app/*`)

| Route | Feature | Status |
|-------|---------|--------|
| `/app` | Executive Dashboard | Operational |
| `/app/mission-control` | Mission Control queue | Operational |
| `/app/prospect-center` | Prospect Center (Sprint 10.3) | Operational |
| `/app/prospect-workspace/:phone` | Prospect Workspace (Sprint 10.2) | Operational |
| `/app/quick-capture` | Quick Capture (Sprint 10.1, LOCKED) | Operational |
| `/app/settings/whatsapp` | WhatsApp Embedded Signup | Operational (Meta config dependent) |
| `/app/conversations`, `/appointments`, etc. | Placeholder pages | UI shell only |

**Authentication:** Internal tool. Requires `ATLAS_BOOTSTRAP_TOKEN` (backend) and `VITE_ATLAS_BOOTSTRAP_TOKEN` (frontend) for session bootstrap. Not intended for public visitors.

---

## Core backend capabilities

- Recruiting / conversation engines (WhatsApp inbound pipeline + live Conversation Engine — Sprint 11.4 Phase A)
- Workflow engine with business rules (BR-001+)
- Mission Control and Executive Dashboard read models
- Prospect Workspace profile and activity feed
- Quick Capture prospect creation with duplicate detection
- Meta WhatsApp Embedded Signup onboarding
- Public contact form with validation, honeypot, and rate limiting

---

## Repository facts (corrects common misread)

| Claim | Actual state |
|-------|--------------|
| “6 placeholder files only” | **False.** ~297 tracked files; full `backend/` and `frontend/` directories |
| “No package.json” | **False.** Root and `frontend/` both have `package.json` |
| “No README” | **False.** `README.md` plus extensive `docs/` |
| “Cannot run frontend or backend” | **False.** Standard npm dev scripts work |

The repo began as six 1-byte placeholder *files* in early commits; it has since evolved through Sprints 6–11.

---

## Environment variables (production-critical)

### Railway (backend)

| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Database |
| `RESEND_API_KEY` | Contact form email |
| `CONTACT_FORM_FROM_EMAIL`, `CONTACT_FORM_TO_EMAIL` | Email routing |
| `ATLAS_BOOTSTRAP_TOKEN` | Atlas session bootstrap |
| `META_APP_ID`, `META_APP_SECRET`, etc. | WhatsApp onboarding |
| `WHATSAPP_*` | WhatsApp Cloud API |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_REFRESH_TOKEN` | Google Calendar interview booking |

### Vercel (frontend)

| Variable | Purpose |
|----------|---------|
| `VITE_API_BASE_URL` | Railway API base URL |
| `VITE_ATLAS_BOOTSTRAP_TOKEN` | Atlas auth bootstrap |
| `VITE_META_APP_ID`, `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | WhatsApp SDK (public) |

> Secrets stay server-side except explicit `VITE_*` public vars.

---

## How to run locally

```bash
# Backend (repo root)
npm install
cp .env.example .env   # configure secrets
npm run dev            # http://localhost:3000

# Frontend
cd frontend
npm install
npm run dev            # https://localhost:5173
```

For local API calls, set in `frontend/.env`:

```
VITE_API_BASE_URL=http://localhost:3000
```

See also: [docs/troubleshooting/local-development.md](../troubleshooting/local-development.md)

---

## Locked releases and change policy

| Sprint | Feature | Policy |
|--------|---------|--------|
| 10.1 | Quick Capture | **LOCKED** — changes only with user feedback + verification |
| 10.2 | Prospect Workspace | Active; verification scripts required |
| 11.1 | Live WhatsApp | Documented in `SPRINT_11_1_LIVE_WHATSAPP.md` |
| 11.3 / 11.3.1 | Public site + production API client | Current integration baseline |

Business rules source of truth: [BUSINESS_RULES.md](../BUSINESS_RULES.md)

---

## Known open items (production blockers)

1. **Meta WABA selection (Sprint 11.4)** — **Major discovery (Meta confirmed):** Existing **Approved WABA** associates with **existing Atlas Developer App** via **WhatsApp → API Setup** — **no new app required**. WABA inventory complete: **Niovel Perez** → **786-752-8080** (MVP target); **Ana Perez** → **786-296-7254**. Meta-generated **Test WABA** disabled — do not use. **Next step:** API Setup → select **Niovel Perez** explicitly; do not accept Test WABA ([confirmed procedure](../deployment/sprint-11.4-meta-production.md#confirmed-procedure-atlas-mvp), DOC-0701 v1.7). **Do not delete unused WABAs during migration.** Not an Atlas backend issue.
2. **Live end-to-end smoke test** — Send WhatsApp to **+1 786-752-8080**; confirm Atlas reply → qualification → Google Calendar booking → confirmation. Required for production acceptance.
3. **Workflow state persistence** — `workflowState.json` / `agentActionState.json` are file-based; migrate to Supabase for Railway durability.
4. **META_APP_SECRET on Railway** — Recommended for webhook signature validation (currently skipped with warning when unset).
5. **Placeholder Atlas pages** — Conversations, Appointments, Analytics remain UI shells (deferred post-launch).

**Check readiness anytime:** `curl https://atlas-ai-production-01de.up.railway.app/health/production`

---

## Next planned milestone

| Field | Value |
|-------|-------|
| **Sprint** | 11.4 |
| **Primary objective** | Implement the Atlas AI Conversation Engine with WhatsApp Business integration and establish the Communication Hub architecture for future multi-channel support. |
| **Phase A status** | ✅ Deployed on `main` — live WhatsApp → Communication Hub → Conversation Engine → outbound |
| **Next (launch-critical)** | Google Calendar production config; end-to-end live ad → interview smoke test |
| **Deferred post-launch** | Phase B Hub adapters; executive dashboard polish; reminder engine |

**Related planning documents:**

- [Sprint-11.4.md](../05-sprints/Sprint-11.4.md)
- [Communication_Hub.md](../02-architecture/Communication_Hub.md)

---

## Documentation index

| Document | Audience |
|----------|----------|
| [ATLAS_CORE_ARCHITECTURE.md](../ATLAS_CORE_ARCHITECTURE.md) | Engineering |
| [BUSINESS_RULES.md](../BUSINESS_RULES.md) | Product + engineering |
| [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md) | Engineering |
| [BACKLOG.md](../BACKLOG.md) | Product |
| [DEVELOPMENT_WORKFLOW.md](../DEVELOPMENT_WORKFLOW.md) | Engineering |

---

## One-line status

> **Atlas AI reports `mvp_ready` on production health probe — live WhatsApp AI qualification and Google Calendar are configured; next step is one real end-to-end smoke test before turning on ads.**
