-- Down: BR-194 Agenda client production link columns.

BEGIN;

DROP INDEX IF EXISTS idx_atlas_client_production_org_source;
DROP INDEX IF EXISTS uq_atlas_client_production_org_appointment;

ALTER TABLE atlas_client_production
  DROP CONSTRAINT IF EXISTS atlas_client_production_source_check;

ALTER TABLE atlas_client_production
  DROP COLUMN IF EXISTS source;

ALTER TABLE atlas_client_production
  DROP COLUMN IF EXISTS currency;

ALTER TABLE atlas_client_production
  DROP COLUMN IF EXISTS appointment_id;

COMMIT;
