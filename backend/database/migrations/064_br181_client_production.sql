-- BR-181 — Client Production / Activity Foundation
-- Canonical production records for clients. Not recruiting prospects.
-- Service-role writes; deny anon/authenticated. Manual status only.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_client_production (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES atlas_agenda_clients(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES atlas_users(id),
  activity_type TEXT NOT NULL
    CHECK (activity_type IN (
      'LIFE',
      'INVESTMENT',
      'ANNUITY',
      'POLICY_REVIEW',
      'OTHER'
    )),
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN (
      'DRAFT',
      'SUBMITTED',
      'PENDING',
      'ISSUED',
      'PAID',
      'DECLINED',
      'WITHDRAWN',
      'CLOSED'
    )),
  carrier TEXT,
  product_type TEXT,
  amount NUMERIC,
  submitted_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  notes TEXT,
  created_by_user_id UUID REFERENCES atlas_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE atlas_client_production IS
  'BR-181 client production/activity. Amounts stay null unless a real value is stored. Not a recruiting prospect.';

CREATE INDEX IF NOT EXISTS idx_atlas_client_production_org_owner_status
  ON atlas_client_production (organization_id, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_atlas_client_production_org_client
  ON atlas_client_production (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_atlas_client_production_org_type
  ON atlas_client_production (organization_id, activity_type, status);

CREATE INDEX IF NOT EXISTS idx_atlas_client_production_org_submitted
  ON atlas_client_production (organization_id, submitted_at)
  WHERE submitted_at IS NOT NULL;

ALTER TABLE atlas_client_production ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_client_production FROM anon, authenticated;
GRANT ALL ON TABLE atlas_client_production TO service_role;

COMMIT;
