-- Sprint 12.2 Phase 1.1 — Appointment owner Rep ID rollback

DROP INDEX IF EXISTS idx_atlas_appointments_owner_rep_id;

ALTER TABLE atlas_appointments DROP CONSTRAINT IF EXISTS atlas_appointments_owner_rep_id_format_chk;

ALTER TABLE atlas_appointments DROP COLUMN IF EXISTS owner_rep_id;
