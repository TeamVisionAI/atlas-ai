-- Sprint 4A — Annual Values Engine (Policy Intelligence)
-- Migration 024
-- Implements BR-060 — canonical AnnualValue timeline linked to reviewId
-- Does not alter Insurance Facts, Rule Engine, or Language Layer tables.

-- ---------------------------------------------------------------------------
-- Annual value analysis set (one active set per review)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_policy_annual_value_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  policy_review_id UUID NOT NULL REFERENCES atlas_policy_reviews(id) ON DELETE CASCADE,
  policy_extraction_id UUID REFERENCES atlas_policy_extractions(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'structured_table',
  row_count INTEGER NOT NULL DEFAULT 0,
  summary_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_results JSONB NOT NULL DEFAULT '{}'::jsonb,
  calculation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

COMMENT ON TABLE atlas_policy_annual_value_sets IS
  'Policy Intelligence — Annual Values analysis set (timeline summary + validation). Sprint 4A / BR-060.';

CREATE INDEX IF NOT EXISTS idx_atlas_policy_annual_value_sets_org
  ON atlas_policy_annual_value_sets(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_policy_annual_value_sets_review
  ON atlas_policy_annual_value_sets(policy_review_id)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Canonical AnnualValue entities (one row per policy year)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_policy_annual_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  annual_value_set_id UUID NOT NULL REFERENCES atlas_policy_annual_value_sets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  policy_review_id UUID NOT NULL REFERENCES atlas_policy_reviews(id) ON DELETE CASCADE,
  policy_year INTEGER NOT NULL,
  insured_age INTEGER,
  annual_premium NUMERIC,
  scheduled_premium NUMERIC,
  premium_load NUMERIC,
  administrative_charge NUMERIC,
  cost_of_insurance NUMERIC,
  rider_charges NUMERIC,
  interest_credited NUMERIC,
  account_value NUMERIC,
  cash_value NUMERIC,
  cash_surrender_value NUMERIC,
  death_benefit NUMERIC,
  loan_balance NUMERIC,
  withdrawals NUMERIC,
  net_cash_value NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_policy_annual_values_set_year_unique UNIQUE (annual_value_set_id, policy_year)
);

COMMENT ON TABLE atlas_policy_annual_values IS
  'Policy Intelligence — canonical AnnualValue entity rows linked to reviewId. Sprint 4A / BR-060.';

CREATE INDEX IF NOT EXISTS idx_atlas_policy_annual_values_review
  ON atlas_policy_annual_values(policy_review_id, policy_year);

CREATE INDEX IF NOT EXISTS idx_atlas_policy_annual_values_set
  ON atlas_policy_annual_values(annual_value_set_id);
