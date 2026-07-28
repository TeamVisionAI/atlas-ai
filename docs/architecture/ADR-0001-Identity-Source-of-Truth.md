# ADR-0001: Identity Source of Truth and IdentityWriteService

**Status:** Accepted  
**Date:** 2026-07-28  
**Sprint:** 19 — Tenant isolation and identity hardening

---

## Context

Atlas currently maintains two user tables:

| Table | Origin | Role today |
|-------|--------|------------|
| `atlas_users` | LC1 / LC1.1 legacy identity | Operational source of truth for login, admin, profile, sessions, and ~15 FK relationships |
| `users` | Sprint 16.9 SaaS foundation (migration `011`) | Canonical SaaS identity (aspirational), JWT lookup anchor, permission override FKs |

Migration `011` introduced `users` as the long-term canonical model and backfilled from `atlas_users`. A database trigger (`trg_sync_atlas_users_from_users`) keeps `atlas_users` updated when `users` changes.

However, **most runtime write paths still modified `atlas_users` directly** — login, admin CRUD, profile edits, password changes, invitation acceptance — without syncing back to `users`. This asymmetry caused identity drift, including the Sprint 19.1 bug where Administration → Users returned zero records because `authContext.organizationId` (from `users`/JWT) did not match `atlas_users.organization_id`.

Examples of drift:

- `support@teamvisionfinancial.com` existed in `atlas_users` but the paired `users` row had a different email for the same UUID.
- Password and status changes updated `atlas_users` only.
- Bootstrap and LC1 seeds created `atlas_users` rows with no corresponding `users` row.

---

## Decision

### 1. Both tables remain required (for now)

We will **not** drop `atlas_users` or repoint foreign keys in Sprint 19. LC1 domain tables (`prospects`, `atlas_sessions`, `atlas_invitation_tokens`, etc.) still reference `atlas_users(id)`. Consolidation is a multi-phase migration (see Future Work).

### 2. Single write path: `IdentityWriteService`

**All identity mutations MUST go through `backend/services/identityWriteService.js`.**

No other service, route, or middleware may insert or update `atlas_users` or `users` directly. Reads may continue through `atlasUserService`, `userService`, and auth middleware.

`IdentityWriteService` responsibilities:

| Operation | Method |
|-----------|--------|
| Create user | `createUser()` |
| Update user (admin) | `updateUser()` |
| Change email | `changeEmail()` |
| Change password | `changePassword()` |
| Invitation acceptance | `acceptInvitation()` |
| Password reset completion | `confirmPasswordReset()` |
| Suspend / reactivate / archive | `setUserStatus()` |
| Profile updates | `updateProfile()` |
| Profile photo URL | `updatePhotoUrl()` |
| Last login timestamp | `recordLastLogin()` |
| Drift repair (dev/ops) | `repairIdentityFromAtlas()` |
| Consistency check | `verifyIdentityConsistency()` |

Each mutation:

1. Writes to `atlas_users` (operational source of truth for field values).
2. Upserts the paired row in `users` using `buildUsersRowFromAtlasUser()` mapping.
3. Uses a **PostgreSQL transaction** when `DATABASE_URL` or `SUPABASE_DB_PASSWORD` is available; otherwise performs sequential Supabase writes (atlas first, then users).

Transfer ownership modifies prospect assignment, not identity rows, and remains outside this service.

### 3. Source of truth by responsibility

| Concern | Authoritative store | Notes |
|---------|---------------------|-------|
| **Authentication** (login, password verify) | `atlas_users.password_hash`, `atlas_users.status` | Login reads `atlas_users` only |
| **Sessions** | `atlas_sessions.user_id` → `atlas_users.id` | JWT `jti` stored in `atlas_sessions` |
| **organization_id** (workspace membership) | `atlas_users.organization_id` | Resolved via `tenantOrganization.resolveWorkspaceOrganizationId()` |
| **Roles** (runtime RBAC) | `atlas_users.role` (legacy codes) | Mapped to SaaS codes in `users.role` on sync |
| **Profile** | `atlas_users` | `first_name`, `last_name`, `phone`, `photo_url`, `profile_settings`, etc. — not in `users` schema |
| **Permissions** (DB-backed) | `role_permissions`, `user_permissions` | Overrides FK → `users.id`; role derived from merged auth user |
| **Prospect/agent ownership FKs** | `atlas_users.id` | Unchanged until FK migration phase |

**Write rule:** `atlas_users` values are authoritative; `users` is derived on every write.

**Read rule:** Auth middleware merges `atlas_users` over `users` (`mergeAtlasUserProfile` in `authenticate.js`) so runtime context reflects operational truth.

### 4. Sync direction

```
IdentityWriteService
  → UPDATE/INSERT atlas_users
  → UPSERT users (from atlas row)

users table trigger (migration 011, retained)
  → sync_atlas_users_from_users
  → Keeps legacy FK targets updated when writes originate from SaaS seed paths
```

When both paths are active, writes through `IdentityWriteService` are idempotent: atlas is written first with full field values; users upsert follows; the trigger re-applies the same core fields to `atlas_users` without clobbering atlas-only columns (`phone`, `photo_url`, `profile_settings`).

**Status preservation:** The `users.is_active` boolean cannot represent all LC1 statuses (`pending_invitation`, `archived`, `disabled`). The DB trigger maps `is_active = false` to `suspended`. After every `users` upsert, `IdentityWriteService` re-applies the original `atlas_users.status` when the trigger overwrites it.

---

## Consequences

### Positive

- Eliminates future identity drift between `atlas_users` and `users`.
- Single auditable location for identity mutation logic.
- `verifyIdentityConsistency.js` can detect and repair historical drift.
- Preserves multi-tenant architecture and all existing FK relationships.

### Negative / trade-offs

- Every identity write performs two table operations (acceptable until consolidation).
- Supabase-only environments without direct Postgres access use sequential writes rather than a true SQL transaction.
- Dev seed scripts (`seedAtlasUsers`, `performBootstrapInstall`) still use raw SQL; they should migrate to `IdentityWriteService` in a follow-up.

### Verification

Run after any identity-related change:

```bash
node backend/dev/verifyIdentityConsistency.js --repair
node backend/dev/verifyIdentityConsistency.js
node backend/dev/verifyInvitationFlow.js
node backend/dev/verifyAdminUsersList.js
```

---

## Future Work — Single canonical `users` table

**Phase 1 (complete in Sprint 19):** Mandatory `IdentityWriteService`; stop drift.

**Phase 2:** Extend `users` schema with profile columns (or add `user_profiles` 1:1). Route all reads through `users` first.

**Phase 3:** Repoint LC1 foreign keys from `atlas_users(id)` to `users(id)` (same UUIDs — no data movement).

**Phase 4:** Retire `atlas_users`, remove merge logic and dual-table sync, drop `sync_atlas_users_from_users` trigger.

Estimated blast radius: ~25 backend services, 8+ migration FK definitions, auth routes, frontend role checks.

---

## References

- `backend/services/identityWriteService.js`
- `backend/services/userIdentitySyncService.js` (mapping helpers; writes delegate to IdentityWriteService)
- `backend/database/migrations/011_saas_multi_tenant_foundation.sql`
- `backend/core/tenantOrganization.js`
- `docs/architecture/SAAS_MULTI_TENANT_FOUNDATION.md`
- Sprint 19.1 Admin Users org-scope fix (`identityAdminService`, `verifyAdminUsersList.js`)
