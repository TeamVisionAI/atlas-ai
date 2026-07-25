# Atlas Security Charter

## Mission

Protect every prospect's personally identifiable information (PII) and every recruiter's operational data while Atlas transitions from development to production for Team Vision.

## Principles

1. **Privacy by Design** — Collect minimum data, expose minimum surface, retain only as long as required.
2. **Least Privilege** — Users, services, and integrations receive only the access they need.
3. **Defense in Depth** — Authentication, authorization, network controls, logging, and monitoring overlap.
4. **Fail Closed** — Missing configuration in production must deny access, not degrade to open endpoints.
5. **Accountability** — Security-relevant actions must be attributable to a user or integration.

## Scope

This charter applies to:

- Atlas backend APIs and webhooks
- Atlas frontend (Mission Control, Prospect Center, Quick Capture, integrations)
- Supabase data stores
- Meta (WhatsApp, Facebook Lead Ads, Embedded Signup)
- Google Calendar
- Operations Center (internal engineering tooling)

## Ownership

| Area | Owner |
|------|-------|
| Application security | Atlas Engineering |
| Privacy & PII policy | Atlas Engineering + Team Vision Operations |
| Infrastructure secrets | Platform / DevOps |
| Meta app review compliance | Integrations lead |

## Non-goals

This charter does **not** authorize new product features. Security work remediates exposure, access, and compliance gaps only.

## Production gate

Atlas must not be offered to production recruiters until:

- Individual recruiter authentication via email/password (`POST /api/auth/login`) — **LC1 implemented**
- RBAC middleware on all PII routes — **LC1 implemented**
- Supabase RLS enabled with anon deny policies — **LC1 implemented**
- [PRODUCTION_SECURITY_CHECKLIST.md](./PRODUCTION_SECURITY_CHECKLIST.md) completed for LC1 scope
- See [LAUNCH_CANDIDATE_SECURITY_REPORT.md](./LAUNCH_CANDIDATE_SECURITY_REPORT.md)
