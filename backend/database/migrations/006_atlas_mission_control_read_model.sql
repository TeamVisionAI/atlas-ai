-- Sprint 15.0 — Mission Control read model (projection store)

CREATE TABLE IF NOT EXISTS atlas_mission_control_state (
  organization_id UUID PRIMARY KEY DEFAULT '00000000-0000-4000-8000-000000000001',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  prospects JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS atlas_mission_control_prospects (
  prospect_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  is_active BOOLEAN NOT NULL DEFAULT false,
  lifecycle_state TEXT,
  assigned_agent_id UUID,
  contact_attempt_count INTEGER NOT NULL DEFAULT 0,
  is_qualified BOOLEAN NOT NULL DEFAULT false,
  has_scheduled_interview BOOLEAN NOT NULL DEFAULT false,
  has_completed_interview BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  merged_into_id UUID,
  last_event_id UUID,
  last_event_at TIMESTAMPTZ,
  last_event_type TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_mission_control_processed_events (
  business_event_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_mission_control_prospects_org
  ON atlas_mission_control_prospects(organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_atlas_mission_control_processed_org
  ON atlas_mission_control_processed_events(organization_id, processed_at DESC);

COMMENT ON TABLE atlas_mission_control_state IS 'Sprint 15.0 — Mission Control projection aggregate derived from Business Events';
COMMENT ON TABLE atlas_mission_control_processed_events IS 'Sprint 15.0 — Mission Control projection idempotency ledger';
