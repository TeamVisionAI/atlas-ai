# RC4 Milestone 1 — Firm-Verified Securities Access Foundation

**Status:** Implemented in production (migrations 026/027 applied; Phase A authority active)
**Business rule:** [BR-074](../06-business/BUSINESS_RULES.md#br-074--firm-verified-securities-content-access)
**Bootstrap:** [SECURITIES_ACCESS_BOOTSTRAP.md](./SECURITIES_ACCESS_BOOTSTRAP.md)
**Catalog gate:** `backend/security/verifiedFundCatalogGate.js`

## Purpose

Prevent named securities content from being exposed based on Atlas role or insurance license. Only firm-verified `VERIFIED_ACTIVE` authorization unlocks securities-specific content. Generic Invest-the-Difference 4% / 7% / 10% illustrations remain available without named securities.

**Current-release boundary:** `VERIFIED_ACTIVE` authorizes access to approved securities content, but **no named fund catalog is approved or active in the current release.** Placeholder example symbols (e.g. FELAX / VAFAX) must never be returned from live APIs, print/export, UI, or AI retrieval until an authoritative catalog milestone activates `canExposeVerifiedFundCatalog()`.

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
- `canExposeVerifiedFundCatalog()` — release readiness for named fund catalog (requires `canAccessSecuritiesContent` **and** an approved active catalog version). Fail closed in the current release.

Neither capability implies the other. Admin / SUPER_ADMIN wildcards do not satisfy verify. Securities authorization alone does **not** expose placeholder or unapproved fund catalogs.

## Initial authority bootstrap

When no verifier exists, use the controlled ops script (not HTTP):

- Service: `backend/security/securitiesInitialAuthorityBootstrapService.js`
- Script: `backend/scripts/bootstrapInitialSecuritiesAuthority.js`
- Lock table: `atlas_organization_securities_authority_bootstrap` (migration 027)
- Procedure: [SECURITIES_ACCESS_BOOTSTRAP.md](./SECURITIES_ACCESS_BOOTSTRAP.md) Phase A

## Localization note (RC4 M1.1)

Report language (English / Spanish) is presentation-only. Changing language does **not** grant securities access, alter authorization status, or expose fund catalog / SB-72 content. BR-074 enforcement remains independent of UI language.

## Out of scope (this milestone)

SB-72 upload/parse, authoritative fund catalog UI, model portfolios, Content Center, quote evidence, suitability, FINRA/CRD integration, native PDF, PI OCR, automated CRD/BrokerCheck queries.

Internal non-production placeholder fund examples may remain in source for future development (`fundFamilyConfig.js`) but are explicitly **not** production-authorized catalog entries and must not appear in live contracts.
