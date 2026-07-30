-- Sprint 12.2 Phase 1.1 — Appointment owner Rep ID column
-- Moves ownerRepId from metadata JSONB into a dedicated nullable column.
-- Metadata ownerRepId is backfilled and kept temporarily for backward compatibility.

ALTER TABLE atlas_appointments ADD COLUMN IF NOT EXISTS owner_rep_id TEXT;

ALTER TABLE atlas_appointments DROP CONSTRAINT IF EXISTS atlas_appointments_owner_rep_id_format_chk;
ALTER TABLE atlas_appointments ADD CONSTRAINT atlas_appointments_owner_rep_id_format_chk
  CHECK (owner_rep_id IS NULL OR owner_rep_id ~ '^[A-Z0-9]{5}$');

UPDATE atlas_appointments
SET owner_rep_id = UPPER(TRIM(metadata->>'ownerRepId'))
WHERE owner_rep_id IS NULL
  AND metadata->>'ownerRepId' IS NOT NULL
  AND TRIM(metadata->>'ownerRepId') <> ''
  AND UPPER(TRIM(metadata->>'ownerRepId')) ~ '^[A-Z0-9]{5}$';

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_owner_rep_id
  ON atlas_appointments (organization_id, owner_rep_id)
  WHERE owner_rep_id IS NOT NULL;

COMMENT ON COLUMN atlas_appointments.owner_rep_id IS 'Sprint 12.2 — Organization-scoped recruiter Rep ID owning the appointment (nullable).';
