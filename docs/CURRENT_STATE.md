# Atlas Current State

## AI Summary

Atlas is an internal MVP recruiting platform on Vercel, Railway, and Supabase. Sprint 13.1.1 fixes environment routing: local dev always uses the Vite proxy (never hard-coded production URLs); production requires `VITE_API_BASE_URL` on Vercel. Knowledge Hub is working locally when backend runs on port 3000. Production Knowledge Hub requires Railway redeploy with `/api/knowledge` routes and correct Vercel env vars.

## Current Sprint

Sprint 13.1.1 — Environment & Knowledge Hub Stability

## Product Stage

Internal MVP

## Overall Status

🟢 On Track

## Current Objective

Eliminate local-dev API misrouting (frontend hitting production Railway by default) and document environment configuration, deployment checks, and future staging strategy.

## Working

- Public website and Atlas `/app/*` shell on Vercel + Railway + Supabase
- Knowledge Hub — `/app/knowledge`, dashboard, tree, search, favorites, pinned, recent (local validated)
- Environment routing — dev uses Vite proxy; no hard-coded Railway URL in `apiClient.js`
- Meta Embedded Signup with App `1023033667266162` and BISU Config `1379268564167492` (local/dev validated)
- Messenger production path, Prospect Center, and Quick Capture
- Documentation Foundation v1.0 and `/docs/12-ai/` AI documentation section

## In Progress

- Production Railway redeploy with Knowledge Hub API routes
- Vercel `VITE_API_BASE_URL` confirmation on production (required after hard-coded URL removal)
- Vercel production env for `VITE_META_APP_ID` and `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID`
- Supabase-backed persistence for Embedded Signup connection storage on Railway

## Blockers

- Production Vercel must set `VITE_API_BASE_URL` to Railway URL (no app fallback)
- Production Railway may lack `/api/knowledge/*` until next backend deploy
- Production Vercel build missing Meta `VITE_*` vars → WhatsApp Connect missing-config notice
- Embedded Signup connection not durable on Railway until Supabase repository ships

## External Dependencies

- Meta Tech Provider / Developer App `1023033667266162` (Atlas AI)
- Meta BISU Embedded Signup Configuration `1379268564167492`
- Google Calendar OAuth for interview booking
- Railway (API), Vercel (frontend), Supabase (data), Resend (contact form)

## Next Actions

1. Set `VITE_API_BASE_URL` on Vercel production and redeploy frontend
2. Deploy Railway backend with Knowledge Hub routes
3. Run [DEPLOYMENT_CHECKLIST.md](./08-operations/DEPLOYMENT_CHECKLIST.md) post-deploy verification
4. Set Vercel `VITE_META_*` vars for Embedded Signup UI
5. Implement Supabase `meta_whatsapp_connections` repository (Sprint 12.3 follow-up)

## Recent Decisions

- **2026-07-24:** Removed hard-coded Railway URL from frontend; local dev always uses Vite proxy
- **2026-07-24:** Production requires explicit `VITE_API_BASE_URL`; missing var logs startup warning
- **2026-07-24:** Knowledge Hub reads `/docs` from filesystem — no documentation database
- **2026-07-24:** Official environments: Local + Production; Staging planned for future

## Recently Updated Documents

| Document | Path |
|----------|------|
| Environment configuration | [03-engineering/ENVIRONMENT_CONFIGURATION.md](./03-engineering/ENVIRONMENT_CONFIGURATION.md) |
| Environment strategy | [03-engineering/ENVIRONMENT_STRATEGY.md](./03-engineering/ENVIRONMENT_STRATEGY.md) |
| Deployment checklist | [08-operations/DEPLOYMENT_CHECKLIST.md](./08-operations/DEPLOYMENT_CHECKLIST.md) |
| Knowledge Hub spec | [03-engineering/KNOWLEDGE_HUB.md](./03-engineering/KNOWLEDGE_HUB.md) |

## Environment Status

### Development

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend | ✅ | `https://localhost:5173` — Vite dev server |
| API routing | ✅ | `API_BASE=""` → Vite proxy → `http://localhost:3000` |
| Knowledge Hub | ✅ | Requires local backend + matching bootstrap tokens |
| Hard-coded production URL | ✅ Removed | See `frontend/src/services/apiClient.js` |

Copy `frontend/.env.example` → `frontend/.env`. Leave `VITE_API_BASE_URL` empty locally.

### Production

| Component | Status | Notes |
|-----------|--------|-------|
| Frontend (Vercel) | ⚠️ | Must set `VITE_API_BASE_URL` to Railway API URL |
| Knowledge Hub API | ⚠️ | Confirm Railway deploy includes `/api/knowledge/*` |
| Meta Embedded Signup UI | ⚠️ | `VITE_META_*` vars still required on Vercel |

## Deployment Notes

- **Before deploy:** [DEPLOYMENT_CHECKLIST.md](./08-operations/DEPLOYMENT_CHECKLIST.md) — build, lint, env vars, verification scripts
- **Vercel:** Set `VITE_API_BASE_URL`, `VITE_ATLAS_BOOTSTRAP_TOKEN`, and Meta `VITE_*` as needed
- **Railway:** Deploy backend with latest code; Knowledge Hub serves `/docs` from deployed repo
- **After deploy:** Verify `/health`, `/app/knowledge`, `/api/knowledge/tree`, `/api/knowledge/document?path=CURRENT_STATE.md`
- **Breaking change:** Production builds no longer fall back to a hard-coded Railway URL — misconfiguration surfaces immediately via failed API calls and console warning

## Last Updated

2026-07-24
