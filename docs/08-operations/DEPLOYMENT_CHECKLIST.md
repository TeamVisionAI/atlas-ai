# Deployment Checklist

## AI Summary

Use this checklist before and after every Atlas production deployment. Covers build, lint, verification scripts, environment variables, Railway/Vercel deploy, health checks, authentication, Knowledge Hub, and core `/app` surfaces. Prevents regressions like frontend calling the wrong API base URL.

## Purpose

Standardize deployment verification for Atlas operators and engineers.

## Status

Approved — Sprint 13.1.1

---

## Before deployment

### Build and quality

- [ ] `cd frontend && npm run build` — succeeds
- [ ] `cd frontend && npm run lint` — no new errors
- [ ] `node backend/dev/verifyKnowledgeHub.js` — passes (when Knowledge Hub changed)

### Environment variables

**Vercel (frontend)**

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_API_BASE_URL` | Yes | Railway API URL, no trailing slash |
| `VITE_ATLAS_BOOTSTRAP_TOKEN` | Yes | Matches Railway `ATLAS_BOOTSTRAP_TOKEN` |
| `VITE_META_APP_ID` | If WhatsApp Connect live | Same as `META_APP_ID` |
| `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | If Embedded Signup live | Same as backend config ID |

**Railway (backend)**

| Variable | Required | Notes |
|----------|----------|-------|
| `ATLAS_BOOTSTRAP_TOKEN` | Yes | Session bootstrap |
| `SUPABASE_URL` / keys | Yes | App data |
| Meta / WhatsApp vars | Per feature | See `.env.example` |

See [ENVIRONMENT_CONFIGURATION.md](../03-engineering/ENVIRONMENT_CONFIGURATION.md).

### Deploy

- [ ] Railway backend deployed (includes latest `/docs` for Knowledge Hub)
- [ ] Vercel frontend deployed after env vars confirmed
- [ ] No hard-coded production URLs in `frontend/src/` (grep for `railway.app`)

---

## After deployment

### Health and API

- [ ] `GET {RAILWAY_URL}/health` — 200 OK
- [ ] `GET {RAILWAY_URL}/api/knowledge/tree` — 401 without auth (route exists), 200 with bearer token
- [ ] `GET {RAILWAY_URL}/api/knowledge/document?path=CURRENT_STATE.md` — 200 with bearer token

### Frontend surfaces

- [ ] `/app/knowledge` — dashboard loads, `CURRENT_STATE` visible, tree populated
- [ ] Knowledge Hub search, favorites, pinned, recent — client features work
- [ ] `/app` authentication — bootstrap session succeeds
- [ ] Dashboard / Mission Control — load without API errors
- [ ] Prospect Center — loads prospect data

### Regression checks

- [ ] Browser Network tab: API requests go to `VITE_API_BASE_URL` host (not wrong environment)
- [ ] No `404 Route not found` on `/api/knowledge/*`

---

## Local development (pre-push)

- [ ] Backend running on `http://localhost:3000`
- [ ] Frontend on `https://localhost:5173`
- [ ] `VITE_API_BASE_URL` **not** set to production in `frontend/.env`
- [ ] Network tab shows `/api/*` to localhost (Vite proxy), not Railway

---

## Related Documents

- [ENVIRONMENT_CONFIGURATION.md](../03-engineering/ENVIRONMENT_CONFIGURATION.md)
- [ENVIRONMENT_STRATEGY.md](../03-engineering/ENVIRONMENT_STRATEGY.md)
- [deployment/](./deployment/) — detailed runbooks
- [KNOWLEDGE_HUB.md](../03-engineering/KNOWLEDGE_HUB.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Deployment checklist created (Sprint 13.1.1) |
