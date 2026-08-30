-- BR-177 — Unified Agenda Actions & Promotion
-- Durable Agenda contact fields + smallest client promotion foundation.
-- Backend-only tables; operational access is enforced by Atlas auth/tenant scope.
-- Does not create a recruiting prospect to represent a client.

BEGIN;

ALTER TABLE atlas_agenda_contacts
  ADD COLUMN IF NOT EXISTS preferred_language TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE TABLE IF NOT EXISTS atlas_agenda_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  agenda_contact_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  preferred_language TEXT,
  source TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_atlas_agenda_clients_org_owner
  ON atlas_agenda_clients(organization_id, owner_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_agenda_clients_contact
  ON atlas_agenda_clients(agenda_contact_id);

ALTER TABLE atlas_agenda_clients ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_agenda_clients FROM anon, authenticated;
GRANT ALL ON TABLE atlas_agenda_clients TO service_role;

COMMIT;
