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
