-- BR-168 — Unified Agenda V1
-- Standalone agenda contacts may be scheduled before they become Atlas prospects.
-- Backend-only table; operational access is enforced by Atlas auth/tenant scope.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_agenda_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  owner_user_id UUID NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  promoted_prospect_id UUID,
  promoted_client_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_agenda_contacts_status_check
    CHECK (status IN ('active', 'promoted_recruit', 'promoted_client', 'archived'))
);

CREATE INDEX IF NOT EXISTS idx_atlas_agenda_contacts_org_owner
  ON atlas_agenda_contacts(organization_id, owner_user_id);

CREATE INDEX IF NOT EXISTS idx_atlas_agenda_contacts_org_phone
  ON atlas_agenda_contacts(organization_id, phone)
  WHERE phone IS NOT NULL;

ALTER TABLE atlas_agenda_contacts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_agenda_contacts FROM anon, authenticated;
GRANT ALL ON TABLE atlas_agenda_contacts TO service_role;

ALTER TABLE atlas_appointments
  ADD COLUMN IF NOT EXISTS agenda_contact_id UUID;

-- Existing recruiting appointments continue to carry prospect_phone. Standalone Agenda
-- appointments may have no prospect yet, so the legacy column can no longer be required.
ALTER TABLE atlas_appointments
  ALTER COLUMN prospect_phone DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_appointments_agenda_contact
  ON atlas_appointments(agenda_contact_id)
  WHERE agenda_contact_id IS NOT NULL;

COMMIT;
