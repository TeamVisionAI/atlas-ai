# RC3 Financial Intelligence — Release Manifest

## Production status

```text
Production status: APPROVED WITH MINOR LIMITATIONS
```

Closeout: **2026-08-04**.  
RC4 planning may begin after the closeout commit is on `main`. RC4 implementation is not part of this release.

---

## Release identity

| Field | Value |
|-------|--------|
| Release branch | `release/rc3-financial-intelligence` (merged) |
| Implementation candidate | `600a0b6` |
| Operator docs / helpers baseline | `7478a39` |
| Release candidate tip | `d204d52` |
| Merge to `main` (RC3) | `1ab3165` |
| Production deploy SHA (operator record) | `4e49e6f` |
| Meta Review locker fix | `5159e8e` → merge `4e49e6f` |
| Print-layout fix | `b776305` → merge `355abec` |
| Migration | `025_financial_intelligence_strategy_evaluations.sql` |
| Backend route prefix | `/api/financial-intelligence` |
| Frontend surface | `/app/policy-intelligence` → Discussion scenarios tab |
| Capability name | Invest-the-Difference Strategy Evaluation |
| UI section title | Possible Discussion Scenarios for the Primerica Representative |

---

## Included commits (lineage)

```text
9278e0a  RC3 Phase A — FI foundation
600a0b6  RC3 Phase B — live API-backed runtime
7478a39  Production acceptance docs + migration helpers
959aa1f … d204d52  Release preparation
1ab3165  Merge RC3 release candidate to main (PR #1)
5159e8e / 4e49e6f  Meta Review locker session scope (PR #2)
b776305 / 355abec  FI discussion print layout (PR #3)
(+ RC3 closeout documentation commit)
```

---

## Explicitly not included

- Knowledge Hub unrelated local edits
- Appointment reminder / workflow runtime JSON
- Local credentials / `.env`
- Official Primerica quote integration
- Automated eligibility / fund catalog / suitability / native PDF

---

## Environment prerequisites (names only)

- `DATABASE_URL` (operator apply/verify helpers)
- `SUPABASE_URL` / service role as required by Atlas backend
- Railway backend env per `docs/08-operations/DEPLOYMENT_CHECKLIST.md`
- Vercel `VITE_API_BASE_URL` (production API host; not localhost)
- `VITE_ENABLE_INTERNAL_PREVIEWS` must not enable production demos
- `META_REVIEW_MODE` / `VITE_META_REVIEW_MODE` may remain enabled; locker is session-scoped via `meta_review_user`

---

## Test results

### Release preparation (clean candidate)

| Gate | Result |
|------|--------|
| `verifyFiMigration025.js` | Pass (structural) |
| FI + apply-helper safety tests | **35/35** |
| PI regression | **2/2** |
| Frontend tests (at candidate) | **65/65** → later **76/76** with locker + print tests |
| Frontend lint / build | Pass (pre-existing warnings only) |
| Offline backend suite | **280/282**; 2× `sprint19_1` Supabase DNS (environment) |

### Production probes (closeout)

| Probe | Result |
|-------|--------|
| `GET /health` | 200 healthy |
| `GET /health/production` | `mvpReady: true` |
| Unauthenticated FI | 401 |

---

## Production verification (summary)

- Migration 025 applied and schema verified  
- Backend/frontend deployed; FI registered  
- Admin full workspace; Meta Review account restricted  
- Live evaluation: `$173.00 − $116.92 = $56.08`; same-outlay passed  
- 25-year 4%/7%/10% projections; Moderate emphasis  
- History persisted across logout/login  
- Replacement safeguards + acknowledgement  
- Print: 4 pages, complete, no blank pages / clipped disclaimers  

Details: [RC3_PRODUCTION_ACCEPTANCE.md](./RC3_PRODUCTION_ACCEPTANCE.md)

---

## Known external / environment failures

- `sprint19_1` tenant tests may fail with Supabase DNS `ENOTFOUND` offline — not an FI production regression.

---

## Minor limitations

- Browser print headers/footers require disabling for cleaner output  
- Print spacing refinements deferred  
- PI extraction may still need manual fallback  
- Official quote integration, eligibility automation, verified fund catalog, suitability automation, native PDF deferred  

---

## Deferred capabilities (RC4+)

- Official Primerica quote integration  
- Automated product eligibility / longest-term selection  
- Verified mutual-fund catalog / fund recommendations  
- Suitability automation  
- Native PDF generation  
- Transaction / replacement execution  

---

## Rollback artifact references

- Prior frontend/backend deploy artifacts: Railway/Vercel operator records  
- Migration down SQL (non-production only): `025_financial_intelligence_strategy_evaluations_down.sql`  
- Default production rollback: redeploy prior app artifacts; **leave migration 025 in place** unless schema causes outage  

---

## Closeout

Production acceptance complete: **APPROVED WITH MINOR LIMITATIONS**.  
See [RC3_FINANCIAL_INTELLIGENCE_RELEASE_NOTES.md](../09-releases/RC3_FINANCIAL_INTELLIGENCE_RELEASE_NOTES.md).
