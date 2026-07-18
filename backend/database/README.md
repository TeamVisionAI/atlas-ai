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

