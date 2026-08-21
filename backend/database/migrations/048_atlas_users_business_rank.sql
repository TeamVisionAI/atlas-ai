-- Team Vision business rank (distinct from LC1 permission role).
-- Hierarchy: RVP → SRL → RL → DIV → DIS → REP

ALTER TABLE atlas_users
  ADD COLUMN IF NOT EXISTS business_rank TEXT;

CREATE INDEX IF NOT EXISTS idx_atlas_users_org_business_rank
  ON atlas_users (organization_id, business_rank)
  WHERE business_rank IS NOT NULL;

COMMENT ON COLUMN atlas_users.business_rank IS
  'Team Vision business rank: RVP|SRL|RL|DIV|DIS|REP (separate from atlas_users.role permission role)';
