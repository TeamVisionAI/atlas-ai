-- Sprint 14.3 — Atlas Timeline Engine (event projection store)

CREATE TABLE IF NOT EXISTS atlas_timeline_entries (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',

  prospect_id UUID NOT NULL,
  business_event_id UUID NOT NULL,
  entry_type TEXT NOT NULL,
  event_type TEXT NOT NULL,

  timestamp TIMESTAMPTZ NOT NULL,
  actor TEXT NOT NULL,
  channel TEXT,
  summary TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  lifecycle_state_at_event TEXT,
  correlation_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_timeline_entries_business_event
  ON atlas_timeline_entries(business_event_id);

CREATE INDEX IF NOT EXISTS idx_atlas_timeline_entries_prospect
  ON atlas_timeline_entries(prospect_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_timeline_entries_org
  ON atlas_timeline_entries(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_timeline_entries_entry_type
  ON atlas_timeline_entries(entry_type, timestamp DESC);

COMMENT ON TABLE atlas_timeline_entries IS 'Sprint 14.3 — Timeline projection derived from Business Events';
