# Atlas Developer Tools

Local-only scripts for platform bootstrap verification. **None of these tools are exposed as HTTP routes.** Each script refuses to run when `NODE_ENV=production`.

## Prerequisites

- Migrations applied: `node backend/dev/environment/applyAtlasCoreMigrations.js`
- `DATABASE_URL` or Supabase DB credentials in `.env` (for direct Postgres access)
- Development environment (`NODE_ENV` unset or not `production`)

## Tools

### `resetForBootstrap.js`

Clears all Atlas users, sessions, invitation/reset tokens, and the setup completion marker. Nulls prospect/org owner FK references first.

**When to use:** Before re-running the setup wizard locally, or to return a dev database to first-boot state.

```bash
node backend/dev/tools/resetForBootstrap.js
```

### `performBootstrapInstall.js`

Creates organization + administrator + session via direct Postgres. Used when `SUPABASE_SERVICE_ROLE_KEY` is not configured locally but the setup API must be verified.

**When to use:** Headless install verification, CI smoke tests, or local installs without service role key. Production installs must use the setup wizard (`POST /api/setup/complete`) with service role configured.

Required environment variables for CLI:

| Variable | Description |
|----------|-------------|
| `ATLAS_SETUP_ORG_NAME` | Organization display name |
| `ATLAS_SETUP_OWNER_FIRST_NAME` | Administrator first name |
| `ATLAS_SETUP_OWNER_LAST_NAME` | Administrator last name |
| `ATLAS_SETUP_OWNER_EMAIL` | Administrator email |
| `ATLAS_SETUP_PASSWORD` | Administrator password |

```bash
ATLAS_SETUP_ORG_NAME="Acme Financial" \
ATLAS_SETUP_OWNER_FIRST_NAME="Jane" \
ATLAS_SETUP_OWNER_LAST_NAME="Admin" \
ATLAS_SETUP_OWNER_EMAIL="admin@example.com" \
ATLAS_SETUP_PASSWORD="YourSecurePassword!" \
node backend/dev/tools/performBootstrapInstall.js
```

### `seedTeamVisionSaaS.js`

Seeds Team Vision organization and SUPER_ADMIN from environment variables. Uses bcrypt — never hardcodes passwords.

**When to use:** New SaaS environments after migration 011, or to create/update the platform super admin in development.

Required environment variables:

| Variable | Description |
|----------|-------------|
| `ATLAS_SUPER_ADMIN_EMAIL` | Super admin email |
| `ATLAS_SUPER_ADMIN_PASSWORD` | Super admin password (min 8 chars) |
| `ATLAS_SUPER_ADMIN_NAME` | Display name (optional) |

```bash
ATLAS_SUPER_ADMIN_EMAIL="admin@example.com" \
ATLAS_SUPER_ADMIN_PASSWORD="YourSecurePassword!" \
node backend/dev/tools/seedTeamVisionSaaS.js
```

## Related scripts (environment folder)

| Script | Purpose |
|--------|---------|
| `backend/dev/environment/applyAtlasCoreMigrations.js` | Apply SQL migrations; seeds dev users only outside production |
| `backend/dev/environment/seedAtlasUsers.js` | Seed default dev accounts (`AtlasDev2026!`); blocked in production |
| `backend/dev/verifyLC1Security.js` | RBAC and auth regression checks |

## Production rules

- `SUPABASE_SERVICE_ROLE_KEY` is **required** at startup (`backend/core/platformProductionGuard.js`)
- Postgres fallback (`backend/services/pgFallback.js`) is disabled in production
- Dev routes under `/dev` are not mounted in production (`backend/server.js`)
- Bootstrap token auth (`ATLAS_BOOTSTRAP_TOKEN`) is disabled in production
