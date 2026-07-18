# Local Development Troubleshooting

This guide covers how to run Atlas locally and how to diagnose common startup and connectivity issues.

## Required terminals

Atlas requires **two terminals** — one for the backend API and one for the frontend dev server.

### Terminal 1 — Backend (repo root)

```bash
cd ~/Documents/AtlasAi/atlas-ai
npm run dev
```

Expected output:

```
🚀 Atlas AI running on http://localhost:3000
```

Nodemon watches `backend/` and restarts on file changes.

### Terminal 2 — Frontend

```bash
cd ~/Documents/AtlasAi/atlas-ai/frontend
npm run dev -- --host
```

Expected output:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.x.x:5173/
```

The `--host` flag exposes the dev server on your LAN for mobile testing.

## Common ports

| Service | Port | URL |
|---------|------|-----|
| Backend API | 3000 | `http://localhost:3000` |
| Frontend (Vite) | 5173 | `http://localhost:5173` |
| Vite API proxy | 5173 → 3000 | `/api/*` forwarded to backend |

The frontend uses **relative `/api` URLs** and a Vite dev proxy (`frontend/vite.config.js`). Do not hardcode `http://localhost:3000` in frontend services — the proxy handles routing for both desktop and mobile.

## Verification checklist

Run these after starting both servers:

```bash
# Backend health
curl -s http://localhost:3000/ | head -c 80

# Organization settings (no Supabase — should always work)
curl -s -o /dev/null -w "org: %{http_code}\n" http://localhost:3000/api/organization/settings

# Dashboard (requires Supabase)
curl -s -o /dev/null -w "dashboard: %{http_code}\n" http://localhost:3000/api/dashboard

# Executive dashboard (requires Supabase)
curl -s -o /dev/null -w "executive: %{http_code}\n" http://localhost:3000/api/dashboard/executive

# Via Vite proxy (frontend dev server)
curl -s -o /dev/null -w "proxy: %{http_code}\n" http://localhost:5173/api/dashboard
```

Expected: all endpoints return **200** when Supabase is reachable.

In the browser, confirm:

- [ ] Executive Dashboard loads (home `/`)
- [ ] Mission Control loads (`/mission-control`)
- [ ] Quick Capture form renders (`/quick-capture`)
- [ ] Mobile: hamburger menu and overlay nav work (`--host`)

## Stale proxy environment variables

### Symptom

- `GET /api/organization/settings` → **200**
- `GET /api/dashboard` → **500** with `getaddrinfo ENOTFOUND *.supabase.co`
- `ping` and `dig` resolve the Supabase hostname fine
- ~7 second response time on failing requests

Organization settings succeeds because it reads local config only. Dashboard fails because it makes outbound HTTPS to Supabase via Node `fetch()`.

### Root cause

A backend process started from a **Cursor agent shell** may inherit sandbox proxy variables:

```
HTTP_PROXY=http://127.0.0.1:<port>
HTTPS_PROXY=http://127.0.0.1:<port>
ALL_PROXY=http://127.0.0.1:<port>
NO_PROXY=127.0.0.1,::1,localhost
```

When that local proxy is no longer running, Node routes all external HTTPS (including Supabase) through a dead proxy. `ping`/`dig` are unaffected because they do not use `HTTP_PROXY`.

Atlas code, Supabase URL, and DNS configuration are not the problem in this scenario.

### Diagnose

Check whether the backend process has proxy variables:

```bash
# Find the process on port 3000
lsof -nP -iTCP:3000 -sTCP:LISTEN

# Inspect its environment (replace PID)
ps eww -p <PID> | tr ' ' '\n' | grep -i proxy
```

Also check your current shell:

```bash
env | grep -i proxy
```

### Resolution

1. **Kill the stale backend:**

   ```bash
   kill $(lsof -t -iTCP:3000 -sTCP:LISTEN)
   ```

2. **Restart from a normal macOS Terminal** (not an agent shell):

   ```bash
   cd ~/Documents/AtlasAi/atlas-ai
   npm run dev
   ```

3. **If you must run from a Cursor agent shell**, bypass the proxy for Supabase:

   ```bash
   NO_PROXY=127.0.0.1,::1,localhost,.supabase.co npm run dev
   ```

## Port 3000 already in use

### Symptom

```
🚀 Atlas AI running on http://localhost:3000
[nodemon] clean exit - waiting for changes before restart
```

The startup message prints, but nodemon immediately reports a clean exit. Another process already holds port 3000.

### Resolution

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
kill <PID>
npm run dev
```

## Frontend cannot reach API on mobile

### Symptom

Quick Capture renders (static form), but Executive Dashboard and Mission Control fail to load when accessing via LAN IP (`http://192.168.x.x:5173`).

### Cause

Frontend was calling `http://localhost:3000` directly. On a phone, `localhost` refers to the phone, not the dev machine.

### Resolution

Use the Vite dev proxy with relative `/api` URLs (already configured). Restart Vite after changing `vite.config.js`:

```bash
cd frontend && npm run dev -- --host
```

## Sprint verification scripts

```bash
# Quick Capture (Sprint 10.1 — locked)
node backend/dev/verifySprint10_1.js

# Prospect Workspace (Sprint 10.2a)
node backend/dev/verifySprint10_2.js
```

Both require the backend environment (`.env` with Supabase credentials) and network access to Supabase.
