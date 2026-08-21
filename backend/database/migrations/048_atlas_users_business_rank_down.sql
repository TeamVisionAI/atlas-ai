-- Down: 048_atlas_users_business_rank

DROP INDEX IF EXISTS idx_atlas_users_org_business_rank;
ALTER TABLE atlas_users DROP COLUMN IF EXISTS business_rank;
