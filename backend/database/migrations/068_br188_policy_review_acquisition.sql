-- BR-188 — IUL / policy-review acquisition attribution V1
-- Extends atlas_policy_review_pipeline with first/latest-touch fields.
-- Does not create a second identity table. Spend/CPL/ROAS stay null until a later BR.
-- Service-role writes; deny anon/authenticated. Tenant identity is organization_id.

BEGIN;

ALTER TABLE atlas_policy_review_pipeline
  ADD COLUMN IF NOT EXISTS source_platform TEXT,
  ADD COLUMN IF NOT EXISTS campaign_id TEXT,
  ADD COLUMN IF NOT EXISTS campaign_name TEXT,
  ADD COLUMN IF NOT EXISTS ad_name TEXT,
  ADD COLUMN IF NOT EXISTS adset_name TEXT,
  ADD COLUMN IF NOT EXISTS creative_name TEXT,
  ADD COLUMN IF NOT EXISTS landing_form_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_source TEXT,
  ADD COLUMN IF NOT EXISTS utm_medium TEXT,
  ADD COLUMN IF NOT EXISTS utm_campaign TEXT,
  ADD COLUMN IF NOT EXISTS utm_content TEXT,
  ADD COLUMN IF NOT EXISTS utm_term TEXT,
  ADD COLUMN IF NOT EXISTS first_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS latest_touch_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acquisition JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN atlas_policy_review_pipeline.acquisition IS
  'BR-188 firstTouch + latestTouch snapshot. Raw provider IDs and CTWA metadata live here.';

CREATE INDEX IF NOT EXISTS idx_atlas_pr_pipeline_org_platform
  ON atlas_policy_review_pipeline (organization_id, source_platform);

CREATE INDEX IF NOT EXISTS idx_atlas_pr_pipeline_org_intake
  ON atlas_policy_review_pipeline (organization_id, campaign_intake_code);

CREATE INDEX IF NOT EXISTS idx_atlas_pr_pipeline_org_campaign
  ON atlas_policy_review_pipeline (organization_id, campaign_id);

COMMIT;
