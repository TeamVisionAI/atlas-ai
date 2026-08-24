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


## BR-075 — WhatsApp outbound deliveries (migration 028)

### Backup / recovery (required before apply)

1. Create a verified Supabase/Postgres snapshot (or `pg_dump` of production) and record the snapshot ID/time.
2. Confirm rollback file exists: `028_whatsapp_outbound_deliveries_down.sql`.
3. Apply only with explicit confirmation (script below). This tooling does **not** create backups.

### Apply migration

Idempotent (`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`):

```
backend/database/migrations/028_whatsapp_outbound_deliveries.sql
```

Canonical apply helper:

```bash
CONFIRM_WHATSAPP_OUTBOUND_MIGRATION_028=yes node -r dotenv/config \
  backend/dev/applyWhatsAppOutboundDeliveriesMigration028.js
```

Creates:

- `whatsapp_outbound_deliveries` — durable outbound authorization/delivery audit
- Indexes for org+phone, status, and idempotent successful sends

Rollback:

```
backend/database/migrations/028_whatsapp_outbound_deliveries_down.sql
```

### Runtime without migration

- Outbound authorization gate still runs (window + template fail-closed).
- Durable delivery inserts are skipped safely when the table is missing (`TABLE_MISSING`).
- Sanitized conversation-log / business-event audit still records blocked attempts.
- Application startup does not require the table.

### After migration

Blocked/sent WhatsApp attempts persist to `whatsapp_outbound_deliveries` with organization scoping and idempotency for successful sends.

## Migration 029 — Backend-only RLS (Security Advisor)

Closes PostgREST access for `anon` / `authenticated` on 18 public tables that previously had RLS disabled. Atlas continues to authorize users via Express sessions; Railway uses `service_role`.

```
backend/database/migrations/029_rls_backend_only_public_tables.sql
backend/database/migrations/029_rls_backend_only_public_tables_down.sql
```

- Enable RLS + deny policies in one transaction
- Revoke table privileges from `anon` / `authenticated`
- Preserve `service_role`
- No tenant JWT policies, no data changes, no Meta Review auth changes

**Rollback warning:** the down migration re-opens the prior public exposure. Prefer re-applying 029.

Contract tests: `backend/test/rls029BackendOnlyPublicTables.test.js`  
Optional live probes after apply: `ATLAS_RLS_029_LIVE=1`.

Follow-up: migration 030 hardens `sync_atlas_users_from_users()` search_path (see below).

## Migration 030 — Harden `sync_atlas_users_from_users` search_path

Addresses Security Advisor warning **Function Search Path Mutable** on
`public.sync_atlas_users_from_users()`.

```
backend/database/migrations/030_fix_sync_atlas_users_search_path.sql
backend/database/migrations/030_fix_sync_atlas_users_search_path_down.sql
```

- Pins `search_path` to `pg_catalog, public`
- Qualifies `public.atlas_users` and selected builtins
- Revokes `EXECUTE` from `PUBLIC` / `anon` / `authenticated`
- Keeps `EXECUTE` for `service_role` (trigger invocations from backend)
- Preserves SECURITY INVOKER, VOLATILE, trigger binding, and migration 017 sync contract
- Does **not** touch Meta Review `profile_settings` / RLS policies / migration 029

Contract tests: `backend/test/syncAtlasUsersSearchPath030.test.js`  
Optional transactional dry-run (apply + probe + ROLLBACK): `ATLAS_030_LIVE_DRY_RUN=1`.

**Rollback warning:** down migration restores the mutable-search-path finding and broader EXECUTE grants.

## Migration 031 — BR-080 new lead attention columns

```
backend/database/migrations/031_br080_new_lead_attention.sql
backend/database/migrations/031_br080_new_lead_attention_down.sql
```

Additive columns on `prospects` for assignment/attention lifecycle. No ownership backfill.

## Migration 032 — BR-081 Recruit AI v2 durable conversation contexts

```
backend/database/migrations/032_br081_recruit_ai_conversation_contexts.sql
backend/database/migrations/032_br081_recruit_ai_conversation_contexts_down.sql
```

Creates:

- `recruit_ai_conversation_contexts` — one active sanitized context per organization + prospect + channel
- `recruit_ai_v2_shadow_evaluations` — shadow ledger table (unused until shadow-mode sprint)

Also:

- Unique partial index on active contexts
- Organization / updated_at / last_processed_message_id indexes
- Backend-only RLS (deny anon + authenticated; grant service_role)
- No prospect/appointment backfill
- Safe to apply before application deploy

Contract tests: `backend/test/recruitAiV2DurableContext.test.js`  
**Do not apply in production until an authorized migration/deploy window.**

**Rollback warning:** down migration drops both tables.

## Migration 039 — communication_media (WhatsApp audio Phase 1 + 1B)

```
backend/database/migrations/039_communication_media.sql
backend/database/migrations/039_communication_media_down.sql
```

Creates org-scoped `communication_media` plus private Storage bucket `communication-media`.

- Unique `(organization_id, provider_message_id, media_kind)`
- Fetch lifecycle: `pending | fetching | stored | failed`
- Transcode lifecycle: `pending | processing | ready | failed | not_required`
- Playback derivative mime/path (`playback.mp3`); original always preserved
- Nullable STT columns reserved (not used in Phase 1/1B)
- Backend-only RLS (deny anon + authenticated; grant service_role)
- Path contract: `organizationId/prospectId/wamid/original.<ext>` and `.../playback.mp3`

**Do not apply in production until an authorized migration/deploy window.** Local Phase 0+1+1B only.

Contract tests: `backend/test/whatsappAudioPhase1.test.js`, `backend/test/whatsappAudioPhase1b.test.js`

## Migration 040 — communication_media STT audit (WhatsApp audio Phase 2)

```
backend/database/migrations/040_communication_media_transcript_audit.sql
backend/database/migrations/040_communication_media_transcript_audit_down.sql
```

Additive STT audit columns on existing `communication_media` (does not rewrite 039):

- `transcript_attempts`, `transcript_provider`, `transcript_model`, `transcript_billed_ms`, `transcript_turn_id`
- Unique index on `transcript_turn_id` where not null
- CHECK on `transcript_status`

**STAGING ONLY.** Apply with `backend/dev/environment/applyStagingMigration040.js`.  
**Do not apply in production. Do not edit already-applied production 039.**

Contract tests: `backend/test/whatsappAudioPhase2Stt.test.js`

## BR-147 — Campaign Intake Codes (migration 052)

Apply before enabling `/app/settings/campaign-intake-codes` in production:

```
backend/database/migrations/052_campaign_intake_codes.sql
backend/database/migrations/052_campaign_intake_codes_down.sql
```

Production apply (after verified backup):

```bash
CONFIRM_CAMPAIGN_INTAKE_MIGRATION_052=yes node -r dotenv/config \
  backend/dev/applyCampaignIntakeCodesMigration052.js
```

Creates `campaign_intake_codes` + `campaign_intake_attributions` with backend-only RLS (service role).  
If tables already exist without RLS, the apply script runs `052_campaign_intake_codes_rls.sql` and reloads PostgREST schema.

Tests: `backend/test/campaignIntakeCodes.test.js`

