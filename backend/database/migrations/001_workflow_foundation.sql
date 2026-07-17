-- Sprint 8A.1 — Workflow foundation schema
-- Run manually in Supabase SQL editor before enabling workflow_events persistence.

-- Structured auditable workflow events (docs/EVENT_CATALOG.md)
CREATE TABLE IF NOT EXISTS workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_phone TEXT NOT NULL,
  event_type TEXT NOT NULL,
  actor TEXT NOT NULL DEFAULT 'SYSTEM',
  milestone_before TEXT,
  milestone_after TEXT,
  ownership_before TEXT,
  ownership_after TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  correlation_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_events_prospect_phone
  ON workflow_events (prospect_phone);

CREATE INDEX IF NOT EXISTS idx_workflow_events_created_at
  ON workflow_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_workflow_events_event_type
  ON workflow_events (event_type);

-- Optional: JSON workflow snapshot on prospects (future consolidation target)
ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS workflow_state JSONB DEFAULT NULL;

COMMENT ON TABLE workflow_events IS 'Sprint 8A structured workflow audit log';
COMMENT ON COLUMN prospects.workflow_state IS 'Optional persisted workflow snapshot; 8A.1 uses workflowState.json until migrated';
