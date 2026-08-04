# Sprint 4A — Annual Values Engine

## AI Summary

Sprint 4A adds the Annual Values Engine: normalize illustration annual tables into a canonical timeline, validate, compute deterministic summary metrics, and persist AnnualValue entities linked to `reviewId`. Insurance Facts, Rule Engine, Language Layer, Recommendations, and AI remain untouched.

## Purpose

Read the Annual Values table from an insurance illustration (structured input) and produce a canonical, auditable timeline with summary metrics.

## Status

Implemented — Sprint 4A

## Business Rules

- BR-060 — Annual Values Engine
- Also respects BR-052, BR-054, BR-056, BR-058, BR-059 (untouched)

## Scope

### In

- Canonical AnnualValue model
- Column-alias normalization (F&G-style labels supported)
- Timeline validation
- Deterministic summary calculations
- Persistence: `atlas_policy_annual_value_sets`, `atlas_policy_annual_values`
- APIs for analyze / get / upsert by review
- F&G illustration fixture + unit tests

### Out

- OCR
- GPT / AI decisions
- Redesign of Extract, Facts, Rule Engine, Language Layer, Recommendations

## Technical Notes

| Area | Path |
|------|------|
| Engine | `domain/annual-values/annualValuesEngine.js` |
| Canonical model | `domain/annual-values/AnnualValue.js` |
| F&G fixture | `domain/annual-values/fixtures/fgIllustrationAnnualValues.js` |
| Service | `application/AnnualValuesService.js` |
| Migration | `024_policy_intelligence_annual_values.sql` |

### Output shape

```
Annual Values Timeline
Summary Metrics
Calculation Metadata
Validation Results
```

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/policy-intelligence/annual-values/catalog` | Canonical fields + contracts |
| POST | `/api/policy-intelligence/annual-values/analyze` | Normalize/validate/calculate (no persist) |
| GET | `/api/policy-intelligence/reviews/:reviewId/annual-values` | Latest persisted set |
| PUT | `/api/policy-intelligence/reviews/:reviewId/annual-values` | Upsert timeline for review |

## Related Documents

- [POLICY_INTELLIGENCE.md](../../04-architecture/policy-intelligence/POLICY_INTELLIGENCE.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-03 | Sprint 4A Annual Values Engine on frozen architecture; F&G fixture as first validation dataset |
