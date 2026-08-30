# BR-181 — Production & Client Activity Foundation

Status: V1 implemented.

## Goal

Answer: what client business was submitted, issued, paid, pending, or closed — and who owns it?

Production stays completely separate from recruiting prospects and Recruit AI.

## Source of truth

`atlas_client_production` is the canonical V1 production/activity entity.

Linked to:

- `atlas_agenda_clients`
- owning user
- organization

Do not store production on generic client notes or appointments.

Apply `backend/database/migrations/064_br181_client_production.sql` after merge. No Railway variables. No data backfill. Amounts stay null unless a real value is stored.

## V1 record

Required: id, organization_id, client_id, owner_user_id, activity_type, status, created_by_user_id, created_at, updated_at.

Optional: carrier/provider, product_type, amount/premium, submitted_at, issued_at, paid_at, closed_at, notes.

## Types

`LIFE`, `INVESTMENT`, `ANNUITY`, `POLICY_REVIEW`, `OTHER`

## Statuses

Manual only: `DRAFT`, `SUBMITTED`, `PENDING`, `ISSUED`, `PAID`, `DECLINED`, `WITHDRAWN`, `CLOSED`.

Do not infer status from appointments or conversations.

## APIs

- `GET /api/production` — `scope=mine|team`, `q`, `status`, `activityType`, `clientId`, `ownerUserId`, `from`, `to`
- `POST /api/production`
- `GET /api/production/:id`
- `PATCH /api/production/:id`
- `POST /api/production/:id/status`
- `POST /api/production/:id/follow-up` — optional manual BR-178 client follow-up

## UI

- `/app/production` — My Production / authorized Team Production
- `/app/clients/:clientId` — Production / Activity section
- Sidebar **Production** next to Clients

## Metrics

Counts only: Submitted, Pending, Issued, Paid.

Sum amounts only when a real stored value exists. No commissions, projections, persistency, or compensation.

## Permissions

Same owner / hierarchy model as BR-178 / BR-179. Wrong-org IDs → 404. Unauthorized peer → 404. Super Admin control-plane empty. Support Mode tenant-bound. No phone-based tenant identity.

## Integrations

- Today (BR-180): unchanged. Production is not an automatic Today item.
- Follow-ups (BR-178): no auto-create on status change. Manual create from a production record reuses `createManualFollowUp` with `entityType=client`.

## Out of scope

Carrier APIs, commissions, compensation hierarchy, policy document ingestion, FNA, Policy Intelligence, and automated production status inference.
