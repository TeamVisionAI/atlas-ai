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
