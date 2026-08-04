# Database Migrations

## Sprint 8A.1 — Workflow Foundation

### Apply migration

Run in Supabase SQL editor:

```
backend/database/migrations/001_workflow_foundation.sql
```

Creates:

- `workflow_events` — structured audit log for workflow transitions
- `prospects.workflow_state` — optional JSON column (future consolidation)

### Runtime without migration

- **Workflow ownership** persists to `backend/data/workflowState.json` (works immediately).
- **Event engine** logs a warning and continues if `workflow_events` table is missing.
- No conversation or UI behavior changes.

### After migration

`eventEngine.emit()` writes to `workflow_events`. Event emission is wired in Sprint 8A.2+.

## Sprint 10.1 — Quick Capture

Run in Supabase SQL editor:

```
backend/database/migrations/002_quick_capture.sql
```

Creates:

- `atlas_users` — Atlas agent accounts for ownership (Ana + Niovel default seeds)
- `atlas_sessions` — bearer session tokens
- Quick Capture columns on `prospects` (`prospect_number`, `normalized_phone`, `communication_language`, `preferred_communication_channel`, `entry_method`, `source`, `owner_user_id`, `created_by_user_id`, `status`, `first_name`, `last_name`)

### Environment

Set in `.env`:

- `ATLAS_BOOTSTRAP_TOKEN` — bootstrap token for `POST /api/auth/session`
- `ATLAS_DEFAULT_USER_ID` — optional override (defaults to seeded Ana user)
- `VITE_ATLAS_BOOTSTRAP_TOKEN` — same token for frontend session bootstrap

## Sprint 14.1 — Atlas Core Prospects

Run in Supabase SQL editor:

```
backend/database/migrations/003_atlas_core_prospects.sql
```

Creates:

- `atlas_core_prospects` — Atlas Core Prospect domain model (UUID PK, lifecycle, channels, JSON fields)

### Runtime without migration

- Prospect Engine API falls back to in-memory storage for dev/verify
- Legacy `prospects` table and Quick Capture remain unchanged
- Sprint 12.3 channel resolver (`backend/prospects/`) unchanged

### After migration

Authenticated REST API at `/api/prospects` persists to `atlas_core_prospects`.

## Sprint 14.2 — Business Events

Run in Supabase SQL editor:

```
backend/database/migrations/004_atlas_business_events.sql
```

Creates:

- `atlas_business_events` — append-only Atlas Business Event store

### Runtime without migration

- Business Event API falls back to in-memory storage for dev/verify
- In-process publisher + TimelineSubscriber placeholder still work

### After migration

Read-only REST API at `/api/business-events` and `/api/prospects/:id/events`.

## Sprint 14.3 — Timeline projection

Run in Supabase SQL editor:

```
backend/database/migrations/005_atlas_timeline_entries.sql
```

Creates:

- `atlas_timeline_entries` — Timeline projection store (derived from Business Events)

### Runtime without migration

- Timeline API falls back to in-memory storage for dev/verify
- `TimelineProjector` still receives Business Events via in-process publisher

### After migration

Read-only REST API at `/api/timeline` and `/api/prospects/:id/timeline`.

## Sprint 15.0 — Mission Control projection

Run in Supabase SQL editor:

```
backend/database/migrations/006_atlas_mission_control_read_model.sql
```

Creates:

- `atlas_mission_control_state` — org-level aggregate metrics
- `atlas_mission_control_prospects` — per-prospect projected state (normalized store)
- `atlas_mission_control_processed_events` — idempotency ledger

### Runtime without migration

- Mission Control API falls back to in-memory storage for dev/verify
- `MissionControlProjection` receives Business Events via `ProjectionEngine`

### After migration

Read-only REST API at `/api/mission-control`, `/api/mission-control/summary`, `/api/mission-control/metrics`.

## Sprint 15.1 — Executive Dashboard projection

Run in Supabase SQL editor:

```
backend/database/migrations/007_atlas_executive_dashboard_read_model.sql
```

Creates:

- `atlas_executive_dashboard_state` — org-level analytical aggregate
- `atlas_executive_dashboard_processed_events` — idempotency ledger

### Runtime without migration

- Executive Dashboard API falls back to in-memory storage for dev/verify
- `ExecutiveDashboardProjection` receives Business Events via `ProjectionEngine`

### After migration

Read-only REST API at `/api/executive-dashboard`, `/api/executive-dashboard/summary`, `/api/executive-dashboard/trends`, `/api/executive-dashboard/kpis`.

## Sprint 22 — Appointment Engine (RC1 required infrastructure)

Apply **all** appointment migrations before production deploy (idempotent):

```bash
node backend/dev/environment/applyAppointmentMigrations.js
```

Or run individually in Supabase SQL editor / `psql "$DATABASE_URL"`:

```
backend/database/migrations/013_atlas_appointments.sql
backend/database/migrations/018_appointment_owner_rep_id.sql
backend/database/migrations/019_atlas_appointments_baseline_repair.sql
backend/database/migrations/020_appointment_interviewer_assignment.sql
```

| Migration | Purpose |
|-----------|---------|
| `013_atlas_appointments.sql` | Creates `public.atlas_appointments` baseline table |
| `018_appointment_owner_rep_id.sql` | Adds `owner_rep_id` column + index |
| `019_atlas_appointments_baseline_repair.sql` | Idempotent repair if `013` was skipped |
| `020_appointment_interviewer_assignment.sql` | Adds `interviewer_user_id` / `interviewer_name` |

Creates / ensures:

- `atlas_appointments` — org-scoped appointment records with lifecycle history JSONB (BR-039, BR-050)

Agent appointment profile is stored in existing `atlas_users.profile_settings.appointmentProfile` (no new column).

### Runtime without migration

- **Development** falls back to `backend/data/appointments.json` when PostgREST reports the table missing.
- **Production** requires the Supabase table for reads and writes (`/health/production` fails when missing; repository throws instead of JSON fallback).

### Production health

`GET /health/production` probes `public.atlas_appointments` through the same PostgREST path as `appointmentRepository.isTableAvailable()`. `mvpReady` is **false** when the table is unavailable.

### Development JSON fallback audit (`backend/data/appointments.json`)

- **Still used in development** when `isTableAvailable()` is false and `NODE_ENV !== "production"`.
- **Previously masked missing production tables** because production reads silently fell back to this committed file while writes threw.
- **RC1 hardening:** production reads now throw the same error as writes when the table is missing, so committed dev rows cannot mask infrastructure gaps.
- **Smallest safe operational change:** keep the file for local dev but treat it as **non-authoritative** — do not commit real prospect data; prefer an empty `[]` baseline or local-only overrides via `.gitignore` (future ops task). Never rely on this file in Railway/Vercel deployments.

### After migration

REST API at `/api/appointments` and `/api/appointments/profile`.

Reminder delivery runs via `appointmentReminderEngine.js` (60s poll, WhatsApp send, `reminder_sent` events).

## Sprint 12.1 — Rep ID (Identity Foundation, Phase 1)

Run in Supabase SQL editor:

```
backend/database/migrations/017_rep_id.sql
```

Adds:

- `rep_id` on `atlas_users` and `users` — nullable, 5-character uppercase alphanumeric
- Partial unique indexes on `(organization_id, rep_id)` where `rep_id IS NOT NULL`
- Updated `sync_atlas_users_from_users()` trigger to propagate `rep_id`

Rollback:

```
backend/database/migrations/017_rep_id_down.sql
```

### Backward compatibility

- Existing users keep `rep_id = NULL`; email login is unchanged (Phase 2 adds Rep ID login).
- CHECK constraints allow NULL; format enforced only when a value is set.

### Backfill (manual, safe)

Use the dev helper (dry-run by default):

```
node backend/dev/backfillRepIds.js --report
node backend/dev/backfillRepIds.js --set <userId> <repId> --apply
```

All writes go through `identityWriteService` for dual-write to `atlas_users` and `users`.

## Sprint 12.2 Phase 1.1 — Appointment owner Rep ID column

Run in Supabase SQL editor:

```
backend/database/migrations/018_appointment_owner_rep_id.sql
```

Adds:

- `owner_rep_id` on `atlas_appointments` — nullable, 5-character uppercase alphanumeric (same format as user Rep IDs)
- Partial index on `(organization_id, owner_rep_id)` where `owner_rep_id IS NOT NULL`
- Backfill from `metadata->>'ownerRepId'` for existing rows

Rollback:

```
backend/database/migrations/018_appointment_owner_rep_id_down.sql
```

### Backward compatibility

- Repository reads prefer `owner_rep_id` column, then fall back to `metadata.ownerRepId`.
- Writes dual-publish to the column and metadata until metadata is removed in a later sprint.

## Policy Intelligence Foundation (BR-051)

Run in Supabase SQL editor:

```
backend/database/migrations/021_policy_intelligence_foundation.sql
```

Creates:

- `atlas_policy_reviews` — PolicyReview aggregate (org-scoped review container)
- `atlas_policy_documents` — PolicyDocument aggregate (files linked to a review)
- Permissions `policy:read` / `policy:write` and role grants (only for roles present in `roles`)

Note: role grants join against existing `roles` rows so environments missing `SUPPORT` / `OPERATIONS` do not fail the FK on `role_permissions`.

Rollback:

```
backend/database/migrations/021_policy_intelligence_foundation_down.sql
```

### Runtime without migration

- Foundation API `GET /api/policy-intelligence` returns a static summary and does not query these tables yet.
- Workspace UI is a placeholder dashboard; upload/OCR/extraction are not enabled.

### After migration

Persistence is ready for Atlas Extract repositories and document storage. See [POLICY_INTELLIGENCE.md](../../docs/04-architecture/policy-intelligence/POLICY_INTELLIGENCE.md).

## Policy Intelligence — Atlas Extract (BR-052)

Run in Supabase SQL editor (or apply via `DATABASE_URL`):

```
backend/database/migrations/022_policy_intelligence_atlas_extract.sql
```

Creates:

- Private Storage bucket `policy-documents` (25 MB; PDF/images/text/JSON)
- `atlas_policy_extractions` — PolicyExtraction aggregate (canonical `extracted_data` JSONB)

Rollback:

```
backend/database/migrations/022_policy_intelligence_atlas_extract_down.sql
```

### Runtime notes

- Bucket DDL may require SQL-editor owner privileges; if skipped, `ensurePolicyDocumentBucket()` creates `policy-documents` via the Storage API.
- Uploads use service-role Supabase Storage + short-lived signed download URLs.
- Extraction methods: `structured_ingest`, `rules` only (`ai` / `ocr` forbidden).
- API: `/api/policy-intelligence/*` (see sprint doc).

## Policy Intelligence — CRM Boundary (BR-056)

```
backend/database/migrations/023_policy_intelligence_crm_boundary.sql
```

Adds:

- `atlas_policy_reviews.crm_policy_ref_hash` — hashed CRM policy number for reconciliation (never plaintext)
- Column/table comments clarifying `prospect_id` is an internal CRM FK only

PI APIs identify reviews by `reviewId` only and never return `prospectId` or plaintext policy numbers.

