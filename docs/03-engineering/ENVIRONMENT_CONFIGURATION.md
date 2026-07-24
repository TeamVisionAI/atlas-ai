# Environment Configuration

## AI Summary

Atlas frontend API calls use an empty base URL in local development (Vite proxy to `localhost:3000`) and `VITE_API_BASE_URL` in production. Never hard-code Railway or other production URLs in application code. Backend secrets stay in the repository root `.env`; public frontend vars use the `VITE_` prefix in `frontend/.env`.

## Purpose

Document how Atlas routes API traffic in development vs production and how to configure environment variables correctly.

## Status

Approved — Sprint 13.1.1

## Business Rules

N/A — infrastructure configuration only.

## Technical Notes

### Development flow

```
Frontend (Vite)
https://localhost:5173
        ↓
   fetch("/api/...")
        ↓
   Vite proxy (vite.config.js)
        ↓
Backend
http://localhost:3000
```

| Setting | Value |
|---------|-------|
| `VITE_API_BASE_URL` | **Leave unset or empty** |
| `API_BASE` in code | `""` (same-origin) |
| Backend | `npm run dev` from repo root (port 3000) |
| Frontend | `npm run dev` in `frontend/` (port 5173) |

**Why the proxy:** Avoids CORS and mixed-content issues (HTTPS Vite → HTTP backend). Keeps local dev off production Railway.

### Production flow

```
Frontend (Vercel)
        ↓
   fetch("${VITE_API_BASE_URL}/api/...")
        ↓
Backend (Railway)
```

| Setting | Where |
|---------|-------|
| `VITE_API_BASE_URL` | Vercel project environment variables |
| Example value | `https://your-service.up.railway.app` (no trailing slash) |

**Why environment variables:** Each deployment target (Vercel preview, production) can point at the correct API without code changes.

### Frontend variables (`frontend/.env`)

See [frontend/.env.example](../../frontend/.env.example).

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_BASE_URL` | Production only | API base URL |
| `VITE_ATLAS_BOOTSTRAP_TOKEN` | Local + prod `/app` | Session bootstrap; must match backend `ATLAS_BOOTSTRAP_TOKEN` |
| `VITE_META_APP_ID` | WhatsApp Connect UI | Public Meta App ID |
| `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | WhatsApp Connect UI | Embedded Signup config ID |

### Backend variables (repo root `.env`)

See root [.env.example](../../.env.example). Key pairs:

| Backend | Frontend | Purpose |
|---------|----------|---------|
| `ATLAS_BOOTSTRAP_TOKEN` | `VITE_ATLAS_BOOTSTRAP_TOKEN` | Must match for session bootstrap |
| `META_APP_ID` | `VITE_META_APP_ID` | Meta SDK |
| `META_EMBEDDED_SIGNUP_CONFIG_ID` | `VITE_META_EMBEDDED_SIGNUP_CONFIG_ID` | Embedded Signup |

### Implementation

- `frontend/src/services/apiClient.js` — `API_BASE` resolution
- `frontend/src/config/validateEnvironment.js` — production warning if `VITE_API_BASE_URL` missing
- `frontend/vite.config.js` — `/api` proxy target

### Production validation

On production build startup, if `VITE_API_BASE_URL` is missing, the app logs:

```
[Atlas] Missing VITE_API_BASE_URL. Production API endpoint has not been configured.
```

The app does **not** crash; API calls will fail until the variable is set.

## API

N/A

## Database

N/A

## Related Documents

- [ENVIRONMENT_STRATEGY.md](./ENVIRONMENT_STRATEGY.md)
- [DEPLOYMENT_CHECKLIST.md](../08-operations/DEPLOYMENT_CHECKLIST.md)
- [local-development.md](../08-operations/local-development.md)
- [KNOWLEDGE_HUB.md](./KNOWLEDGE_HUB.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Removed hard-coded Railway URL from `apiClient.js` |
| 2026-07-24 | Local dev always uses Vite proxy (`API_BASE=""`) |
