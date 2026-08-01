-- Sprint 13.2 — Interview Assignment (BR-042)
-- Canonical interviewer identity for appointment-scoped communications.

ALTER TABLE atlas_appointments ADD COLUMN IF NOT EXISTS interviewer_user_id UUID;
ALTER TABLE atlas_appointments ADD COLUMN IF NOT EXISTS interviewer_name TEXT;

UPDATE atlas_appointments
SET interviewer_user_id = agent_id
WHERE interviewer_user_id IS NULL
  AND agent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_interviewer_user_id
  ON atlas_appointments (organization_id, interviewer_user_id)
  WHERE interviewer_user_id IS NOT NULL;

COMMENT ON COLUMN atlas_appointments.interviewer_user_id IS 'Sprint 13.2 — User assigned to conduct the interview (BR-042).';
COMMENT ON COLUMN atlas_appointments.interviewer_name IS 'Sprint 13.2 — Denormalized interviewer display name at assignment time.';
