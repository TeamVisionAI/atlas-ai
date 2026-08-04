# Policy Intelligence

## AI Summary

Policy Intelligence is a Business-domain module under Analytics & Intelligence. Sprint 0 delivered foundation; Sprint 1 Atlas Extract added ingestion. **BR-054** enforces zero-knowledge extraction. **BR-056** hardens the CRM boundary: CRM owns people and policy numbers; Policy Intelligence owns mechanics and identifies reviews by `reviewId` only.

## Purpose

Organize policy document reviews, store source files, and persist **zero-knowledge** structured extraction data for insurance analysis — not personal identity.

## Frozen pipeline

```
Atlas Extract → Insurance Facts → Annual Values Engine → Rule Engine → Findings → Recommendations → AI Narrative
```

Comparison Engine (BR-061) consumes those outputs; it does not redesign the pipeline.

## Status

Draft — Atlas Extract + BR-054 PII Isolation

## Business Rules

- [BR-051 — Policy Intelligence Foundation](../../06-business/BUSINESS_RULES.md#br-051--policy-intelligence-foundation)
- [BR-052 — Atlas Extract](../../06-business/BUSINESS_RULES.md#br-052--atlas-extract-policy-document-ingestion--canonical-extraction)
- [BR-054 — PII Isolation & Zero-Knowledge Policy Intelligence](../../06-business/BUSINESS_RULES.md#br-054--pii-isolation--zero-knowledge-policy-intelligence)
- [BR-056 — CRM / Policy Intelligence Boundary](../../06-business/BUSINESS_RULES.md#br-056--crm--policy-intelligence-boundary)
- [BR-057 — Facts Before Findings](../../06-business/BUSINESS_RULES.md#br-057--facts-before-findings)
- [BR-058 — Immutable Insurance Facts](../../06-business/BUSINESS_RULES.md#br-058--immutable-insurance-facts)
- [BR-059 — Deterministic Policy Intelligence Rule Engine](../../06-business/BUSINESS_RULES.md#br-059--deterministic-policy-intelligence-rule-engine)
- [BR-060 — Annual Values Engine](../../06-business/BUSINESS_RULES.md#br-060--annual-values-engine)
- [BR-061 — Policy Intelligence Comparison Engine](../../06-business/BUSINESS_RULES.md#br-061--policy-intelligence-comparison-engine)

## Technical Notes

| Layer | Location |
|-------|----------|
| Workspace page | `frontend/src/pages/PolicyIntelligence.jsx` |
| Canonical model | `domain/PolicyExtractionModel.js` (schemaVersion **2.0**) |
| Insurance Language Layer | `domain/insurance-language/` (vocabulary, Facts, Findings, Recommendations) |
| Rule Engine (Sprint 3) | `domain/insurance-language/rule-engine/` (PI-001…PI-010, thresholds, metadata) |
| Annual Values (Sprint 4A) | `domain/annual-values/` (timeline, metrics, validation; reviewId-linked storage) |
| Comparison (Sprint 5) | `domain/comparison/` (scenarios, metrics, stress, ComparisonResult) + Comparison Workspace UI |
| PII sanitizer | `domain/piiSanitizer.js` |
| AI boundary | `domain/aiBoundary.js` (Facts + Findings only) |
| Benchmark boundary | `domain/benchmarkBoundary.js` |
| Knowledge gate | `application/knowledgeCenterGate.js` + `knowledgeHubService.prepareContentForKnowledgeIndex` |
| Reports | `application/policyReportService.js` (`internal` \| `shared`) |

### Bounded contexts (BR-056)

```
CRM                              Policy Intelligence
------------------------         ------------------------
Prospect / Client                reviewId
Policy Number                    Carrier / Product
Owner names                      Gender / Issue Age / Risk Class
Appointments / Notes             Premium / Face / Charges / COI
                                 Cash Values / Indexes / Loans / Riders
         \                       Findings / Business Rules / Recommendations
          \→ internal prospect_id FK (never exported)
          \→ optional crm_policy_ref_hash (never plaintext policy number)
```

| Context | Owns |
|---------|------|
| CRM / Recruit OS | Identity, policy numbers, ownership names, appointments |
| Policy Intelligence | Policy mechanics + anonymous insured attributes |

`prospect_id` may exist as an **internal FK only**. Policy Intelligence APIs expose `reviewId` (and optional `crmLinked` boolean) — never `prospectId` or plaintext policy numbers.

### Capability flags

| Flag | Value |
|------|-------|
| `documentUpload` | `true` |
| `extraction` | `true` (`structured_ingest`, `rules`) |
| `piiIsolation` / `zeroKnowledge` | `true` |
| `ocr` / `ai` | `false` |

### Canonical PolicyExtraction (`schemaVersion` 2.0)

```json
{
  "schemaVersion": "2.0",
  "carrier": null,
  "productType": null,
  "product": null,
  "insured": {
    "gender": null,
    "issueAge": null,
    "underwritingClass": null,
    "riskClassification": null,
    "tobaccoStatus": null
  },
  "premium": { "amount": null, "currency": "USD", "frequency": null },
  "faceAmount": null,
  "charges": [],
  "cashValues": [],
  "coi": null,
  "indexes": [],
  "loans": [],
  "riders": [],
  "coverages": [],
  "findings": [],
  "businessRules": [],
  "recommendations": [],
  "mechanics": {}
}
```

**Forbidden in PI:** names, address, email, phone, SSN/Tax ID, **policy number** (CRM), exact DOB, beneficiary/owner/agent/client/holder names, `prospectId`.

## API

| Method | Path | Permission | Notes |
|--------|------|------------|-------|
| GET | `/api/policy-intelligence` | `policy:read` | Module summary |
| GET/POST | `/api/policy-intelligence/reviews` | read/write | Reviews |
| GET | `/api/policy-intelligence/reviews/:id` | `policy:read` | Bundle |
| GET | `/api/policy-intelligence/reviews/:id/report?mode=internal\|shared` | `policy:read` | BR-054 report modes |
| POST | `/api/policy-intelligence/reviews/:id/documents` | `policy:write` | Upload |
| GET/PUT | `/api/policy-intelligence/documents/:id/extraction` | read/write | Canonical extraction |
| GET | `/api/policy-intelligence/documents/:id/ai-context` | `policy:read` | AI-safe payload |
| GET | `/api/policy-intelligence/documents/:id/benchmark-features` | `policy:read` | Anonymous features |
| GET | `/api/policy-intelligence/documents/:id/knowledge-payload` | `policy:read` | Sanitized Knowledge ingress |
| POST | `/api/policy-intelligence/knowledge/sanitize` | `policy:write` | Sanitize free text for Knowledge Center |

## Database

| Migration | Contents |
|-----------|----------|
| `021_*` | reviews, documents, permissions |
| `022_*` | `policy-documents` bucket, `atlas_policy_extractions` |
| `024_*` | `atlas_policy_annual_value_sets`, `atlas_policy_annual_values` |

JSONB `extracted_data` is normalized to schema **2.0** on write (no migration required for shape).

## Related Documents

- [ATLAS_ENTERPRISE_ARCHITECTURE_GUIDE.md](../../architecture/ATLAS_ENTERPRISE_ARCHITECTURE_GUIDE.md)
- [SPRINT_POLICY_INTELLIGENCE_ATLAS_EXTRACT.md](../../09-releases/sprints/SPRINT_POLICY_INTELLIGENCE_ATLAS_EXTRACT.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-03 | Foundation (BR-051) |
| 2026-08-03 | Atlas Extract ingest (BR-052) |
| 2026-08-03 | BR-054 zero-knowledge model schema 2.0; AI/Knowledge/benchmark/shared-report boundaries |
| 2026-08-03 | BR-056 CRM boundary — reviewId-only identity; policy numbers hashed/CRM-owned; no client ownership in PI |
| 2026-08-03 | Sprint 2 Insurance Language Layer (BR-057 / BR-058) — vocabulary, immutable Facts, Findings, Recommendations |
| 2026-08-03 | Sprint 3 Deterministic Rule Engine (BR-059) — PI-001…PI-010 on frozen pipeline; no AI decisions |
| 2026-08-03 | Sprint 4A Annual Values Engine (BR-060) — canonical timeline + metrics; Facts/Rules/AI unchanged |
| 2026-08-03 | Sprint 5 Comparison Engine (BR-061) — scenario comparison + stress; Facts immutable; no AI |
