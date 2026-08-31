-- BR-194 — Agenda CLIENT conversion links to canonical atlas_client_production.
-- Existing manual production rows stay valid (appointment_id NULL).
-- Isolation remains organization_id. Unique per org + appointment.

BEGIN;

ALTER TABLE atlas_client_production
  ADD COLUMN IF NOT EXISTS appointment_id UUID REFERENCES appointments(id) ON DELETE SET NULL;

ALTER TABLE atlas_client_production
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'USD';

ALTER TABLE atlas_client_production
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'MANUAL';

ALTER TABLE atlas_client_production
  DROP CONSTRAINT IF EXISTS atlas_client_production_source_check;

ALTER TABLE atlas_client_production
  ADD CONSTRAINT atlas_client_production_source_check
  CHECK (source IN ('MANUAL', 'AGENDA_CLIENT_CONVERSION'));

COMMENT ON COLUMN atlas_client_production.appointment_id IS
  'BR-194. Agenda appointment that created this production row. Null for manual BR-181 records.';

COMMENT ON COLUMN atlas_client_production.currency IS
  'ISO-like currency code for premium. Default USD.';

COMMENT ON COLUMN atlas_client_production.source IS
  'MANUAL = existing Production UI. AGENDA_CLIENT_CONVERSION = Agenda CLIENT premium capture.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_atlas_client_production_org_appointment
  ON atlas_client_production (organization_id, appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_client_production_org_source
  ON atlas_client_production (organization_id, source, status);

COMMIT;
