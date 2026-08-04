-- RC3 Phase A — Financial Intelligence strategy evaluations
-- Migration 025
-- Implements BR-062+ — Invest-the-Difference Strategy Evaluation persistence
-- Does not alter Policy Intelligence tables (Facts, Rules, Annual Values, Findings).

-- ---------------------------------------------------------------------------
-- Strategy evaluation snapshots (versioned; FI-owned)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_fi_strategy_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  review_id UUID NOT NULL REFERENCES atlas_policy_reviews(id) ON DELETE CASCADE,
  prospect_id UUID,
  evaluation_family_id UUID NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT_TERM_QUOTE_REQUIRED',
  strategy_key TEXT NOT NULL DEFAULT 'invest_the_difference',
  section_title TEXT NOT NULL DEFAULT 'Possible Discussion Scenarios for the Primerica Representative',

  -- PI-derived snapshot (FI-owned copy; never written back to PI)
  current_iul_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_fact_version TEXT,
  current_iul_monthly_premium NUMERIC,
  current_iul_death_benefit NUMERIC,

  -- Representative-entered inputs
  term_quote JSONB NOT NULL DEFAULT '{}'::jsonb,
  proposed_term_death_benefit NUMERIC,
  proposed_term_duration INTEGER,
  proposed_term_monthly_premium NUMERIC,
  premium_source TEXT NOT NULL DEFAULT 'MISSING',
  quote_confirmation_status TEXT,
  eligibility_confirmation_status TEXT,
  investment_horizon JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_profile TEXT NOT NULL DEFAULT 'NOT_COMPLETED',
  replacement_acknowledged BOOLEAN NOT NULL DEFAULT FALSE,

  -- Calculations
  unbounded_premium_difference NUMERIC,
  monthly_investment_difference NUMERIC,
  total_proposed_monthly_outlay NUMERIC,
  projection_assumptions JSONB NOT NULL DEFAULT '{}'::jsonb,
  projection_outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  evaluation_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Warnings / overrides
  missing_data_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  replacement_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  representative_override JSONB,
  override_reason TEXT,

  -- Audit / versioning
  superseded_by UUID,
  created_by UUID,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT atlas_fi_strategy_evaluations_family_version_unique
    UNIQUE (evaluation_family_id, version)
);

COMMENT ON TABLE atlas_fi_strategy_evaluations IS
  'Financial Intelligence — Invest-the-Difference Strategy Evaluation snapshots (RC3). FI-owned; does not mutate PI.';

COMMENT ON COLUMN atlas_fi_strategy_evaluations.prospect_id IS
  'Optional CRM linkage. Must remain outside PI Facts and PI shared reports (BR-056 / BR-062).';

COMMENT ON COLUMN atlas_fi_strategy_evaluations.current_iul_snapshot IS
  'FI-owned CurrentIulSnapshot copied from PI Facts via adapter. Never written back to PI.';

CREATE INDEX IF NOT EXISTS idx_atlas_fi_strategy_evaluations_org
  ON atlas_fi_strategy_evaluations(organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_fi_strategy_evaluations_review
  ON atlas_fi_strategy_evaluations(organization_id, review_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_fi_strategy_evaluations_family
  ON atlas_fi_strategy_evaluations(evaluation_family_id, version DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_fi_strategy_evaluations_prospect
  ON atlas_fi_strategy_evaluations(organization_id, prospect_id)
  WHERE prospect_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_fi_strategy_evaluations_status
  ON atlas_fi_strategy_evaluations(organization_id, status)
  WHERE deleted_at IS NULL;
