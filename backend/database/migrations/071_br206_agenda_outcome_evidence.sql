-- BR-206 — Manual Agenda outcome evidence + production split attribution.
-- Recruit relationship does not require a prospect.
-- Recruiter/sponsor is explicit and is not inferred from appointment owner.
-- Service-role writes; deny anon/authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_agenda_recruits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agenda_contact_id UUID NOT NULL REFERENCES atlas_agenda_contacts(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES atlas_appointments(id) ON DELETE SET NULL,
  name TEXT,
  phone TEXT,
  recruiter_user_id UUID REFERENCES atlas_users(id),
  recruiter_agenda_contact_id UUID REFERENCES atlas_agenda_contacts(id),
  recruiter_client_id UUID REFERENCES atlas_agenda_clients(id),
  recruiter_display_name TEXT,
  recruited_at TIMESTAMPTZ,
  linked_prospect_id UUID,
  created_by_user_id UUID REFERENCES atlas_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, agenda_contact_id)
);

COMMENT ON TABLE atlas_agenda_recruits IS
  'BR-206 recruit relationship/evidence for Agenda. Does not require or create a prospect. Recruiter attribution is explicit.';

CREATE INDEX IF NOT EXISTS idx_atlas_agenda_recruits_org_recruiter
  ON atlas_agenda_recruits (organization_id, recruiter_user_id, recruiter_agenda_contact_id);

CREATE INDEX IF NOT EXISTS idx_atlas_agenda_recruits_org_appointment
  ON atlas_agenda_recruits (organization_id, appointment_id);

ALTER TABLE atlas_agenda_recruits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_agenda_recruits FROM anon, authenticated;
GRANT ALL ON TABLE atlas_agenda_recruits TO service_role;

CREATE TABLE IF NOT EXISTS atlas_client_production_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  production_id UUID NOT NULL REFERENCES atlas_client_production(id) ON DELETE CASCADE,
  agent_user_id UUID REFERENCES atlas_users(id),
  participant_display_name TEXT,
  split_percent NUMERIC(8, 4),
  credited_amount NUMERIC,
  created_by_user_id UUID REFERENCES atlas_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (split_percent IS NULL OR split_percent >= 0),
  CHECK (credited_amount IS NULL OR credited_amount >= 0)
);

COMMENT ON TABLE atlas_client_production_attributions IS
  'BR-206 production split rows. KPI total premium is the parent policy amount, not the sum of credits.';

CREATE INDEX IF NOT EXISTS idx_atlas_client_production_attributions_prod
  ON atlas_client_production_attributions (organization_id, production_id);

ALTER TABLE atlas_client_production_attributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_client_production_attributions FROM anon, authenticated;
GRANT ALL ON TABLE atlas_client_production_attributions TO service_role;

COMMIT;
