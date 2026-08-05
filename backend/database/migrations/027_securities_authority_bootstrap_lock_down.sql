-- Rollback securities authority bootstrap lock (migration 027)

DROP INDEX IF EXISTS idx_atlas_org_securities_bootstrap_target;
DROP TABLE IF EXISTS atlas_organization_securities_authority_bootstrap;
