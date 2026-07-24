-- Sprint 14.2 — Atlas Business Event Engine (append-only event store)

CREATE TABLE IF NOT EXISTS atlas_business_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',

  event_type TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL,
  prospect_id UUID,
  actor TEXT NOT NULL,
  channel TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  version TEXT NOT NULL DEFAULT '1.0',
  correlation_id TEXT,
  causation_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_business_events_prospect
  ON atlas_business_events(prospect_id, timestamp DESC)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_business_events_type
  ON atlas_business_events(event_type, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_business_events_correlation
  ON atlas_business_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_business_events_timestamp
  ON atlas_business_events(timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_business_events_org
  ON atlas_business_events(organization_id);

COMMENT ON TABLE atlas_business_events IS 'Sprint 14.2 — append-only Atlas Business Event store';
