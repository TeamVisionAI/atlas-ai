-- BR-178 — Follow-up Engine V2
-- Durable tenant-scoped follow-up obligations. Service-role writes; deny anon/authenticated.
-- Source of truth for /app/follow-ups, personal dashboard chips, and BR-176 due/overdue events.
-- agentState.followUpDate / followUpTime remain workflow milestone fields (BR-035+), not the queue SoT.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_follow_ups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  entity_type TEXT NOT NULL
    CHECK (entity_type IN (
      'prospect',
      'appointment',
      'agenda_contact',
      'client',
      'conversation'
    )),
  entity_id TEXT NOT NULL,
  subject_label TEXT,
  subject_phone TEXT,
  source_event TEXT NOT NULL,
  appointment_id TEXT,
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATE NOT NULL,
  due_time TEXT,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'COMPLETED', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL'
    CHECK (priority IN ('NORMAL', 'HIGH')),
  completed_at TIMESTAMPTZ,
  completed_by UUID,
  completion_note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedup_key TEXT NOT NULL,
  history JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE atlas_follow_ups IS
  'BR-178 durable follow-up obligations. DUE/OVERDUE are derived on read from due_date vs org-local today.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_follow_ups_dedup
  ON atlas_follow_ups (organization_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_atlas_follow_ups_org_owner_status
  ON atlas_follow_ups (organization_id, owner_user_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_atlas_follow_ups_org_due
  ON atlas_follow_ups (organization_id, due_date)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_atlas_follow_ups_org_appointment
  ON atlas_follow_ups (organization_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

ALTER TABLE atlas_follow_ups ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_follow_ups FROM anon, authenticated;
GRANT ALL ON TABLE atlas_follow_ups TO service_role;

-- BR-176 event vocabulary expansion for follow-up due/overdue (in-app only).
ALTER TABLE agent_notifications
  DROP CONSTRAINT IF EXISTS agent_notifications_event_type_check;

ALTER TABLE agent_notifications
  ADD CONSTRAINT agent_notifications_event_type_check
  CHECK (event_type IN (
    'NEW_APPOINTMENT',
    'APPOINTMENT_RESCHEDULED',
    'APPOINTMENT_CANCELLED',
    'NEEDS_ATTENTION',
    'HUMAN_TAKEOVER_REQUESTED',
    'FOLLOW_UP_DUE',
    'FOLLOW_UP_OVERDUE'
  ));

COMMIT;
