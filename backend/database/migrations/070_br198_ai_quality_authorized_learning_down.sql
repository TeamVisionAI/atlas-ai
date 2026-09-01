BEGIN;

DROP TABLE IF EXISTS ai_quality_learning_actions;
DROP TABLE IF EXISTS ai_quality_implementation_proposals;
DROP TABLE IF EXISTS ai_quality_learning_proposals;

ALTER TABLE ai_quality_regression_candidates
  DROP CONSTRAINT IF EXISTS ai_quality_regression_candidates_status_check;

ALTER TABLE ai_quality_regression_candidates
  ADD CONSTRAINT ai_quality_regression_candidates_status_check
  CHECK (status IN ('proposed', 'implemented', 'verified'));

ALTER TABLE ai_quality_regression_candidates
  DROP COLUMN IF EXISTS reviewer_user_id,
  DROP COLUMN IF EXISTS risk_level,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS implementation_authorized,
  DROP COLUMN IF EXISTS updated_at;

ALTER TABLE ai_quality_cases
  DROP COLUMN IF EXISTS learning_proposal_id,
  DROP COLUMN IF EXISTS implementation_id;

COMMIT;
