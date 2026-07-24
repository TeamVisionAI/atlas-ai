# Environment Strategy

## AI Summary

Atlas officially supports **Local** and **Production** environments today. Local development uses the Vite proxy to a localhost backend; production uses Vercel + Railway with explicit `VITE_*` configuration. **Staging** is planned for a future release to validate changes before production without touching live operators.

## Purpose

Define current and future environment architecture for Atlas frontend, backend, and documentation.

## Status

Approved — Sprint 13.1.1

## Business Rules

N/A

---

## Current supported environments

| Environment | Frontend | Backend | API routing |
|-------------|----------|---------|-------------|
| **Local** | Vite `https://localhost:5173` | `http://localhost:3000` | Vite proxy `/api` → localhost |
| **Production** | Vercel | Railway | `VITE_API_BASE_URL` → Railway |

### Local

- Developers run backend and frontend locally
- No production API URLs in code
- Bootstrap auth via matching `ATLAS_BOOTSTRAP_TOKEN` / `VITE_ATLAS_BOOTSTRAP_TOKEN`
- Knowledge Hub reads `/docs` from local filesystem via local API

### Production

- Vercel serves static frontend bundle
- Railway serves Express API + `/docs` for Knowledge Hub
- All production endpoints configured via environment variables (Vercel, Railway)
- Missing `VITE_API_BASE_URL` logs a startup warning (does not crash)

---

## Future architecture (planned)

```
Local
  ↓
Development (shared dev API — optional)
  ↓
Staging (pre-production validation)
  ↓
Production
```

### Staging (planned)

- Separate Vercel + Railway (or preview) deployments
- Staging `VITE_API_BASE_URL` pointing at staging API
- Validate Knowledge Hub, Embedded Signup, and Mission Control before production promote
- **Not implemented in Sprint 13.1.1**

### Principles

1. **No hard-coded production URLs** in application source
2. **Same codebase** across environments; configuration differs only by env vars
3. **Documentation** remains in Git `/docs`; Knowledge Hub reads deployed repo tree
4. **Secrets** never in frontend bundle except public Meta IDs (`VITE_META_*`)

## API

N/A

## Database

Supabase project may differ per environment in future staging work; today local and production share configuration patterns documented in [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md).

## Related Documents

- [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md)
- [DEPLOYMENT_CHECKLIST.md](../08-operations/DEPLOYMENT_CHECKLIST.md)
- [CURRENT_STATE.md](../CURRENT_STATE.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Official support: Local + Production only |
| 2026-07-24 | Staging deferred to future sprint |
