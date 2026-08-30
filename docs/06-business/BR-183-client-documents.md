# BR-183 — Client Documents & Secure Document Requests V1

Status: V1 implemented.

## Goal

Let agents securely request, receive, track, and organize client documents for service and policy-review workflows. No OCR, extraction, or automated policy analysis.

## Storage

Reuses the approved Atlas private Supabase Storage pattern (`policy-documents` / `communication-media`):

- Private bucket `client-documents`
- Service-role upload/download only
- Tenant-scoped random storage keys
- Authorized API download streams the file; raw storage keys and public bucket URLs are never returned

If the SQL role cannot upsert `storage.buckets`, runtime `ensureClientDocumentBucket()` creates the private bucket.

Apply `backend/database/migrations/066_br183_client_documents.sql` after merge. No Railway variables. No backfill.

## Source of truth

- `atlas_client_document_requests` — what the agent is waiting for
- `atlas_client_documents` — metadata only; binary objects stay in private storage

Linked to organization, `atlas_agenda_clients`, owner, optional BR-182 service case, optional BR-181 production record.

## Types

`POLICY_DOCUMENT`, `APPLICATION`, `STATEMENT`, `IDENTIFICATION`, `BENEFICIARY_FORM`, `SERVICE_FORM`, `OTHER`

Do not infer type automatically.

## Statuses

Documents (manual): `RECEIVED`, `REVIEW_PENDING`, `REVIEWED`, `REJECTED`, `ARCHIVED`  
Requests (manual): `OPEN`, `RECEIVED`, `COMPLETED`, `CANCELLED`

There is no delete API. Archive instead.

## File restrictions

PDF, JPEG, PNG only. 10 MB max. Filename sanitized. Magic-byte check. Executables, scripts, and archives rejected.

## APIs

- `GET/POST /api/document-requests`
- `GET/PATCH /api/document-requests/:id`
- `POST /api/document-requests/:id/status`
- `POST /api/document-requests/:id/follow-up` — optional manual BR-178 client follow-up
- `GET /api/documents`
- `POST /api/documents/upload`
- `GET /api/documents/:id`
- `GET /api/documents/:id/download`
- `POST /api/documents/:id/status`
- `POST /api/documents/:id/link`

## Fulfillment

A request is fulfilled only when the user supplies `requestId` on upload or explicitly links a document. Filename matching is not used. Linking the same document again is idempotent.

## Today / follow-ups

Today includes only **open** overdue and due-today requests as `kind=document_request` on the BR-184 list. Needs Date stays on the client profile. Documents themselves never appear on Today. No automatic follow-ups or WhatsApp.

## Out of scope

OCR, PDF parsing, policy extraction, AI summaries, replacement analysis, carrier comparison, and changes to Recruit AI / BR-176 / BR-178–182 sources of truth.
