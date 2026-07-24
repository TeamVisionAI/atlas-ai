# Atlas Current State

Operational snapshot for the Knowledge Hub homepage. Source of truth for narrative detail remains the linked documents under `/docs`.

## Current Sprint

**Knowledge Hub Phase 1** — in-app documentation browser backed by the repository `/docs` folder (no database copy).

## Current Objective

Ship an authenticated Atlas Knowledge Hub at `/app/knowledge` with live Markdown viewing, search, and recent-document navigation while preserving `/docs` as the single documentation source of truth.

## Working

- Public website and Atlas `/app/*` shell on Vercel + Railway + Supabase
- Meta Embedded Signup with App `1023033667266162` and BISU Config `1379268564167492` (local/dev validated)
- Messenger production path and Prospect Center / Quick Capture
- Documentation Foundation v1.0 structure under `/docs`
- **Knowledge Hub Phase 1** — `/app/knowledge`, `/api/knowledge/tree`, `/api/knowledge/document`

## In Progress

- Vercel production env for `VITE_META_APP_ID` and `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` (required for Embedded Signup UI on `teamvisionfinancial.com`)
- Supabase-backed persistence for Embedded Signup connection storage on Railway (replace ephemeral `json_file`)
- Workflow state migration from JSON files to Supabase on Railway

## Blockers

- Production Vercel build missing Meta `VITE_*` vars → WhatsApp Connect shows missing-config notice
- Embedded Signup connection not durable on Railway until Supabase repository ships
- Meta WhatsApp Cloud API production migration deferred (platform restriction)

## External Dependencies

- Meta Developer App `1023033667266162` (Atlas AI)
- Meta BISU Embedded Signup Configuration `1379268564167492`
- Railway (API), Vercel (frontend), Supabase (data), Resend (contact form)
- Google Calendar OAuth for interview booking

## Next Actions

1. Set Vercel `VITE_META_*` vars and redeploy frontend
2. Implement Supabase `meta_whatsapp_connections` repository (Sprint 12.3 follow-up)
3. Re-run Embedded Signup on production after env + persistence fixes
4. Expand Knowledge Hub Phase 2 (full-text search, edit proposals) after Phase 1 validation

## Recent Decisions

- **2026-07-24:** Knowledge Hub reads `/docs` directly from the repository filesystem — no documentation database
- **2026-07-23:** Graph API standardized to v25.0 across frontend and backend
- **2026-07-23:** Documentation Foundation v1.0 consolidated under numbered `/docs` sections
- **2026-07-21:** Strategic pivot prioritizes Messenger; WhatsApp Cloud API migration deferred

## Recently Updated Documents

| Document | Path |
|----------|------|
| Knowledge Hub spec | [03-engineering/KNOWLEDGE_HUB.md](./03-engineering/KNOWLEDGE_HUB.md) |
| Knowledge Hub Phase 1 sprint | [09-releases/sprints/SPRINT_KNOWLEDGE_HUB_PHASE_1.md](./09-releases/sprints/SPRINT_KNOWLEDGE_HUB_PHASE_1.md) |
| Current system state (executive) | [00-executive/Current_System_State.md](./00-executive/Current_System_State.md) |
| WhatsApp Embedded Signup | [05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md](./05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md) |
| Documentation index | [README.md](./README.md) |
