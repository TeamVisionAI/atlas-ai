# Production Security Checklist

Complete before granting production access to Team Vision recruiters.

## Environment

- [ ] `NODE_ENV=production` on backend
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY` set
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set (LC1 — backend writes with RLS enabled)
- [ ] `META_APP_SECRET` set (webhook signatures enforced)
- [ ] `VERIFY_TOKEN` set (WhatsApp webhook verification)
- [ ] `FACEBOOK_LEAD_VERIFY_TOKEN` or `META_VERIFY_TOKEN` set
- [ ] WhatsApp send credentials configured (Embedded Signup or env tokens)
- [ ] All four `GOOGLE_*` calendar variables set
- [ ] `OPENAI_API_KEY` set (AI replies)
- [ ] `VITE_API_BASE_URL` points to production API (frontend build)
- [ ] `ATLAS_CORS_ORIGINS` lists production frontend origin(s) only
- [ ] `VITE_ATLAS_BOOTSTRAP_TOKEN` **not** set in production frontend build
- [ ] `ATLAS_BOOTSTRAP_TOKEN` **not** used in production backend
- [ ] `ATLAS_INTERNAL_SERVICE_SECRET` set if internal lead path used
- [ ] `TEAM_VISION_ZOOM_INTERVIEW_URL` set for interview actions

## Authentication (LC1)

- [ ] Migration `008_lc1_security_foundation.sql` applied
- [ ] `seedAtlasUsers.js` run with production passwords (not dev default)
- [ ] Each recruiter has individual `atlas_users` row with `password_hash`
- [ ] Bootstrap `/api/auth/session` removed — login via `/api/auth/login`
- [ ] All PII routes require Bearer session token
- [ ] Frontend login page used (`/app/login`)
- [ ] Session revocation works (`POST /api/auth/logout`)

## Webhooks

- [ ] WhatsApp webhook verified in Meta dashboard
- [ ] Facebook Lead webhook verified with correct token
- [ ] Test forged POST rejected (signature / secret)
- [ ] `/health/production` returns `mvpReady: true`

## Authorization (LC1)

- [ ] `requireAtlasUser` attaches `authContext` on all protected routes
- [ ] Prospect access scoped by organization + role (`requireProspectAccess`)
- [ ] Operations role cannot read/write prospects
- [ ] Executive dashboard requires `dashboard:executive` permission
- [ ] Meta Embedded Signup requires authenticated user
- [ ] Operations Center requires `operations` or `administrator` role

## RLS (LC1)

- [ ] RLS enabled on `prospects`, `atlas_core_prospects`, `atlas_users`, `atlas_sessions`, `atlas_audit_log`
- [ ] Anon policies deny direct reads
- [ ] Backend uses service role key

## Privacy

- [ ] Production logs reviewed for PII leakage
- [ ] Mock queue data disabled in production UI
- [ ] Privacy policy and data deletion URLs live
- [ ] Support role receives masked phone/email in API responses

## Verification commands

```bash
node backend/dev/environment/applyAtlasCoreMigrations.js
node backend/dev/environment/seedAtlasUsers.js
node backend/dev/verifyLC1Security.js
ATLAS_TEST_BASE_URL=https://your-api node backend/dev/verifyLC1Security.js
```

See [LAUNCH_CANDIDATE_SECURITY_REPORT.md](./LAUNCH_CANDIDATE_SECURITY_REPORT.md) for full LC1 validation matrix.
