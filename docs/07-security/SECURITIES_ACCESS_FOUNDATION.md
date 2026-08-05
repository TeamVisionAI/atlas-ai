# RC4 Milestone 1 — Firm-Verified Securities Access Foundation

**Status:** Implemented (pending production migration + verifier bootstrap)
**Business rule:** [BR-074](../06-business/BUSINESS_RULES.md#br-074--firm-verified-securities-content-access)
**Bootstrap:** [SECURITIES_ACCESS_BOOTSTRAP.md](./SECURITIES_ACCESS_BOOTSTRAP.md)

## Purpose

Prevent named securities content from being exposed based on Atlas role or insurance license. Only firm-verified `VERIFIED_ACTIVE` authorization unlocks securities-specific content. Generic Invest-the-Difference 4% / 7% / 10% illustrations remain available without named securities.

## Components

| Component | Location |
|-----------|----------|
| Migration | `backend/database/migrations/026_securities_access_authorization.sql` |
| Explicit verify resolver | `backend/security/explicitUserPermissionService.js` |
| Capability authority | `backend/security/securitiesAccessService.js` |
| Content class enums | `backend/security/contentAccessClassification.js` |
| Middleware | `backend/middleware/requireSecuritiesContentAccess.js` |
| Probe + admin API | `backend/routes/securitiesAccess.js` |
| Session contract | `GET /api/auth/me` capabilities |
| Admin UI | `frontend/src/pages/identity/AdminUsers.jsx` |

## Capability split

- `capabilities.canAccessSecuritiesContent` — runtime evaluation of the user’s own authorization row
- `capabilities.canVerifySecuritiesAuthorization` — explicit `user_permissions` grant of `securities:verify` only

Neither implies the other. Admin / SUPER_ADMIN wildcards do not satisfy verify.

## Initial authority bootstrap

When no verifier exists, use the controlled ops script (not HTTP):

- Service: `backend/security/securitiesInitialAuthorityBootstrapService.js`
- Script: `backend/scripts/bootstrapInitialSecuritiesAuthority.js`
- Lock table: `atlas_organization_securities_authority_bootstrap` (migration 027)
- Procedure: [SECURITIES_ACCESS_BOOTSTRAP.md](./SECURITIES_ACCESS_BOOTSTRAP.md) Phase A

## Out of scope (this milestone)

SB-72 upload/parse, fund catalog UI, model portfolios, Content Center, quote evidence, suitability, FINRA/CRD integration, native PDF, PI OCR, automated CRD/BrokerCheck queries.
