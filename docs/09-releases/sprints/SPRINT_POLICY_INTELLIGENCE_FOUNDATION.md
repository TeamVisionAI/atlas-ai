# Sprint — Policy Intelligence Foundation

## AI Summary

Delivers the Policy Intelligence module foundation: Business sidebar entry, `/app/policy-intelligence` workspace, RBAC (`policy:read` / `policy:write`), `atlas_policy_reviews` / `atlas_policy_documents` migrations, placeholder dashboard, and foundation API. Explicitly excludes AI, OCR, and extraction (BR-051).

## Purpose

Stand up Atlas architecture surfaces for Policy Intelligence before document intelligence features ship.

## Status

Implemented — Foundation

## Business Rules

- BR-051 — Policy Intelligence Foundation

## Scope

### In

- Sidebar nav item (Business core, permission-gated)
- Frontend route + legacy redirect
- Workspace placeholder dashboard
- `policy:read` / `policy:write` in FE/BE matrices + DB seed
- SQL migration 021 + down script
- Thin module at `backend/modules/policy-intelligence`
- Architecture + RBAC documentation

### Out

- Document upload
- OCR / AI / extraction
- Review workflow UI beyond empty state
- Storage bucket provisioning

## Technical Notes

| Area | Change |
|------|--------|
| Nav / access | `workspaceExperience.js` |
| Page | `PolicyIntelligence.jsx` |
| API | `GET /api/policy-intelligence` |
| Migration | `021_policy_intelligence_foundation.sql` |

## API

`GET /api/policy-intelligence` — foundation summary (`policy:read`).

## Database

See migration 021. Aggregates: PolicyReview, PolicyDocument.

## Related Documents

- [POLICY_INTELLIGENCE.md](../../04-architecture/policy-intelligence/POLICY_INTELLIGENCE.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)
- [RBAC_MODEL.md](../../security/RBAC_MODEL.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-03 | Foundation-only sprint; defer AI/OCR/extraction |
