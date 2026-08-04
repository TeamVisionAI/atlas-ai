# Sprint RC3 — Invest-the-Difference Strategy Evaluation Foundation

## Status

**IMPLEMENTED** — RC3 Phase A (runtime foundation)

## Summary

Builds the first Financial Intelligence runtime capability under the approved RC2 architecture:

- Financial Intelligence module foundation
- Invest-the-Difference Strategy Evaluation engine
- PI Facts → `CurrentIulSnapshot` adapter (read-only)
- Representative-entered term quote workflow
- Educational projection engine (4% / 7% / 10%)
- FI-owned persistence + versioning
- FI APIs under `/api/financial-intelligence`
- Print-friendly discussion-scenario UI section
- Business rules BR-062–BR-065, BR-067–BR-073 (BR-066 controlling)
- Tests and canonical documentation

## Canonical naming

- Capability: **Invest-the-Difference Strategy Evaluation**
- UI section: **Possible Discussion Scenarios for the Primerica Representative**
- Governance: **BR-066** — Atlas informs. Representatives recommend. Clients decide.

## Explicitly deferred

| Item | Status |
|------|--------|
| Official Primerica quote / eligibility integration | Deferred |
| Verified fund catalog (symbols as recommendations) | Deferred |
| PDF export pipeline | Deferred (print-friendly CSS shipped) |
| Automated product eligibility | Deferred |
| Automated suitability workflow | Deferred |

## PI boundary

Policy Intelligence engines remain frozen. FI consumes via adapter only and never writes strategy data into PI Facts, Rules, Annual Values, Findings, Comparison outputs, or shared PI reports.

## Migration

- `025_financial_intelligence_strategy_evaluations.sql`
- Down: `025_financial_intelligence_strategy_evaluations_down.sql`

## Primary module path

`backend/modules/financial-intelligence/`
