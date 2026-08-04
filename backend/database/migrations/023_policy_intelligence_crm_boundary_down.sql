-- Rollback BR-056 CRM boundary (migration 023)

DROP INDEX IF EXISTS idx_atlas_policy_reviews_crm_policy_ref_hash;

ALTER TABLE atlas_policy_reviews
  DROP COLUMN IF EXISTS crm_policy_ref_hash;
