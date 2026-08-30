BEGIN;

DROP INDEX IF EXISTS idx_atlas_agenda_clients_contact;
DROP INDEX IF EXISTS idx_atlas_agenda_clients_org_owner;
DROP TABLE IF EXISTS atlas_agenda_clients;

ALTER TABLE atlas_agenda_contacts
  DROP COLUMN IF EXISTS notes,
  DROP COLUMN IF EXISTS source,
  DROP COLUMN IF EXISTS preferred_language;

COMMIT;
