BEGIN;

DROP INDEX IF EXISTS idx_atlas_appointments_agenda_contact;
ALTER TABLE atlas_appointments DROP COLUMN IF EXISTS agenda_contact_id;

-- Rollback cannot safely restore NOT NULL prospect_phone if standalone rows exist.
-- Operator must remove/promote standalone rows before restoring that legacy constraint.
DROP TABLE IF EXISTS atlas_agenda_contacts;

COMMIT;
