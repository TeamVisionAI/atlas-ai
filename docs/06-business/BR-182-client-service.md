# BR-182 — Client Service / Policy Review Workspace

Status: V1 implemented.

## Goal

Track ongoing client service work separately from production and recruiting.

## Source of truth

`atlas_client_service_cases` is the canonical V1 service-case entity.

Linked to organization, `atlas_agenda_clients`, owning user, and optionally `atlas_client_production`.

`POLICY_REVIEW` is a service case, not policy analysis. The IUL Review funnel is unchanged.

Apply `backend/database/migrations/065_br182_client_service.sql` after merge. No Railway variables. No data backfill. Due dates stay null unless stored.

## Types

`POLICY_REVIEW`, `ANNUAL_REVIEW`, `BENEFICIARY_UPDATE`, `DOCUMENT_REQUEST`, `SERVICE_FOLLOW_UP`, `GENERAL_SERVICE`, `OTHER`

## Statuses

Manual only: `OPEN`, `WAITING_ON_CLIENT`, `WAITING_ON_AGENT`, `SCHEDULED`, `COMPLETED`, `CANCELLED`

## Due classification

- null → Needs Date
- today → Due Today
- past → Overdue
- future → Upcoming
- completed/cancelled → closed

## APIs

- `GET /api/service-cases` — `scope=mine|team`, `q`, `status`, `serviceType`, `clientId`, `ownerUserId`, `due`
- `POST /api/service-cases`
- `GET /api/service-cases/:id`
- `PATCH /api/service-cases/:id`
- `POST /api/service-cases/:id/status`
- `POST /api/service-cases/:id/follow-up` — optional manual BR-178 client follow-up

## UI

- `/app/service` — My Service / authorized Team Service
- `/app/clients/:clientId` — Service section
- Sidebar **Service** next to Production

## Today

Actionable open cases only: overdue and due today. Normalized into the BR-184 Today list as `kind=service_case`. Needs Date and upcoming open cases stay off Today.

## Out of scope

Policy document ingestion, OCR, automated recommendations, replacement analysis, carrier integrations, commissions, and inferred service status.
