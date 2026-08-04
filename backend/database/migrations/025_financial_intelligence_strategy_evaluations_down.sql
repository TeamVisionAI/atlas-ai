-- Rollback RC3 Financial Intelligence strategy evaluations (migration 025)

DROP INDEX IF EXISTS idx_atlas_fi_strategy_evaluations_status;
DROP INDEX IF EXISTS idx_atlas_fi_strategy_evaluations_prospect;
DROP INDEX IF EXISTS idx_atlas_fi_strategy_evaluations_family;
DROP INDEX IF EXISTS idx_atlas_fi_strategy_evaluations_review;
DROP INDEX IF EXISTS idx_atlas_fi_strategy_evaluations_org;

DROP TABLE IF EXISTS atlas_fi_strategy_evaluations;
