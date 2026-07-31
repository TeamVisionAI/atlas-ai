-- Sprint 12.5.6 — Idempotent atlas_appointments baseline repair
-- Ensures public.atlas_appointments exists with all columns required by appointmentRepository.

CREATE TABLE IF NOT EXISTS atlas_appointments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  prospect_id UUID,
  prospect_phone TEXT NOT NULL,
  agent_id UUID NOT NULL,
  purpose TEXT NOT NULL DEFAULT 'recruiting_interview',
  status TEXT NOT NULL DEFAULT 'draft',
  source TEXT NOT NULL DEFAULT 'atlas_ai',
  start_date_time TIMESTAMPTZ NOT NULL,
  end_date_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  meeting_type TEXT NOT NULL DEFAULT 'virtual',
  meeting_provider TEXT,
  meeting_location_type TEXT,
  meeting_location_name TEXT,
  meeting_address TEXT,
  meeting_notes TEXT,
  virtual_meeting_url TEXT,
  calendar_event_id TEXT,
  calendar_provider TEXT,
  confirmation_status TEXT NOT NULL DEFAULT 'pending',
  email_invitation_status TEXT NOT NULL DEFAULT 'pending',
  reminder_status TEXT NOT NULL DEFAULT 'pending',
  human_assist_required BOOLEAN NOT NULL DEFAULT FALSE,
  human_assist_reason TEXT,
  reschedule_count INTEGER NOT NULL DEFAULT 0,
  cancellation_reason TEXT,
  outcome TEXT,
  outcome_notes TEXT,
  owner_rep_id TEXT,
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE atlas_appointments ADD COLUMN IF NOT EXISTS owner_rep_id TEXT;

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_org
  ON atlas_appointments(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_agent
  ON atlas_appointments(agent_id);

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_prospect_phone
  ON atlas_appointments(prospect_phone);

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_start
  ON atlas_appointments(start_date_time);

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_status
  ON atlas_appointments(status);

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_org_start
  ON atlas_appointments(organization_id, start_date_time);

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_owner_rep_id
  ON atlas_appointments (organization_id, owner_rep_id)
  WHERE owner_rep_id IS NOT NULL;

COMMENT ON TABLE atlas_appointments IS 'Sprint 12.5.6 — Canonical persisted appointment records (BR-039).';
