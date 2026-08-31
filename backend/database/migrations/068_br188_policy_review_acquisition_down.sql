-- BR-188 down — drop acquisition columns and indexes only. Keep the BR-186 pipeline.

BEGIN;

DROP INDEX IF EXISTS idx_atlas_pr_pipeline_org_campaign;
DROP INDEX IF EXISTS idx_atlas_pr_pipeline_org_intake;
DROP INDEX IF EXISTS idx_atlas_pr_pipeline_org_platform;

ALTER TABLE atlas_policy_review_pipeline
  DROP COLUMN IF EXISTS acquisition,
  DROP COLUMN IF EXISTS latest_touch_at,
  DROP COLUMN IF EXISTS first_touch_at,
  DROP COLUMN IF EXISTS utm_term,
  DROP COLUMN IF EXISTS utm_content,
  DROP COLUMN IF EXISTS utm_campaign,
  DROP COLUMN IF EXISTS utm_medium,
  DROP COLUMN IF EXISTS utm_source,
  DROP COLUMN IF EXISTS landing_form_source,
  DROP COLUMN IF EXISTS creative_name,
  DROP COLUMN IF EXISTS adset_name,
  DROP COLUMN IF EXISTS ad_name,
  DROP COLUMN IF EXISTS campaign_name,
  DROP COLUMN IF EXISTS campaign_id,
  DROP COLUMN IF EXISTS source_platform;

COMMIT;
