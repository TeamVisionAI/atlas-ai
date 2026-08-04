# Financial Intelligence — Live Runtime Workflow (RC3 Phase B)

## Phase distinction

| Milestone | Status |
|-----------|--------|
| RC3 Phase A | Foundation engines, persistence, APIs, preview UI |
| **RC3 Phase B** | **Live API-backed Executive Review integration** |
| RC4 | Deferred: official quotes, eligibility, verified funds, suitability, PDF |

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

1. Snapshot / backup per ops practice  
2. Apply migration 025 (or corrective migration if already applied with defects)  
3. Deploy backend FI routes  
4. Verify health + authenticated FI API  
5. Deploy frontend connected Discussion scenarios tab  
6. Create evaluation from org-owned PI review  
7. Enter term quote + horizon  
8. Confirm backend projections + history  
9. Confirm cross-tenant isolation + PI Facts unchanged  
10. Confirm print; confirm preview fixtures unavailable in production  

## Rollback

1. Redeploy prior frontend/backend artifacts  
2. Optionally run `025_financial_intelligence_strategy_evaluations_down.sql` in non-production only after backup  
3. Do not edit applied migration history in production — add a new corrective migration instead  
