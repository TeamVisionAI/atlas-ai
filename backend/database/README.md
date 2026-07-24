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

- `atlas_users` — Atlas agent accounts for ownership
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

