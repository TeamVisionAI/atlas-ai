-- BR-186 down — pipeline and commission defaults only.

BEGIN;

DROP TABLE IF EXISTS atlas_policy_review_commission_defaults;
DROP TABLE IF EXISTS atlas_policy_review_pipeline;

COMMIT;
