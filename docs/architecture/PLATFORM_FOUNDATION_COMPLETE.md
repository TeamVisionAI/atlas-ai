# Atlas Platform Foundation Complete

**Status:** Baseline established — Launch Candidate 2 ready  
**Date:** 2026-07-24  
**Commits:** LC1 (`9589954`), LC1.1 (`a857bef`), Bootstrap (`cce2a98`), Foundation Complete (this milestone)

This document is the official platform baseline. It consolidates security, identity, bootstrap, and organization foundations delivered across Launch Candidate 1, Launch Candidate 1.1, and Platform Bootstrap.

---

## Executive summary

Atlas now ships with a production-grade platform foundation:

- First-time **Setup Wizard** creates organization + administrator and permanently disables itself
- **Individual authentication** (email/password, sessions, password reset, invitations)
- **RBAC** enforced at middleware and service layers
- **Prospect ownership** and **Supabase RLS** (defense in depth)
- **Audit logging** and **PII protection**
- **Production guards** that block startup without `SUPABASE_SERVICE_ROLE_KEY`

Recruiting workflows, Meta integrations, and business logic were not redesigned in this milestone — only platform security and bootstrap were finalized.

---

## Bootstrap

### First-time setup detection

`GET /api/setup/status` returns:

| Field | Meaning |
|-------|---------|
| `setupRequired` | `true` when no users exist and setup has not completed |
| `setupCompletedAt` | ISO timestamp once setup finishes |
| `userCount` | Number of rows in `atlas_users` |

Setup is required when `setupRequired === true`. After completion, repeat attempts return `403 SETUP_COMPLETED`.

### Setup wizard flow

1. User visits `/app/setup` (or is redirected from `/app`, `/app/login`)
2. User submits organization name, administrator profile, email, password
3. `POST /api/setup/complete` creates organization, administrator, session, audit entries
4. `atlas_platform_settings.setup_completed_at` is written — setup permanently disabled
5. Frontend stores session token and redirects to the app

### Implementation

| Component | Location |
|-----------|----------|
| Setup routes | `backend/routes/setup.js` |
| Setup service | `backend/services/platformSetupService.js` |
| Setup wizard UI | `frontend/src/pages/identity/SetupWizard.jsx` |
| Migration | `backend/database/migrations/010_platform_bootstrap.sql` |
| Platform settings table | `atlas_platform_settings` |

### Development-only Postgres fallback

When `SUPABASE_SERVICE_ROLE_KEY` is missing **and** `NODE_ENV !== production`, the setup service can use direct Postgres via `backend/services/pgFallback.js` and `backend/dev/tools/performBootstrapInstall.js`. This path is **disabled in production**.

### Developer reset tools

See `backend/dev/tools/README.md` for `resetForBootstrap.js` and headless install verification.

---

## Identity

### User model

Table: `atlas_users` (migrations `008`, `009`)

| Field | Purpose |
|-------|---------|
| `email` | Unique login identifier |
| `password_hash` | scrypt hash — never returned to clients |
| `first_name`, `last_name`, `display_name` | Profile |
| `organization_id` | Tenant boundary |
| `role` | RBAC role code |
| `status` | `active`, `invited`, `suspended`, `deactivated` |
| `division_id`, `reports_to_user_id` | Hierarchy |
| `phone`, `photo_url`, `timezone`, `preferred_language` | Profile extensions |
| `notification_preferences` | JSON preferences |
| `last_login_at` | Login tracking |

### User lifecycle

| State | Behavior |
|-------|----------|
| **Invited** | Created by admin; must accept invitation and set password |
| **Active** | Can log in; full role permissions apply |
| **Suspended** | Login blocked |
| **Deactivated** | Login blocked; retained for audit |

Admin operations: `backend/services/identityAdminService.js`, `backend/routes/adminUsers.js`  
Self-service: `backend/routes/account.js`, My Account UI

### Invitations and password recovery

- `atlas_invitation_tokens` — admin-created invitations
- `atlas_password_reset_tokens` — self-service reset flow
- `atlas_login_history` — login events (success/failure, IP, user agent)

---

## Authentication

| Endpoint | Purpose |
|----------|---------|
| `POST /api/auth/login` | Email + password → session token |
| `POST /api/auth/logout` | Revokes current session |
| `GET /api/auth/me` | Returns sanitized user for bearer token |
| `POST /api/auth/password-reset/request` | Issues reset token (email) |
| `POST /api/auth/password-reset/confirm` | Sets new password |

### Sessions

Table: `atlas_sessions`

- Default TTL: 7 days
- Remember Me: 30 days
- Revocation via `revoked_at`
- Bearer token in `Authorization` header

Implementation: `backend/services/authService.js`, `backend/services/atlasUserService.js`

### Production authentication rules

- No bootstrap token auth in production (`ATLAS_BOOTSTRAP_TOKEN` ignored)
- No synthetic session fallback when auth tables missing
- No debug authentication routes mounted in production

---

## Authorization

### Middleware stack

1. `requireAtlasUser` — validates session, attaches `req.authContext`
2. `requirePermission(permission)` — capability check
3. `requireRole(role)` — role check
4. `requireProspectAccess` — loads prospect + `canAccessProspect()`

Core modules:

| Module | Path |
|--------|------|
| Roles | `backend/security/roles.js` |
| Permissions | `backend/security/permissions.js` |
| Authorization engine | `backend/security/authorizationService.js` |
| Prospect access | `canAccessProspect()`, `getProspectListScope()` |

---

## RBAC

| Role | Code | Scope |
|------|------|-------|
| Administrator | `administrator` | Full org administration |
| RVP | `rvp` | Entire organization |
| Division Leader | `division_leader` | Division hierarchy |
| Agent | `agent` | Assigned prospects |
| Recruiter | `recruiter` | Personal recruiting workspace |
| Operations | `operations` | Operations Center only |
| Support | `support` | Limited troubleshooting (masked PII) |

Full permission matrix: [docs/security/RBAC_MODEL.md](../security/RBAC_MODEL.md)

Protected surfaces: core prospects API, mission control, prospect workspace, executive dashboard, operations center, admin users, account routes.

---

## Prospect ownership

Every prospect record includes tenant and ownership fields:

| Field | Purpose |
|-------|---------|
| `organization_id` | Tenant boundary |
| `owner_user_id` | Primary owner |
| `assigned_agent_id` | Active assignee (core prospects) |
| `assigned_division_id` | Division scope |
| `assigned_rvp_id` | RVP hierarchy |

Authorization: `canAccessProspect(authContext, prospect)` enforces organization match + role hierarchy + assignment.

Migration: `008_lc1_security_foundation.sql`

---

## RLS (Row Level Security)

Supabase RLS provides defense in depth. Policies deny all `anon` access on sensitive tables:

| Table | Policy |
|-------|--------|
| `organizations` | Deny anon |
| `divisions` | Deny anon |
| `atlas_users` | Deny anon |
| `atlas_sessions` | Deny anon |
| `atlas_password_reset_tokens` | Deny anon |
| `atlas_invitation_tokens` | Deny anon |
| `atlas_audit_log` | Deny anon |
| `atlas_platform_settings` | Deny anon |
| `prospects` | Deny anon |
| `atlas_core_prospects` | Deny anon |

**Production:** Backend uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Application-layer RBAC enforces all access.

**Development:** Without service role key, Postgres fallback may be used for platform operations only — never in production.

---

## Audit logging

Table: `atlas_audit_log`  
Service: `backend/security/auditLogService.js`

Recorded actions include:

- Login, logout, failed login
- Password reset requested / completed
- User created, updated, suspended, reactivated
- Platform setup completed
- Prospect viewed, updated, assigned
- Quick capture create

Fields: `organization_id`, `user_id`, `user_email`, `action`, `target_type`, `target_id`, `metadata`, `ip_address`, `user_agent`, `result`

See [docs/security/AUDIT_LOGGING.md](../security/AUDIT_LOGGING.md)

---

## PII protection

- Password hashes never returned (`sanitizeUser()`)
- Support role receives masked phone, email, notes via `backend/security/piiFilter.js`
- Service role key server-side only — never exposed to frontend
- Request logging sanitizes URLs in production (`safeRequestLogger`)

---

## User lifecycle (administrative)

Administrators can:

- Invite users (email invitation with token)
- Assign roles and divisions
- Suspend / reactivate accounts
- Force password reset
- View login history

Users can:

- Update profile (My Account)
- Change password
- Manage notification preferences

Frontend: Admin Users (`/app/admin/users`), My Account (`/app/account`)

---

## Organization model

Table: `organizations`

| Field | Purpose |
|-------|---------|
| `id` | UUID (default org: `00000000-0000-4000-8000-000000000001`) |
| `name`, `slug` | Display and URL-safe identifier |
| `status` | Organization status |
| `owner_user_id` | Administrator created during setup |

Setup wizard upserts the default organization and sets `owner_user_id` to the first administrator.

Related: [RFC-006 Organization Model](../10-rfcs/RFC-006-organization-model.md)

---

## Production requirements

| Requirement | Enforcement |
|-------------|-------------|
| `SUPABASE_SERVICE_ROLE_KEY` | Required at startup — `backend/core/platformProductionGuard.js` |
| No dev seeds in production | `seedAtlasUsers.js` throws; migrations skip seed |
| No bootstrap token auth | Disabled when `NODE_ENV=production` |
| No `/dev` routes | Not mounted in production |
| No Postgres fallback | `isPgFallbackEnabled()` returns false in production |
| No dev tool scripts | All tools in `backend/dev/tools/` refuse production execution |

---

## Validation checklist

Fresh install path:

```
Migrations applied
    ↓
GET /api/setup/status → setupRequired: true
    ↓
Setup Wizard → POST /api/setup/complete
    ↓
Organization + administrator created
    ↓
Automatic login (session returned)
    ↓
Admin can invite/create users
    ↓
Login / logout works
    ↓
RBAC enforced on protected routes
    ↓
Repeat setup → 403 SETUP_COMPLETED
    ↓
NODE_ENV=production + SUPABASE_SERVICE_ROLE_KEY → server starts cleanly
```

Regression script: `node backend/dev/verifyLC1Security.js`

---

## Related documentation

| Document | Topic |
|----------|-------|
| [LAUNCH_CANDIDATE_SECURITY_REPORT.md](../security/LAUNCH_CANDIDATE_SECURITY_REPORT.md) | LC1 security implementation |
| [LAUNCH_CANDIDATE_1_1_REPORT.md](../security/LAUNCH_CANDIDATE_1_1_REPORT.md) | LC1.1 identity management |
| [RBAC_MODEL.md](../security/RBAC_MODEL.md) | Role and permission matrix |
| [SECURITY_CHARTER.md](../security/SECURITY_CHARTER.md) | Security principles |
| [backend/dev/tools/README.md](../../backend/dev/tools/README.md) | Developer bootstrap tools |

---

## Transition to Launch Candidate 2

### Accomplished

- Individual authentication replacing bootstrap tokens
- Full RBAC with prospect ownership enforcement
- Supabase RLS on all sensitive tables
- Audit logging and PII masking
- Identity admin (invitations, user management, self-service account)
- First-time setup wizard with permanent disable
- Production startup guards for service role key
- Developer tools isolated and documented

### Remaining technical debt

- `SUPABASE_SERVICE_ROLE_KEY` must be added to deployment environments (currently may rely on dev fallback locally)
- Email delivery requires `RESEND_API_KEY` for invitation/reset emails in production
- Operations Center gated by `ENABLE_OPERATIONS_CENTER=true` in production
- Legacy `prospects` table coexists with `atlas_core_prospects` — consolidation deferred to LC2+

### Recommendations before LC2

1. Configure `SUPABASE_SERVICE_ROLE_KEY` in all non-local environments
2. Configure `RESEND_API_KEY` and verify invitation/reset email delivery
3. Run `verifyLC1Security.js` against staging after deploy
4. Rotate any credentials used during local install verification
5. Confirm setup wizard is inaccessible after first production bootstrap

### Recommended first LC2 task

**Meta WhatsApp production onboarding hardening** — complete Embedded Signup end-to-end with production credentials, webhook signature validation, and organization-scoped channel configuration. Platform foundation (auth, RBAC, bootstrap) is stable; LC2 can focus on communication channel production readiness.
