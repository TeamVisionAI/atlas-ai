# Financial Intelligence — Live Runtime Workflow (RC3 Phase B)

## Phase distinction

| Milestone | Status |
|-----------|--------|
| RC3 Phase A | Foundation engines, persistence, APIs, preview UI |
| **RC3 Phase B** | **Live API-backed Discussion scenarios — production accepted** |
| RC3 production | **APPROVED WITH MINOR LIMITATIONS** (2026-08-04) |
| RC4 | Planning may begin after closeout push; implementation not started |

## Canonical calculation authority

**Backend only.** The frontend formats and displays the API contract. It must not compute invest-the-difference math, projections, status, or warnings.

Preview demonstration builders live under `frontend/src/lib/financial-intelligence/preview/` and must not be imported by `FinancialIntelligencePanel`.

## Live workflow

```text
Policy Intelligence review (reviewId)
→ Create Discussion Scenario
→ POST /api/financial-intelligence/evaluations { reviewId }
→ Backend reads PI Facts via adapter → CurrentIulSnapshot → persist v1
→ Frontend GET …/evaluations/latest
→ Representative enters term quote / horizon / risk / replacement
→ Backend creates immutable revisions
→ Frontend displays returned revision (no local recalculation)
```

## Empty state

When no evaluation exists:

> No Financial Intelligence strategy evaluation has been created for this policy review.

Authorized users may **Create Discussion Scenario**. Term quote is not required for v1.

## UI surface

Live: `/app/policy-intelligence` → **Discussion scenarios** tab → `FinancialIntelligencePanel` with real `selectedReviewId`.

Preview (demo only): gated by `VITE_ENABLE_INTERNAL_PREVIEWS=true` and non-production. Fixtures are labeled demonstration data and never fall back into the live panel.

## Revision lifecycle

Material changes (term quote, horizon, risk profile, replacement acknowledgement, override) create a new version and mark the prior `SUPERSEDED`. History remains retrievable. Current revision: `isCurrentVersion === true`.

## Preliminary estimate

`PRELIMINARY_ESTIMATE` displays:

> Preliminary planning estimate — not an official Primerica quote.

It must not confirm eligibility, longest term, or client-discussion readiness.

## Migration 025

Verify with:

```bash
node backend/dev/verifyFiMigration025.js
```

Tenant isolation is application-level (`organization_id` on every query). Optional `prospect_id` stays outside PI Facts/shared reports. Review delete cascades FI rows intentionally.

## Production deployment sequence

See full gate status and operator checklist:

**[RC3_PRODUCTION_ACCEPTANCE.md](./RC3_PRODUCTION_ACCEPTANCE.md)** · **[RC3_RELEASE_MANIFEST.md](./RC3_RELEASE_MANIFEST.md)** · **[Release notes](../09-releases/RC3_FINANCIAL_INTELLIGENCE_RELEASE_NOTES.md)**

Current production acceptance status: **APPROVED WITH MINOR LIMITATIONS**.

Production sequence completed:

1. Backup/snapshot recorded by operator before migration 025  
2. Migration 025 applied and schema verified  
3. Backend deployed (operator record `4e49e6f`; lineage includes `1ab3165`) → health + unauthenticated FI → 401  
4. Frontend deployed; Discussion scenarios live  
5. Meta Review locker scoped to dedicated review sessions (`5159e8e`)  
6. Live evaluation accepted (formula, projections, risk emphasis, history, replacement)  
7. Print layout fix (`b776305`) — complete 4-page print without blank pages  

Helpers (historical; do not re-apply migration 025 in production unless intentionally rebuilding an empty schema):

```bash
CONFIRM_FI_MIGRATION_025=yes node -r dotenv/config backend/dev/applyFiMigration025.js
node -r dotenv/config backend/dev/verifyFiProductionSchema.js
```

## Rollback

1. Redeploy prior frontend/backend artifacts (prefer leaving migration 025 in place)  
2. Optionally hide FI Discussion scenarios entry if needed  
3. Down migration SQL is for controlled **non-production** rollback after backup only  
4. Do not edit applied migration history in production — add a new corrective migration instead  
5. Confirm Policy Intelligence remains operational after application rollback  
