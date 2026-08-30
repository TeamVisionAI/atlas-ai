-- BR-182 — Client Service / Policy Review Workspace
-- Canonical service cases for clients. Not recruiting prospects or production statuses.
-- Service-role writes; deny anon/authenticated. Manual status only.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_client_service_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES atlas_agenda_clients(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES atlas_users(id),
  production_id UUID REFERENCES atlas_client_production(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL
    CHECK (service_type IN (
      'POLICY_REVIEW',
      'ANNUAL_REVIEW',
      'BENEFICIARY_UPDATE',
      'DOCUMENT_REQUEST',
      'SERVICE_FOLLOW_UP',
      'GENERAL_SERVICE',
      'OTHER'
    )),
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN (
      'OPEN',
      'WAITING_ON_CLIENT',
      'WAITING_ON_AGENT',
      'SCHEDULED',
      'COMPLETED',
      'CANCELLED'
    )),
  title TEXT NOT NULL,
  notes TEXT,
  due_date DATE,
  scheduled_appointment_id UUID,
  created_by_user_id UUID REFERENCES atlas_users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE atlas_client_service_cases IS
  'BR-182 client service cases. POLICY_REVIEW is a service case, not policy analysis. Due dates stay null unless stored.';

CREATE INDEX IF NOT EXISTS idx_atlas_client_service_org_owner_status
  ON atlas_client_service_cases (organization_id, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_atlas_client_service_org_client
  ON atlas_client_service_cases (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_atlas_client_service_org_type
  ON atlas_client_service_cases (organization_id, service_type, status);

CREATE INDEX IF NOT EXISTS idx_atlas_client_service_org_due
  ON atlas_client_service_cases (organization_id, due_date)
  WHERE status NOT IN ('COMPLETED', 'CANCELLED');

ALTER TABLE atlas_client_service_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_client_service_cases FROM anon, authenticated;
GRANT ALL ON TABLE atlas_client_service_cases TO service_role;

COMMIT;
