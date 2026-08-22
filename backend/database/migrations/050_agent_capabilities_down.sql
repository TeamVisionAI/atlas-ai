-- BR-148 down

DROP INDEX IF EXISTS idx_atlas_users_org_agent_capabilities;
ALTER TABLE atlas_users DROP COLUMN IF EXISTS agent_capabilities;
