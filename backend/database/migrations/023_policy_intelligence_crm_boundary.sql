-- BR-056 — CRM / Policy Intelligence Boundary
-- Migration 023
-- CRM owns identity & policy numbers; Policy Intelligence owns mechanics only.

COMMENT ON TABLE atlas_policy_reviews IS
  'Policy Intelligence — PolicyReview. Identified by review id only in PI APIs (BR-056). prospect_id is an internal CRM FK and must never be exported to AI, embeddings, benchmarks, or reports.';

COMMENT ON COLUMN atlas_policy_reviews.prospect_id IS
  'Internal CRM foreign key only (BR-056). Never expose to AI, Knowledge embeddings, benchmarks, shared/internal PI reports, or research exports.';

-- Optional hashed reconciliation reference for CRM policy numbers (never plaintext).
ALTER TABLE atlas_policy_reviews
  ADD COLUMN IF NOT EXISTS crm_policy_ref_hash TEXT;

COMMENT ON COLUMN atlas_policy_reviews.crm_policy_ref_hash IS
  'SHA-256 hash of org-scoped CRM policy number for reconciliation only. Plaintext policy numbers belong to CRM and must not be stored in Policy Intelligence (BR-056).';

CREATE INDEX IF NOT EXISTS idx_atlas_policy_reviews_crm_policy_ref_hash
  ON atlas_policy_reviews(organization_id, crm_policy_ref_hash)
  WHERE crm_policy_ref_hash IS NOT NULL AND deleted_at IS NULL;
