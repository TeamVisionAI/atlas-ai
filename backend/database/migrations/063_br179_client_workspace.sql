-- BR-179 — Client Workspace V1
-- Reuses atlas_agenda_clients as the canonical client entity.
-- Adds optional lifecycle status + actor-aware history for notes/audit.
-- Does not create a recruiting prospect table or a second client model.

BEGIN;

ALTER TABLE atlas_agenda_clients
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS history JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_atlas_agenda_clients_org_status
  ON atlas_agenda_clients(organization_id, status);

COMMIT;
