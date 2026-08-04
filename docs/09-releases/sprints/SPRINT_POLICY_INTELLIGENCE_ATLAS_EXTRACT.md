# Sprint 1 — Atlas Extract (Policy Intelligence)

## AI Summary

Sprint 1 delivers the Policy Intelligence document ingestion pipeline and canonical **PolicyExtraction** model: private storage upload, `atlas_policy_documents` persistence, structured field normalization (`structured_ingest` / `rules`), and workspace UI. AI reasoning and OCR remain disabled (BR-052). Canonical shape is zero-knowledge schemaVersion **2.0** per **BR-054**. Meta Review Mode is unchanged.

## Purpose

Enable uploading, storing, and capturing structured policy data without inventing AI/OCR behavior.

## Status

Implemented — Atlas Extract

## Business Rules

- BR-051 — Policy Intelligence Foundation
- BR-052 — Atlas Extract (Policy Document Ingestion & Canonical Extraction)

## Scope

### In

- Private `policy-documents` storage bucket
- `atlas_policy_extractions` table + PolicyExtraction schemaVersion `1.0`
- APIs: create/list reviews, upload document, get/put extraction, signed download URL
- Deterministic normalization + filename rules hints
- Policy Intelligence workspace ingest UI

### Out

- AI reasoning / LLM extraction
- OCR / PDF text parsing engines
- Meta Review Mode nav changes

## Technical Notes

| Area | Location |
|------|----------|
| Migration | `022_policy_intelligence_atlas_extract.sql` |
| Domain model | `domain/PolicyExtractionModel.js` |
| Ingestion | `application/DocumentIngestionService.js` |
| Extraction | `application/PolicyExtractionService.js` |
| Storage | `infrastructure/policyDocumentStorage.js` |
| UI | `frontend/src/pages/PolicyIntelligence.jsx` |

## API

| Method | Path | Permission |
|--------|------|------------|
| GET | `/api/policy-intelligence` | `policy:read` |
| GET/POST | `/api/policy-intelligence/reviews` | read / write |
| GET | `/api/policy-intelligence/reviews/:id` | `policy:read` |
| POST | `/api/policy-intelligence/reviews/:id/documents` | `policy:write` (multipart `document`) |
| GET/PUT | `/api/policy-intelligence/documents/:id/extraction` | read / write |
| GET | `/api/policy-intelligence/documents/:id/download-url` | `policy:read` |

## Database

See migration 022. Aggregate: PolicyExtraction → `atlas_policy_extractions`.

## Related Documents

- [POLICY_INTELLIGENCE.md](../../04-architecture/policy-intelligence/POLICY_INTELLIGENCE.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-08-03 | Sprint 1 = ingest + canonical model only; AI/OCR deferred; Meta Review Mode left unchanged |
