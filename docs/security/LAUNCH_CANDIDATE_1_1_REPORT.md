# Launch Candidate 1.1 — Identity Management Report

**Date:** 2026-07-24  
**Scope:** User administration, invitations, self-service, password recovery, session management  
**Status:** Implemented

---

## Executive summary

LC1.1 completes the identity lifecycle on top of LC1 security foundation. Administrators can create and manage Team Vision users without ever setting or viewing passwords. Users receive secure invitation and password-reset emails, manage their own profile and sessions, and all lifecycle events are audit logged.

No recruiting functionality was changed.

---

## Identity architecture

```
Administrator
  → POST /api/admin/users (pending_invitation)
  → atlas_invitation_tokens + Resend email
  → User opens /app/accept-invitation?token=…
  → POST /api/auth/invitation/accept (password)
  → status=active + session

User (self-service)
  → GET/PATCH /api/account/profile
  → POST /api/account/password/change
  → GET /api/account/sessions
  → POST /api/account/sessions/logout-all

Password recovery
  → POST /api/auth/password-reset/request (email)
  → POST /api/auth/password-reset/confirm (one-time token)
```

RBAC from LC1 is unchanged. Admin routes require `admin:users` permission (administrator role only).

---

## Invitation flow

1. Administrator creates user with role, organization, optional division/reports-to.
2. Default status: `pending_invitation`.
3. Atlas generates a 7-day invitation token (SHA-256 stored; raw token emailed only).
4. Email: “Welcome to Atlas — Create Your Password” with link to `/app/accept-invitation?token=…`.
5. User sets password; token marked `used_at`; account becomes `active`.
6. Administrator never sees or sets the password.

Resend: `POST /api/admin/users/:id/resend-invitation`

---

## Password recovery flow

1. User requests reset via `/app/forgot-password` → `POST /api/auth/password-reset/request`.
2. One-time token (1 hour TTL) emailed with link to `/app/reset-password?token=…`.
3. User submits new password → `POST /api/auth/password-reset/confirm`.
4. Token marked used; audit + login history recorded.
5. Administrators can force reset via `POST /api/admin/users/:id/force-password-reset` (triggers same email flow).

Administrators cannot view, download, or recover passwords.

---

## Database changes (Migration 009)

**File:** `backend/database/migrations/009_identity_management.sql`

| Change | Purpose |
|--------|---------|
| `atlas_users` profile columns | phone, photo_url, reports_to_user_id, notification_preferences, timezone, preferred_language, last_login_at, archived_at |
| `atlas_sessions` metadata | ip_address, user_agent, device_label |
| `atlas_invitation_tokens` | Secure invitation storage |
| `atlas_login_history` | Login lifecycle events |
| RLS deny-anon on new tables | Defense in depth |

Apply:

```bash
node backend/dev/environment/applyAtlasCoreMigrations.js
```

---

## User statuses

| Status | Can login | Notes |
|--------|-----------|-------|
| `pending_invitation` | No | Awaiting password creation |
| `active` | Yes | Normal operation |
| `suspended` | No | Temporary block |
| `archived` | No | Retained for audit/reporting |
| `disabled` | No | Legacy compatibility |

---

## API endpoints

### Administration (`/api/admin` — requires `admin:users`)

| Method | Path | Action |
|--------|------|--------|
| GET | `/users` | List/search/filter/paginate |
| POST | `/users` | Create user + send invitation |
| GET | `/users/:id` | Get user |
| PATCH | `/users/:id` | Edit user / role |
| POST | `/users/:id/suspend` | Suspend |
| POST | `/users/:id/reactivate` | Reactivate |
| POST | `/users/:id/archive` | Archive + revoke sessions |
| POST | `/users/:id/force-password-reset` | Email reset link |
| POST | `/users/:id/force-logout` | Revoke all sessions |
| POST | `/users/:id/resend-invitation` | Resend invite email |
| POST | `/users/:id/transfer-ownership` | Transfer prospects |
| GET | `/users/:id/login-history` | Login + audit events |

### Self-service (`/api/account`)

| Method | Path | Action |
|--------|------|--------|
| GET | `/profile` | View profile |
| PATCH | `/profile` | Update name, phone, timezone, preferences |
| POST | `/password/change` | Change password (requires current) |
| GET | `/sessions` | Active sessions |
| POST | `/sessions/logout-current` | Revoke current session |
| POST | `/sessions/logout-all` | Revoke all sessions |

### Public auth extensions

| Method | Path | Action |
|--------|------|--------|
| POST | `/auth/password-reset/confirm` | Complete password reset |
| GET | `/auth/invitation/validate` | Validate invitation token |
| POST | `/auth/invitation/accept` | Accept invitation + login |

---

## UI added

| Route | Page | Purpose |
|-------|------|---------|
| `/app/admin/users` | `AdminUsers.jsx` | User administration |
| `/app/my-account` | `MyAccount.jsx` | Profile, security, sessions |
| `/app/forgot-password` | `ForgotPassword.jsx` | Request reset |
| `/app/reset-password` | `ResetPassword.jsx` | Set new password |
| `/app/accept-invitation` | `AcceptInvitation.jsx` | Create password from invite |

Navigation: **My Account** (all users), **Administration — Users** (administrator only).

---

## Audit coverage

| Event | Action code |
|-------|-------------|
| User created | `user.created` |
| Invitation sent | `user.invitation_sent` |
| Invitation accepted | `user.invitation_accepted` |
| Profile updated | `user.profile_updated` |
| Password changed | `user.password_changed` |
| Password reset requested | `auth.password_reset_requested` |
| Password reset completed | `auth.password_reset_completed` |
| Forced reset | `user.password_reset_forced` |
| User suspended | `user.suspended` |
| User reactivated | `user.reactivated` |
| User archived | `user.archived` |
| Role changed | `user.role_changed` |
| Ownership transferred | `user.ownership_transferred` |
| Session revoked | `user.session_revoked` |
| Login success/failure | `auth.login` / `auth.login_failed` + `atlas_login_history` |

---

## Ownership transfer

`POST /api/admin/users/:id/transfer-ownership` updates:

- Legacy `prospects`: `owner_user_id`, `created_by_user_id`
- Core `atlas_core_prospects`: `owner_user_id`, `assigned_agent_id`

Scoped to administrator's organization. Appointments/tasks in JSONB fields follow prospect records.

---

## Remaining risks

| Risk | Severity | Notes |
|------|----------|-------|
| Email delivery requires `RESEND_API_KEY` | Medium | Dev mode logs only |
| Division/reports-to picker UI minimal | Low | IDs accepted; division admin UI future work |
| Photo upload not implemented | Low | Field ready (`photo_url`) |
| Notification preferences schema only | Low | Stored JSONB; no delivery engine |
| Paginated admin list client-side filters | Low | Server supports pagination; UI uses limit 50 |
| Tasks table not separate | Low | Ownership transfer covers prospect/agent assignment |

---

## Definition of done

- Administrator: create, invite, assign roles, suspend, archive, transfer ownership, force reset/logout
- Users: create password (invite), login, logout, forgot/change password, manage profile, view sessions
- LC1 security architecture unchanged (RBAC, RLS, audit foundation intact)

---

## Part 0 — Platform bootstrap

First-time installation when no users exist:

| Step | Behavior |
|------|----------|
| Detection | `GET /api/setup/status` → `{ setupRequired: true }` when no users and setup not completed |
| Wizard | `/app/setup` — organization name, owner name/email, password |
| Result | Creates organization owner + administrator, marks `atlas_platform_settings.setup_completed_at`, logs in |
| Disable | Wizard permanently unavailable after first administrator (`POST /api/setup/complete` returns 403) |

**Migration:** `010_platform_bootstrap.sql` — platform settings, org owner, removes unactivated placeholder users.

**Production:** `seedAtlasUsers` disabled in production; `applyAtlasCoreMigrations` skips user seed when `NODE_ENV=production`.

**Development:** Seed users (`ana@`, `niovel@`, etc.) only via `seedAtlasUsers.js` in non-production environments.
