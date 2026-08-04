# Sprint 5 — Policy Intelligence Comparison Engine

## AI Summary

Sprint 5 delivers the Comparison Engine and Comparison Workspace. Scenarios package existing pipeline outputs (Facts, Annual Values, Findings, Recommendations) and are compared with deterministic metrics. Stress tests (illustrated rate, minimum funding) produce scenario variants without mutating Insurance Facts. No AI. No OCR. No architecture redesign.

## Purpose

Compare two or more policy scenarios using the same canonical model and produce an auditable ComparisonResult.

## Status

Implemented — Sprint 5

## Business Rules

- BR-061 — Policy Intelligence Comparison Engine
- Also respects BR-057, BR-058, BR-059, BR-060

## Frozen pipeline (unchanged)

```
Atlas Extract
  → Insurance Facts
  → Annual Values Engine
  → Rule Engine
  → Findings
  → Recommendations
  → AI Narrative
```

Comparison **consumes** outputs; it does not insert a new redesign into the extract path.

## Scope

### In

- Scenario model (Current / Stress / Alternative Funding / Alternative Strategy)
- Comparison metrics + ComparisonResult
- Deterministic stress builders
- Extensible comparison type registry
- APIs: catalog, analyze, review comparison, stress comparison
- Comparison Workspace UI (side-by-side metrics + timeline)

### Out

- AI / OCR
- Generating or mutating Insurance Facts
- Redesign of Extract, Facts, Annual Values, Rule Engine, Language Layer, Recommendations

## Technical Notes

| Area | Path |
|------|------|
| Engine | `domain/comparison/comparisonEngine.js` |
| Scenarios | `domain/comparison/scenarioModel.js` |
| Stress | `domain/comparison/stressScenarios.js` |
| Types | `domain/comparison/comparisonTypes.js` |
| Service | `application/ComparisonService.js` |
| UI | `frontend/src/components/policy-intelligence/ComparisonWorkspace.jsx` |

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/policy-intelligence/comparison/catalog` | Types, metrics, contracts |
| POST | `/api/policy-intelligence/comparison/analyze` | Compare supplied scenarios |
| POST | `/api/policy-intelligence/reviews/:id/comparison` | Review A vs B / stress / scenarioB |
| POST | `/api/policy-intelligence/reviews/:id/comparison/stress` | Current vs stress |

## Related Documents

- [POLICY_INTELLIGENCE.md](../../04-architecture/policy-intelligence/POLICY_INTELLIGENCE.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-03 | Sprint 5 Comparison Engine; extensible types; stress via scenario clones only |
