# BR-186 — IUL / Policy Review Pipeline V2

Status: V1 foundation implemented.

## Goal

Create a dedicated, measurable IUL / policy-review operating layer that is separate from recruiting and ready for ad attribution, documents, appointments, service cases, production, and estimated commission.

## Source of truth

A minimal new table, `atlas_policy_review_pipeline`, is the canonical pipeline record.

It links to existing entities instead of duplicating them:

- `atlas_agenda_clients` (BR-179) — no second client identity
- optional `service_case_id` → `atlas_client_service_cases` (BR-182 `POLICY_REVIEW`)
- optional appointment id (`purpose=policy_review`)
- optional BR-183 document request
- optional `atlas_client_production` (BR-181)
- optional `linked_prospect_id` for the same person in recruiting — stored only, never used for routing

Do **not** use Policy Intelligence `atlas_policy_reviews`. Scheduling `purpose=policy_review` is not a PI document aggregate (BR-132).

Do **not** overload BR-182 service-case statuses with `APPLICATION_SUBMITTED` / `PLACED`.

Apply `backend/database/migrations/067_br186_policy_review_pipeline.sql` after merge. Attribution first/latest-touch fields are added by BR-188 (`068_br188_policy_review_acquisition.sql`). No Railway variables. No data backfill. No phone-based tenant identity.

## Stages

Manual / explicit only:

`NEW_REVIEW_LEAD` → `REVIEW_REQUESTED` → `QUALIFIED` → `APPOINTMENT_BOOKED` → `DOCUMENTS_REQUESTED` → `DOCUMENTS_RECEIVED` → `REVIEW_COMPLETED` → outcomes `KEEP_CURRENT` | `ADJUST_CURRENT` | `REPLACEMENT_OPPORTUNITY` | `NOT_PROCEEDING` → `APPLICATION_SUBMITTED` → `PLACED`

Replacement is never inferred from incomplete information. It is recorded only after `REVIEW_COMPLETED` via the outcome action.

## Commission

`estimatedTakeHome = annualizedPremium × (commissionLevelPct / 100) × (paidAdvanceFactorPct / 100)`

Resolution order: record override → user default → organization default → null.

No global 110% or 75%. Label is **Estimated** unless `actual_paid_commission` is recorded.

Annualized premium = explicit AP, or monthly × 12.

## APIs

- `GET /api/policy-reviews` — `scope=mine|team`, `q`, `stage`, `clientId`, `ownerUserId`
- `POST /api/policy-reviews`
- `GET /api/policy-reviews/:id`
- `PATCH /api/policy-reviews/:id`
- `POST /api/policy-reviews/:id/stage`
- `POST /api/policy-reviews/:id/complete`
- `POST /api/policy-reviews/:id/outcome`
- `POST /api/policy-reviews/:id/appointment`
- `POST /api/policy-reviews/:id/documents`
- `POST /api/policy-reviews/:id/documents/received`
- `POST /api/policy-reviews/:id/application`
- `POST /api/policy-reviews/:id/placed`
- `POST /api/policy-reviews/:id/follow-up` — BR-178 client follow-up
- `GET|PUT /api/policy-reviews/commission-defaults`

List reads are owner/client bounded with explicit columns. Client names are batch-loaded.

## UI

- `/app/policy-reviews` — My Reviews / authorized Team Reviews
- `/app/clients/:clientId` — Policy review section
- Sidebar **Policy Reviews** next to Service
- Separate from Recruiting Dashboard and Policy Intelligence

## Visibility

- User sees own reviews
- Authorized leadership sees hierarchy/subtree roll-up
- Super Admin control plane is empty
- Support Mode is tenant-bound
- Wrong-org / unauthorized peer fail closed as 404

Super Admin controls the platform. Hierarchy controls the business.

## Today / follow-ups / documents

Reuse BR-184, BR-178, and BR-183. Pipeline records are not a new Today source. Due service cases, follow-ups, and document requests already appear through those canonical lists.

## Recruiting separation

Policy-review records must not enter Prospect Center, Recruit AI, recruiting conversion metrics, or recruiting campaign routing.

## Out of scope

OCR / policy analysis, replacement or surrender advice, compliance replacement packs, full policy administration, actual carrier commission feeds, Recruit AI / WhatsApp changes, and a Policy Intelligence bridge.
