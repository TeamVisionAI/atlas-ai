-- Sprint 15.1 — Executive Dashboard read model (projection store)

CREATE TABLE IF NOT EXISTS atlas_executive_dashboard_state (
  organization_id UUID PRIMARY KEY DEFAULT '00000000-0000-4000-8000-000000000001',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  prospects JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS atlas_executive_dashboard_processed_events (
  business_event_id UUID PRIMARY KEY,
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_executive_dashboard_processed_org
  ON atlas_executive_dashboard_processed_events(organization_id, processed_at DESC);

COMMENT ON TABLE atlas_executive_dashboard_state IS 'Sprint 15.1 — Executive Dashboard projection aggregate derived from Business Events';
COMMENT ON TABLE atlas_executive_dashboard_processed_events IS 'Sprint 15.1 — Executive Dashboard projection idempotency ledger';
