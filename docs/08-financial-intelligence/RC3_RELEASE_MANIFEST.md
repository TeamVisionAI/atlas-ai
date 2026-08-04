# RC3 Financial Intelligence — Release Manifest

## Production status

```text
Production status: NOT APPROVED
```

RC3 remains **NOT APPROVED** until live production acceptance is completed with backup, migration, deploy, and end-to-end evidence.

RC4 planning and development remain **frozen**.

---

## Release identity

| Field | Value |
|-------|--------|
| Release branch | `release/rc3-financial-intelligence` |
| Implementation candidate | `600a0b6` |
| Operator docs / helpers baseline | `7478a39` |
| Release preparation SHA | `959aa1f77eaec152f49f4c59fe4d282761f886fe` |
| Release candidate SHA | Tip of `release/rc3-financial-intelligence` (see completion report / `git rev-parse HEAD`) |
| Migration | `025_financial_intelligence_strategy_evaluations.sql` |
| Backend route prefix | `/api/financial-intelligence` |
| Frontend surface | `/app/policy-intelligence` → Discussion scenarios tab |
| Capability name | Invest-the-Difference Strategy Evaluation |
| UI section title | Possible Discussion Scenarios for the Primerica Representative |

---

## Included commits

```text
9278e0a  RC3 Phase A — FI foundation
600a0b6  RC3 Phase B — live API-backed runtime
7478a39  Production acceptance docs + migration helpers
959aa1f  Release preparation — safer gates + manifest
```

History from Phase A through release prep:

```text
9278e0a → 600a0b6 → 7478a39 → 959aa1f
```

---

## Explicitly not included

- Knowledge Hub unrelated local edits
- Appointment reminder runtime JSON
- Workflow state runtime JSON
- Local credentials / `.env`
- Official Primerica quote integration
- Automated eligibility / fund catalog / suitability / PDF

---

## Environment prerequisites (names only)

- `DATABASE_URL` (operator apply/verify helpers)
- `SUPABASE_URL` / service role as required by Atlas backend
- Railway backend env per `docs/08-operations/DEPLOYMENT_CHECKLIST.md`
- Vercel `VITE_API_BASE_URL` (production API host; not localhost)
- `VITE_ENABLE_INTERNAL_PREVIEWS` must not enable production demos

---

## Test results (release preparation)

Recorded at release-prep time on the clean release branch — see completion report for exact numbers.

Expected gates:

- FI unit/service/contract/safety tests — pass
- PI regression — pass
- Frontend tests — pass
- Frontend lint — no new blockers
- Frontend production build — pass
- Offline-capable backend suite — pass (network DNS failures reported separately)

---

## Known external / environment failures

- `sprint19_1` tenant tests may fail with Supabase DNS `ENOTFOUND` when network resolution fails — environment-dependent, not an FI code regression.

---

## Deferred capabilities (RC4+)

- Official Primerica quote integration
- Automated product eligibility / longest-term selection
- Verified mutual-fund catalog / fund recommendations
- Suitability automation
- PDF generation
- Transaction / replacement execution

---

## Rollback artifact references

- Prior frontend/backend deploy artifacts: operator records from Railway/Vercel
- Migration down SQL (non-production only): `025_financial_intelligence_strategy_evaluations_down.sql`
- Default production rollback: redeploy prior app artifacts; **leave migration 025 in place** unless schema causes outage

---

## Operator handoff

1. Confirm backup gate fields in `RC3_PRODUCTION_ACCEPTANCE.md`
2. Push/merge this branch per repository policy
3. Apply migration 025 only after backup
4. Deploy backend, then frontend
5. Complete live acceptance checklist
6. Update this manifest Production status only when live acceptance passes
