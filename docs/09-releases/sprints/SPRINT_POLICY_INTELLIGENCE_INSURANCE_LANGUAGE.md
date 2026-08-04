# Sprint 2 — Insurance Language Layer

## AI Summary

Sprint 2 delivers the canonical Insurance Language Layer for Policy Intelligence: vocabulary mapping, immutable Insurance Facts (Atlas Extract only), deterministic Business Rules → Findings, Findings → Recommendations, and an AI boundary that consumes Facts + Findings only. No OCR, no AI extraction, no GPT prompts.

## Purpose

Establish the insurance vocabulary and layered semantics that every future extractor, business rule, report, benchmark, and AI prompt will use.

## Status

Implemented — Sprint 2

## Business Rules

- BR-057 — Facts Before Findings
- BR-058 — Immutable Insurance Facts
- Also respects BR-052, BR-054, BR-056

## Scope

### In

- Carrier → Atlas vocabulary maps (e.g. Preferred NT → Preferred Non-Smoker, Option B → Increasing Death Benefit)
- Insurance Facts domain (immutable)
- Findings catalog + deterministic rules engine
- Recommendations catalog derived from Findings
- API: `GET /api/policy-intelligence/language`, `GET /api/policy-intelligence/documents/:id/language`
- AI context updated to Facts + Findings only

### Out

- OCR
- AI / GPT extraction or narrative generation
- Breaking changes to Recruit OS / Mission Control

## Technical Notes

| Area | Path |
|------|------|
| Vocabulary | `domain/insurance-language/insuranceVocabulary.js` |
| Facts | `domain/insurance-language/InsuranceFacts.js` |
| Findings | `domain/insurance-language/Findings.js` |
| Recommendations | `domain/insurance-language/Recommendations.js` |
| Business Rules | `domain/insurance-language/insuranceBusinessRulesEngine.js` |
| Facade | `domain/insurance-language/languageLayer.js` |

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/policy-intelligence/language` | Vocabulary + catalogs + pipeline contract |
| GET | `/api/policy-intelligence/documents/:id/language` | Facts / Findings / Recommendations analysis |
| GET | `/api/policy-intelligence/documents/:id/ai-context` | Facts + Findings only |

## Related Documents

- [POLICY_INTELLIGENCE.md](../../04-architecture/policy-intelligence/POLICY_INTELLIGENCE.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-03 | Sprint 2 language layer; Facts immutable; AI explains only |
