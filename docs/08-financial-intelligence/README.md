# Financial Intelligence

## AI Summary

Architecture and runtime pack for **Atlas Financial Intelligence** — the bounded context above Policy Intelligence that produces educational organization strategy evaluations after objective policy analysis.

- **RC2** — APPROVED architecture baseline
- **RC3 Phase A** — IMPLEMENTED Invest-the-Difference Strategy Evaluation foundation

## Documents

| Document | Purpose |
|----------|---------|
| [FINANCIAL_INTELLIGENCE_ARCHITECTURE.md](./FINANCIAL_INTELLIGENCE_ARCHITECTURE.md) | Canonical architecture (RC2 APPROVED) + RC3 implementation notes |
| [CALCULATION_ASSUMPTIONS.md](./CALCULATION_ASSUMPTIONS.md) | Canonical ITD formulas and projection assumptions |
| [API.md](./API.md) | RC3 Financial Intelligence HTTP API + frontend contract |
| [RUNTIME_WORKFLOW.md](./RUNTIME_WORKFLOW.md) | Live evaluation lifecycle, deployment, rollback |
| [RC3 Phase A](../09-releases/sprints/SPRINT_RC3_INVEST_THE_DIFFERENCE_FOUNDATION.md) | Foundation release notes |
| [RC3 Phase B](../09-releases/sprints/SPRINT_RC3_PHASE_B_RUNTIME_INTEGRATION.md) | Runtime integration release notes |

## Status

| Milestone | Status |
|-----------|--------|
| RC2 Financial Intelligence Architecture | **APPROVED** |
| RC3 Phase A Invest-the-Difference foundation | **IMPLEMENTED** |
| RC3 Phase B runtime integration | **IMPLEMENTED** |
| Official Primerica quote integration | Deferred |
| Verified fund catalog | Deferred |
| PDF export | Deferred |
| Automated product eligibility | Deferred |
| Automated suitability workflow | Deferred |

## Governance

- [BR-062](../06-business/BUSINESS_RULES.md#br-062--financial-intelligence-boundary) … [BR-065](../06-business/BUSINESS_RULES.md#br-065--analysis-vs-strategy-evaluation-separation)
- [BR-066 — Human Recommendation Boundary](../06-business/BUSINESS_RULES.md#br-066--human-recommendation-boundary) (controlling)
- [BR-067](../06-business/BUSINESS_RULES.md#br-067--invest-the-difference-same-outlay-rule) … [BR-073](../06-business/BUSINESS_RULES.md#br-073--missing-inputs-must-be-exposed)

Creed: Atlas informs. Advisors recommend. Clients decide.

## Runtime

- Module: `backend/modules/financial-intelligence/`
- API: `/api/financial-intelligence`
- UI section: **Possible Discussion Scenarios for the Primerica Representative**
- Persistence: `atlas_fi_strategy_evaluations` (migration 025)

## Note on folder numbering

This pack lives at `docs/08-financial-intelligence/`. Operations runbooks remain under [`docs/08-operations/`](../08-operations/README.md). Prefer path-based links; do not assume a single “08” meaning.
