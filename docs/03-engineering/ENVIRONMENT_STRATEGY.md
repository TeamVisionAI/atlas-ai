# Environment Strategy

## AI Summary

Atlas runtime lifecycle is **Local → Staging → Production**. Local development uses the Vite proxy to a localhost backend. Staging is a fully isolated Railway + Supabase + Vercel Preview stack with synthetic data only. Production remains Railway `atlas-ai` + Supabase `gjuheeztwxbnscjobkzm` + Vercel production. Staging is the required validation layer before database, RLS, storage, media, and risky workflow changes reach production.

## Purpose

Define current environment architecture for Atlas frontend, backend, database, and safety guards.

## Status

Approved — staging implemented as the minimum safe pre-production environment.

## Business Rules

N/A — infrastructure configuration. Behavioral rules remain in `BUSINESS_RULES.md`.

---

## Canonical lifecycle

```
LOCAL
  ↓
STAGING
  ↓
PRODUCTION
```

| Environment | Frontend | Backend | Database |
|-------------|----------|---------|----------|
| **Local** | Vite `https://localhost:5173` | `http://localhost:3000` | Developer-chosen; default `.env` historically points at production Supabase — do not switch silently |
| **Staging** | Vercel Preview / `VITE_ATLAS_ENV=staging` | Railway environment `staging`, `ATLAS_ENV=staging` | Separate Supabase project. Never `gjuheeztwxbnscjobkzm` |
| **Production** | Vercel production | Railway environment `production`, service `atlas-ai` | Supabase **`gjuheeztwxbnscjobkzm`** (protected) |

### When staging is required

STAGING is **required** before production for:

- DB migrations
- RLS changes
- storage buckets
- backend integrations
- media infrastructure
- risky workflow / state changes

STAGING is **optional by risk** for:

- copy
- CSS
- isolated frontend presentation fixes

### Protected production Supabase

Production Supabase project ref:

**`gjuheeztwxbnscjobkzm`**

Never use this ref when `ATLAS_ENV=staging`. Backend startup hard-fails if staging points at it. `ATLAS_EXPECTED_SUPABASE_REF` must be the staging project ref.

Live staging Supabase project ref:

**`jmobhvosciwanvsqpnwk`**

Do not use the incorrect spelling `jmobhvoscivanvsqpnwk`.

---

## Local

- Developers run backend and frontend locally
- Vite proxies `/api` → localhost
- Bootstrap auth via matching `ATLAS_BOOTSTRAP_TOKEN` / `VITE_ATLAS_BOOTSTRAP_TOKEN`
- Knowledge Hub reads `/docs` from local filesystem via local API

### Warning — default local `.env`

The repository-root `.env` currently used for local development targets **production Supabase** (`gjuheeztwxbnscjobkzm`).

- Do **not** silently overwrite `.env` with staging values
- To run local frontend/backend against staging Supabase **intentionally**, copy `.env.staging.example` → `.env.staging.local` and start with:

```bash
ATLAS_STAGING_ENV_FILE=.env.staging.local npm run dev
```

Frontend staging mode:

```bash
cd frontend
cp .env.staging.example .env.staging.local
npm run dev -- --mode staging
```

---

## Staging

- Separate Supabase project (preferred name: `atlas-staging`, ref **`jmobhvosciwanvsqpnwk`**)
- Railway: same project, environment `staging`, `ATLAS_ENV=staging`, `NODE_ENV=production`
- Vercel Preview / staging branch: `VITE_ATLAS_ENV=staging` and explicit `VITE_API_BASE_URL` to Railway staging
- Synthetic users/prospects only — no production data, phones, sessions, or conversation logs
- Execution gates remain off:
  - `RECRUIT_AI_V2_EXECUTION_ENABLED=false`
  - `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED=false`
- Outbound delivery off by default: `STAGING_OUTBOUND_COMMUNICATION_ENABLED=false`
- No production WhatsApp WABA / webhook / token
- Day-one WhatsApp uses signed/simulated webhook fixtures only
- Authenticated UI shows an unmistakable **STAGING** banner
- Frontend staging builds fail closed if `VITE_API_BASE_URL` is missing or equals production Railway

Apply baseline migrations on staging only:

```bash
npm run staging:migrate   # pre-baseline + 001–038 + PostgREST service_role grants; never 039
npm run staging:seed      # synthetic personas/prospects
```

Migration 039 (communication media / audio) is **not** part of staging bootstrap. Apply it only in a later audio validation task after staging isolation is confirmed.

---

## Production

- Vercel serves static frontend bundle
- Railway serves Express API + `/docs` for Knowledge Hub
- Environment: `production`, service: `atlas-ai`
- Supabase: `gjuheeztwxbnscjobkzm`
- Missing `VITE_API_BASE_URL` logs a startup warning and keeps the documented production Railway fallback (does not crash)
- Do not change production Railway env, Vercel env, WhatsApp webhook, or WABA from staging work

---

## Principles

1. **Same codebase** across environments; configuration differs only by env vars
2. **Never rely only on `NODE_ENV`** — use `ATLAS_ENV` / `VITE_ATLAS_ENV`
3. **No production secrets in staging** — generate staging JWT/bootstrap/session secrets
4. **No production data in staging**
5. **Documentation** remains in Git `/docs`; Knowledge Hub reads deployed repo tree
6. **Secrets** never in frontend bundle except public Meta IDs (`VITE_META_*`)

## API

- Local: empty API base (Vite proxy)
- Staging: required `VITE_API_BASE_URL` → Railway staging
- Production: `VITE_API_BASE_URL` or documented Railway fallback

## Database

| Environment | Supabase |
|-------------|----------|
| Production | `gjuheeztwxbnscjobkzm` (protected) |
| Staging | dedicated project; `ATLAS_EXPECTED_SUPABASE_REF` must match |
| Local | explicit choice; default `.env` is production-linked until intentionally switched |

## Related Documents

- [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md)
- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
- [DEPLOYMENT_CHECKLIST.md](../08-operations/DEPLOYMENT_CHECKLIST.md)
- [CURRENT_STATE.md](../CURRENT_STATE.md)
- [local-development.md](../08-operations/local-development.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Official support: Local + Production only |
| 2026-07-24 | Staging deferred to future sprint |
| 2026-08-13 | Staging implemented as required validation layer before audio / migration 039 |
