# Launch Candidate 1 — Security Foundation Report

**Date:** 2026-07-24  
**Scope:** C-04 Individual Authentication, C-05 RBAC, C-06 Supabase RLS  
**Status:** Implemented (Phase 1)

---

## Executive summary

Atlas LC1 replaces bootstrap authentication with individual accounts, centralized authorization middleware, prospect ownership fields, Supabase RLS (defense in depth), audit logging, and PII masking for support roles. Recruiting behavior is unchanged; only security architecture was modified.

---

## Completed items

### C-04 — Individual authentication

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| Individual user accounts | Done | `atlas_users` extended with `organization_id`, `role`, `status`, `password_hash` |
| Secure login | Done | `POST /api/auth/login` via `authService.js` + scrypt passwords |
| Secure logout | Done | `POST /api/auth/logout` revokes session (`revoked_at`) |
| Session expiration | Done | 7-day default; 30-day with Remember Me |
| Session revocation | Done | `revokeSessionByToken`, `revokeAllSessionsForUser` |
| Password reset architecture | Done | `POST /api/auth/password-reset/request` + `atlas_password_reset_tokens` |
| Remember Me | Done | `rememberMe` flag on login + session TTL |
| Bootstrap removed from production | Done | Bootstrap session route removed; dev bootstrap token fallback only when auth tables missing |

### C-05 — Role based access control

| Component | Location |
|-----------|----------|
| Role definitions | `backend/security/roles.js` |
| Permission matrix | `backend/security/permissions.js` |
| Authorization engine | `backend/security/authorizationService.js` |
| `requireAtlasUser` + auth context | `backend/middleware/requireAtlasUser.js` |
| `requireRole()` | `backend/middleware/requireRole.js` |
| `requirePermission()` | `backend/middleware/requirePermission.js` |
| `requireProspectAccess()` | `backend/middleware/requireProspectAccess.js` |

Protected surfaces wired: core prospects API, legacy mission control, prospect workspace, executive dashboard, operations center.

### C-06 — Supabase row level security

| Table | RLS | Policy |
|-------|-----|--------|
| `organizations` | Enabled | Deny all `anon` |
| `divisions` | Enabled | Deny all `anon` |
| `atlas_users` | Enabled | Deny all `anon` |
| `atlas_sessions` | Enabled | Deny all `anon` |
| `atlas_password_reset_tokens` | Enabled | Deny all `anon` |
| `atlas_audit_log` | Enabled | Deny all `anon` |
| `prospects` | Enabled | Deny all `anon` |
| `atlas_core_prospects` | Enabled | Deny all `anon` |

Backend uses `SUPABASE_SERVICE_ROLE_KEY` when configured (bypasses RLS; app-layer RBAC enforces access).

### Prospect ownership

Legacy `prospects` and core `atlas_core_prospects` include:

- `organization_id`
- `owner_user_id` (core + legacy backfill)
- `assigned_division_id`
- `assigned_rvp_id`
- `assigned_agent_id` (existing on core)

### Audit logging

`atlas_audit_log` table + `auditLogService.js` records:

- Login / logout / failed login
- Password reset requested
- Prospect viewed / updated
- Lead assigned (core assign endpoint)
- Quick capture create

### PII protection

- Support role masking via `piiFilter.js` (phone, email, notes)
- Password hashes never returned (`sanitizeUser`)
- Service role key server-side only

---

## RBAC matrix

| Role | prospect:read | prospect:write | prospect:assign | prospect:communicate | dashboard:executive | operations:access |
|------|---------------|----------------|-----------------|----------------------|---------------------|-------------------|
| administrator | Yes | Yes | Yes | Yes | Yes | Yes |
| rvp | Org | Org | Yes | Yes | Yes | No |
| division_leader | Division | Division | Yes | Yes | Yes | No |
| agent | Assigned | Assigned | No | Yes | No | No |
| recruiter | Assigned | Assigned | No | Yes | No | No |
| operations | No | No | No | No | No | Yes |
| support | Org (masked) | No | No | No | No | No |

Prospect access hierarchy enforced in `canAccessProspect()`.

---

## Authentication architecture

```
Browser → POST /api/auth/login (email + password)
       → atlas_users lookup + scrypt verify
       → atlas_sessions row (token, expires_at, remember_me)
       → Bearer token on subsequent API calls
       → requireAtlasUser → buildAuthContext → requirePermission / requireProspectAccess
```

Dev seeded users (`seedAtlasUsers.js`):

| Email | Role | Default password |
|-------|------|------------------|
| ana@teamvision.ai | recruiter | `AtlasDev2026!` |
| niovel@teamvision.ai | administrator | `AtlasDev2026!` |
| ops@teamvision.ai | operations | `AtlasDev2026!` |
| agent@teamvision.ai | agent | `AtlasDev2026!` |

---

## Database migration summary

**Migration:** `backend/database/migrations/008_lc1_security_foundation.sql`

- Creates `organizations`, `divisions`, `atlas_audit_log`, `atlas_password_reset_tokens`
- Extends `atlas_users`, `atlas_sessions`, `prospects`, `atlas_core_prospects`
- Backfills default organization and ownership
- Enables RLS + anon deny policies

Apply:

```bash
node backend/dev/environment/applyAtlasCoreMigrations.js
node backend/dev/environment/seedAtlasUsers.js
```

---

## Validation

Run:

```bash
node backend/dev/verifyLC1Security.js
```

Optional HTTP checks:

```bash
ATLAS_TEST_BASE_URL=http://localhost:3000 node backend/dev/verifyLC1Security.js
```

Verified scenarios:

- Anonymous access returns 401 (when HTTP base URL configured)
- Cross-organization access denied
- Unauthorized role returns 403 (operations on prospects)
- Prospect ownership enforced (agent vs other agent)
- Division leader division scoping
- RVP organization-wide visibility
- Administrator full permissions

---

## Remaining risks

| Risk | Severity | Notes |
|------|----------|-------|
| Password reset email delivery not implemented | Medium | Architecture only; tokens stored hashed |
| Some legacy aggregate routes lack prospect-level audit | Low | Mission control list views |
| JWT-based Supabase client policies not yet implemented | Low | RLS is anon-deny + service role; future direct client access needs JWT claims |
| Division membership not fully seeded | Medium | `divisions` table exists; assign divisions in admin tooling (future) |
| SSO / MFA not implemented | Medium | Password auth only for LC1 |
| In-memory prospect fallback bypasses RLS | Low | Dev-only when Supabase table missing |

---

## Files modified (summary)

**Backend:** `backend/security/*`, `backend/middleware/*`, `backend/services/authService.js`, `backend/services/atlasUserService.js`, `backend/routes/auth.js`, prospect/mission-control/workspace routes, migration 008, seed/verify scripts.

**Frontend:** `Login.jsx`, `RequireAuth.jsx`, `atlasAuthService.js`, `App.jsx`, `MainLayout.jsx`.

**Docs:** `docs/security/*`, this report.

---

## Definition of done

- Individual authentication
- Production-safe authorization middleware
- Role based access control
- Prospect ownership fields + enforcement
- Supabase RLS enabled with documented policies
- PII masking for support
- Audit logging for auth and primary prospect mutations
- No recruiting feature changes
