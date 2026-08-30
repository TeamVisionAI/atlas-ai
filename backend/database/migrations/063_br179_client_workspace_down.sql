BEGIN;

DROP INDEX IF EXISTS idx_atlas_agenda_clients_org_status;

ALTER TABLE atlas_agenda_clients
  DROP COLUMN IF EXISTS history,
  DROP COLUMN IF EXISTS status;

COMMIT;
