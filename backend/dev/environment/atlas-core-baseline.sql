-- Sprint 10.1 — Quick Capture prospect fields and Atlas user ownership

CREATE TABLE IF NOT EXISTS atlas_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_sessions_token ON atlas_sessions(token);
CREATE INDEX IF NOT EXISTS idx_atlas_sessions_user_id ON atlas_sessions(user_id);

INSERT INTO atlas_users (id, email, first_name, last_name, display_name)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'ana@teamvision.ai',
    'Ana',
    'Recruiter',
    'Ana'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'niovel@teamvision.ai',
    'Niovel',
    'Perez',
    'Niovel'
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS normalized_phone TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS communication_language TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS entry_method TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES atlas_users(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES atlas_users(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS prospect_number TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS preferred_communication_channel TEXT DEFAULT 'WHATSAPP';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_normalized_phone
  ON prospects(normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_prospect_number
  ON prospects(prospect_number)
  WHERE prospect_number IS NOT NULL;

COMMENT ON COLUMN prospects.normalized_phone IS 'E.164 digits-only phone for deduplication';
COMMENT ON COLUMN prospects.communication_language IS 'Prospect communication language: es | en';
COMMENT ON COLUMN prospects.entry_method IS 'Capture channel e.g. QUICK_CAPTURE';
COMMENT ON COLUMN prospects.source IS 'Manual lead source e.g. IN_PERSON, REFERRAL';
COMMENT ON COLUMN prospects.preferred_communication_channel IS 'Preferred outreach channel e.g. WHATSAPP';
-- Sprint 14.1 — Atlas Core Prospect Engine domain table
-- Separate from legacy `prospects` (phone/conversation workflow).

CREATE TABLE IF NOT EXISTS atlas_core_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-4000-8000-000000000001',

  display_name TEXT,
  legal_name TEXT,

  primary_phone TEXT,
  secondary_phone TEXT,
  normalized_primary_phone TEXT,
  email TEXT,
  secondary_email TEXT,
  preferred_language TEXT DEFAULT 'es',
  timezone TEXT,
  address JSONB NOT NULL DEFAULT '{}'::jsonb,

  lead_source JSONB NOT NULL DEFAULT '{}'::jsonb,
  communication_channels JSONB NOT NULL DEFAULT '[]'::jsonb,

  lifecycle_state TEXT NOT NULL DEFAULT 'new_lead',
  milestone TEXT,
  ownership TEXT NOT NULL DEFAULT 'SYSTEM',
  state_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  previous_state TEXT,

  assigned_agent_id UUID REFERENCES atlas_users(id),
  assigned_at TIMESTAMPTZ,
  assigned_by TEXT,
  assignment_reason TEXT,

  appointments JSONB NOT NULL DEFAULT '[]'::jsonb,
  activities JSONB NOT NULL DEFAULT '[]'::jsonb,
  timeline_meta JSONB NOT NULL DEFAULT '{}'::jsonb,

  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  ai_insights JSONB NOT NULL DEFAULT '[]'::jsonb,
  business_relationships JSONB NOT NULL DEFAULT '{}'::jsonb,

  merged_into_id UUID REFERENCES atlas_core_prospects(id),
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_core_prospects_org
  ON atlas_core_prospects(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_core_prospects_lifecycle
  ON atlas_core_prospects(lifecycle_state)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_core_prospects_email
  ON atlas_core_prospects(lower(email))
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_core_prospects_normalized_phone
  ON atlas_core_prospects(normalized_primary_phone)
  WHERE normalized_primary_phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_core_prospects_assigned_agent
  ON atlas_core_prospects(assigned_agent_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_core_prospects_merged_into
  ON atlas_core_prospects(merged_into_id)
  WHERE merged_into_id IS NOT NULL;

COMMENT ON TABLE atlas_core_prospects IS 'Sprint 14.1 — Atlas Core Prospect Engine domain model';
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
