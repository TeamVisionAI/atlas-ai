-- BR-186 — IUL / Policy Review Pipeline V2
-- Canonical revenue-side review pipeline. Linked to existing clients / service / production.
-- Not recruiting prospects and not Policy Intelligence atlas_policy_reviews.
-- Service-role writes; deny anon/authenticated. Tenant identity is organization_id, not a phone.

BEGIN;

CREATE TABLE IF NOT EXISTS atlas_policy_review_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES atlas_agenda_clients(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES atlas_users(id),
  contact_id UUID,
  service_case_id UUID REFERENCES atlas_client_service_cases(id) ON DELETE SET NULL,
  appointment_id UUID,
  document_request_id UUID,
  production_id UUID REFERENCES atlas_client_production(id) ON DELETE SET NULL,
  linked_prospect_id UUID,
  stage TEXT NOT NULL DEFAULT 'NEW_REVIEW_LEAD'
    CHECK (stage IN (
      'NEW_REVIEW_LEAD',
      'REVIEW_REQUESTED',
      'QUALIFIED',
      'APPOINTMENT_BOOKED',
      'DOCUMENTS_REQUESTED',
      'DOCUMENTS_RECEIVED',
      'REVIEW_COMPLETED',
      'KEEP_CURRENT',
      'ADJUST_CURRENT',
      'REPLACEMENT_OPPORTUNITY',
      'APPLICATION_SUBMITTED',
      'PLACED',
      'NOT_PROCEEDING'
    )),
  language TEXT,
  state TEXT,
  source TEXT,
  campaign TEXT,
  ad_id TEXT,
  adset_id TEXT,
  creative_id TEXT,
  campaign_intake_code TEXT,
  stage_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
  carrier_product_label TEXT,
  monthly_premium NUMERIC(12, 2),
  annualized_premium NUMERIC(12, 2),
  submission_date DATE,
  placed_date DATE,
  commission_level_pct NUMERIC(8, 2),
  paid_advance_factor_pct NUMERIC(8, 2),
  estimated_take_home NUMERIC(12, 2),
  actual_paid_commission NUMERIC(12, 2),
  created_by_user_id UUID REFERENCES atlas_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history JSONB NOT NULL DEFAULT '[]'::jsonb
);

COMMENT ON TABLE atlas_policy_review_pipeline IS
  'BR-186 policy-review pipeline. Replacement is an explicit human outcome only. Not recruiting.';

CREATE INDEX IF NOT EXISTS idx_atlas_pr_pipeline_org_owner_stage
  ON atlas_policy_review_pipeline (organization_id, owner_user_id, stage);

CREATE INDEX IF NOT EXISTS idx_atlas_pr_pipeline_org_client
  ON atlas_policy_review_pipeline (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_atlas_pr_pipeline_org_created
  ON atlas_policy_review_pipeline (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS atlas_policy_review_commission_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES atlas_users(id) ON DELETE CASCADE,
  commission_level_pct NUMERIC(8, 2) NOT NULL,
  paid_advance_factor_pct NUMERIC(8, 2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE atlas_policy_review_commission_defaults IS
  'BR-186 tenant/user commission defaults. user_id null is the organization default.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_pr_commission_org_default
  ON atlas_policy_review_commission_defaults (organization_id)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_pr_commission_user
  ON atlas_policy_review_commission_defaults (organization_id, user_id)
  WHERE user_id IS NOT NULL;

ALTER TABLE atlas_policy_review_pipeline ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_policy_review_pipeline FROM anon, authenticated;
GRANT ALL ON TABLE atlas_policy_review_pipeline TO service_role;

ALTER TABLE atlas_policy_review_commission_defaults ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_policy_review_commission_defaults FROM anon, authenticated;
GRANT ALL ON TABLE atlas_policy_review_commission_defaults TO service_role;

COMMIT;
