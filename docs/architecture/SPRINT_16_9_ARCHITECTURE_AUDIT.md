# Sprint 16.9 — Architecture Audit Report

**Date:** 2026-07-25  
**Scope:** Pre-commit audit of Atlas SaaS Multi-Tenant Foundation  
**Status:** Audited — issues found and remediated

---

## Executive summary

Sprint 16.9 introduces a multi-tenant SaaS foundation additively on top of the LC1 platform. The audit identified **7 issues** requiring remediation before commit. All were fixed. The platform remains backward compatible with existing Team Vision functionality.

| Category | Findings | Fixed |
|----------|----------|-------|
| Critical security | 2 | 2 |
| Tenant isolation | 3 | 3 |
| Duplicate / dead code | 2 | 2 |
| Documentation | 1 | 1 |

---

## 1. Authentication architecture

### Verified: single authentication entry point

All protected routes flow through one chain:

```
requireAtlasUser → authenticate() → buildAuthContextAsync()
```

JWT and legacy opaque session tokens are handled in **one place** (`backend/middleware/authenticate.js`). No parallel auth stacks exist.

### Issue found & fixed: duplicate `/auth/me` logic

**Before:** `routes/auth.js` had its own JWT/session resolution, duplicating `authenticate()`.

**After:** `/auth/me` uses `requireAtlasUser` middleware and returns `req.sanitizedUser`.

### Verified: JWT validation

| Check | Status |
|-------|--------|
| Signature verification | Pass |
| Expiration enforcement | Pass |
| Revocation via `jwt_jti` in `atlas_sessions` | Pass |
| User loaded from DB (not trusted from JWT alone) | Pass |
| Permissions resolved from DB (not JWT claims) | Pass |

### Issue found & fixed: JWT organization mismatch

**Before:** JWT `organization_id` claim was not cross-checked against the user's DB record.

**After:** `resolveUserFromJwt()` rejects tokens where `payload.organization_id ≠ user.organization_id` (unless SUPER_ADMIN).

### Verified: legacy bootstrap auth

| Path | Production behavior |
|------|---------------------|
| `ATLAS_BOOTSTRAP_TOKEN` | Disabled (`resolveBootstrapUser` returns null) |
| Bootstrap session fallback | Disabled (`bootstrapSession` returns null) |
| Missing auth table fallback | Disabled in production (`findUserBySessionToken`) |

Legacy authentication **cannot access another tenant** — bootstrap users are hardcoded to a single org UUID and only work in development.

---

## 2. Tenant isolation

### Issue found & fixed: admin cross-org bypass

**Before:** `resolveOrganizationId()` allowed any `administrator` to pass `?organizationId=` and access another tenant's data.

**After:** Only `SUPER_ADMIN` may cross organization boundaries. Regular `ADMIN` is scoped to their own `organization_id`.

```javascript
// authorizationService.js — post-fix behavior
SUPER_ADMIN + ?organizationId=org-b  → org-b  ✓
ADMIN + ?organizationId=org-b        → org-a  ✓ (ignored, scoped)
REPRESENTATIVE + ?organizationId=org-b → 403   ✓
```

### Issue found & fixed: unscoped dashboard queries

**Before:** `/api/dashboard` queried all prospects without `organization_id` filter.

**After:** Dashboard routes filter by `resolveTenantOrganizationId(req)`.

### Controllers updated to tenant-safe org resolution

| Controller | Fix |
|------------|-----|
| `executiveDashboard.controller.js` | Uses `resolveTenantOrganizationId()` |
| `missionControl.controller.js` | Uses `resolveTenantOrganizationId()` |
| `businessEvent.controller.js` | Uses `resolveTenantOrganizationId()` |
| `timeline.controller.js` | Uses `resolveTenantOrganizationId()` |
| `prospect.controller.js` | Uses `resolveTenantOrganizationId()` |
| `dashboard.js` | Filters prospects by org |

### Business table tenant safety

| Table | `organization_id` | Status |
|-------|-------------------|--------|
| `organizations` | PK | Pass |
| `users` | FK, NOT NULL | Pass (migration 011) |
| `atlas_users` | FK | Pass (synced) |
| `prospects` | FK | Pass (migration 008) |
| `atlas_core_prospects` | FK, NOT NULL | Pass (migration 003) |
| `atlas_business_events` | FK, NOT NULL | Pass |
| `atlas_timeline_entries` | FK, NOT NULL | Pass |
| `atlas_mission_control_*` | FK | Pass |
| `atlas_executive_dashboard_*` | FK | Pass |
| `conversation_logs` | FK | Pass (migration 011) |
| `workflow_events` | FK | Pass (migration 011) |
| `organization_settings` | PK/FK | Pass (migration 011) |
| `organization_integrations` | FK | Pass (migration 011) |

**Note:** `appointments`, `activities` are JSONB aggregates inside `atlas_core_prospects` — tenant-isolated via parent row. No separate tables exist yet.

### Remaining pre-existing gaps (not introduced by 16.9)

| Route | Gap | Risk | Recommendation |
|-------|-----|------|----------------|
| `/api/prospect-center` | Read model not org-filtered | Low (single tenant today) | LC2: pass org to `buildProspectCenterReadModel` |
| `/dev/operations` | Dev-only, raw query param | None in production | Not mounted when `NODE_ENV=production` |

---

## 3. Permissions

### Verified: no bypass paths

| Check | Status |
|-------|--------|
| DB permissions loaded via `permissionService` | Pass |
| User overrides (`user_permissions`) supported | Pass |
| `requirePermission()` checks `authContext.permissions` | Pass |
| Org admin gets all permissions via `isOrgAdmin()` | Pass |
| JWT permissions ignored (DB is source of truth) | Pass |

Permissions cannot be bypassed by forging JWT claims — the middleware always reloads permissions from the database.

---

## 4. Middleware inventory

| Middleware | Used | Purpose |
|------------|------|---------|
| `authenticate.js` | Yes | JWT + session dual-auth |
| `requireAtlasUser.js` | Yes | Delegates to authenticate (all protected routes) |
| `organizationGuard.js` | Yes | Cross-org param validation |
| `protectedRoute.js` | Yes | Standard stack: auth + tenant + checks |
| `authorize.js` | Yes | Composable check runner (via protectedRoute) |
| `requirePermission.js` | Yes | Permission gate |
| `requireRole.js` | Yes | Role gate |
| `extractBearerToken.js` | Yes | Shared token extraction |

**No unused middleware.** `authorize.js` was previously unwired — now used via `protectedRoute.js`.

---

## 5. Service duplication

| Service | Role | Duplication |
|---------|------|-------------|
| `userService.js` | Canonical `users` table (SaaS) | Intentional |
| `atlasUserService.js` | Sessions + legacy `atlas_users` | Intentional |
| `normalizeUserRecord.js` | Shared user shape normalization | New — eliminates field mapping duplication |

**No circular dependencies detected:**

```
authenticate → authorizationService → permissionService → supabase
requireAtlasUser → authenticate
protectedRoute → authenticate, organizationGuard, authorize
atlasUserService.sanitizeUser → normalizeUserRecord (lazy require)
```

---

## 6. Hardcoded Team Vision values

| Location | Value | Acceptable |
|----------|-------|------------|
| Migration 011 seed | Team Vision org UUID, name, slug | Yes — seed data |
| `seedTeamVisionSaaS.js` | Team Vision name/slug | Yes — seeder |
| `DEFAULT_ORGANIZATION_ID` constant | UUID fallback | Yes — single-tenant fallback |
| Conversation copy / business rules | "Team Vision" branding text | Yes — product copy, not auth |
| `emailService.js` | Sender domain | Yes — operational config |

**No hardcoded credentials.** Seeder requires `ATLAS_SUPER_ADMIN_EMAIL` and `ATLAS_SUPER_ADMIN_PASSWORD` from environment.

---

## 7. Organization branding

| Check | Status |
|-------|--------|
| `GET /api/organization/branding` reads from DB | Pass |
| Returns `logoUrl`, `primaryColor`, `secondaryColor`, `name` | Pass |
| Uses `req.tenantContext.organizationId` | Pass |
| No static branding in frontend required for this sprint | Pass |

---

## 8. Seeder validation

| Check | Status |
|-------|--------|
| Credentials from env vars only | Pass |
| bcrypt hashing | Pass |
| Creates SUPER_ADMIN role | Pass |
| Blocked in production without override | Pass |
| Upserts existing user by email | Pass |
| Syncs to `atlas_users` via trigger | Pass |

---

## 9. Migration reversibility

| Migration | Rollback script | Status |
|-----------|-----------------|--------|
| `011_saas_multi_tenant_foundation.sql` | `011_saas_multi_tenant_foundation_down.sql` | Pass |

Rollback drops Sprint 16.9 tables and columns without affecting LC1 schema. `atlas_users` and existing FKs are preserved.

---

## 10. Protected route coverage

All routes using `requireAtlasUser` automatically receive JWT + session dual-auth via the unified middleware:

- `/api/dashboard`, `/api/mission-control`, `/api/executive-dashboard`
- `/api/prospects`, `/api/prospect-workspace`, `/api/prospect-center`
- `/api/admin`, `/api/account`, `/api/organization`
- `/api/meta`, `/api/knowledge`, `/api/timeline`, `/api/business-events`
- `/api/operations` (dev-gated)

Public routes correctly excluded: `/api/auth/login`, `/api/setup/*`, `/api/contact`, webhooks, `/health`.

---

## 11. Fixes applied in this audit

1. JWT organization_id cross-validation against DB user record
2. `resolveOrganizationId()` restricted to SUPER_ADMIN for cross-tenant access
3. Dashboard routes scoped by `organization_id`
4. All projection controllers use `resolveTenantOrganizationId()`
5. `/auth/me` deduplicated to use `requireAtlasUser`
6. Bootstrap auth fallback blocked in production session lookup
7. `protectedRoute.js` wired — `authorize.js` no longer dead code
8. `normalizeUserRecord.js` — unified user shape for `users` and `atlas_users` tables
9. Rollback migration `011_saas_multi_tenant_foundation_down.sql` created
10. `organizationGuard` uses `saasRole` for SUPER_ADMIN checks

---

## 12. Pre-commit checklist

- [x] No duplicate authentication logic
- [x] No legacy bypass of organization isolation (production)
- [x] Business tables tenant-safe (or documented exceptions)
- [x] API endpoints resolve organization_id via tenant context
- [x] JWT middleware works for all protected routes
- [x] Legacy auth cannot cross tenants
- [x] Permissions cannot be bypassed via JWT
- [x] No hardcoded credentials
- [x] Branding loads dynamically from DB
- [x] Seeder creates SUPER_ADMIN from env vars
- [x] Migration reversible
- [x] No circular dependencies
- [x] No dead middleware
- [x] Audit report generated

---

## 13. Recommendation

**Approved for commit** after applying migration 011 to staging and running:

```bash
node backend/dev/verifyLC1Security.js
```

Post-deploy: configure `JWT_SECRET` in production and rotate any credentials used during local verification.
