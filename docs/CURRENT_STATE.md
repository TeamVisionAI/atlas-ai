# Atlas Current State

## AI Summary

Atlas is an internal MVP recruiting platform on Vercel, Railway, and Supabase. Sprint 13 extends the Knowledge Hub into Atlas's operational brain: dashboard homepage, client-side activity (recent, pinned, favorites), improved search, and AI-oriented documentation under `/docs/12-ai/`. GitHub `/docs` remains the single source of truth—no documentation database. Meta Embedded Signup works locally; production still needs Vercel `VITE_META_*` vars and durable Supabase connection storage.

## Current Sprint

Sprint 13 — Knowledge Hub Enhancements

## Product Stage

Internal MVP

## Overall Status

🟢 On Track

## Current Objective

Make the Knowledge Hub the official brain of Atlas: operational dashboard on `CURRENT_STATE.md`, AI documentation standards, client-side favorites and activity, and improved discoverability—without duplicating or moving documentation out of `/docs`.

## Working

- Public website and Atlas `/app/*` shell on Vercel + Railway + Supabase
- Knowledge Hub Phase 1 — `/app/knowledge`, tree navigation, Markdown viewer, authenticated API
- Meta Embedded Signup with App `1023033667266162` and BISU Config `1379268564167492` (local/dev validated)
- Messenger production path, Prospect Center, and Quick Capture
- Documentation Foundation v1.0 under numbered `/docs` sections
- Authorization code trace instrumentation for Embedded Signup debugging

## In Progress

- Sprint 13.1 — Knowledge Hub dashboard, favorites, pinned docs, enhanced search, AI docs section
- Vercel production env for `VITE_META_APP_ID` and `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID`
- Supabase-backed persistence for Embedded Signup connection storage on Railway
- Workflow state migration from JSON files to Supabase on Railway

## Blockers

- Production Vercel build missing Meta `VITE_*` vars → WhatsApp Connect shows missing-config notice
- Embedded Signup connection not durable on Railway until Supabase repository ships
- Meta WhatsApp Cloud API production migration deferred (platform restriction)

## External Dependencies

- Meta Tech Provider / Developer App `1023033667266162` (Atlas AI)
- Meta BISU Embedded Signup Configuration `1379268564167492`
- Google Calendar OAuth for interview booking
- Railway (API), Vercel (frontend), Supabase (data), Resend (contact form)

## Next Actions

1. Complete Sprint 13.1 Knowledge Hub enhancements and validate in staging
2. Set Vercel `VITE_META_*` vars and redeploy frontend
3. Implement Supabase `meta_whatsapp_connections` repository (Sprint 12.3 follow-up)
4. Re-run Embedded Signup on production after env + persistence fixes
5. Plan Phase 2 semantic search and Atlas Copilot integration

## Recent Decisions

- **2026-07-24:** Knowledge Hub reads `/docs` directly from the repository filesystem — no documentation database
- **2026-07-24:** Sprint 13 establishes `/docs/12-ai/` and `DOCUMENTATION_STANDARD.md` for AI-assisted development
- **2026-07-23:** Graph API standardized to v25.0 across frontend and backend
- **2026-07-23:** Documentation Foundation v1.0 consolidated under numbered `/docs` sections
- **2026-07-21:** Strategic pivot prioritizes Messenger; WhatsApp Cloud API migration deferred

## Recently Updated Documents

| Document | Path |
|----------|------|
| Knowledge Hub vision | [01-product/KNOWLEDGE_HUB_VISION.md](./01-product/KNOWLEDGE_HUB_VISION.md) |
| Documentation standard | [03-engineering/DOCUMENTATION_STANDARD.md](./03-engineering/DOCUMENTATION_STANDARD.md) |
| AI guidelines | [12-ai/AI_GUIDELINES.md](./12-ai/AI_GUIDELINES.md) |
| Knowledge Hub spec | [03-engineering/KNOWLEDGE_HUB.md](./03-engineering/KNOWLEDGE_HUB.md) |
| Development workflow | [03-engineering/DEVELOPMENT_WORKFLOW.md](./03-engineering/DEVELOPMENT_WORKFLOW.md) |

## Last Updated

2026-07-24
