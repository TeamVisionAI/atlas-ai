-- Rollback RC4 securities access authorization (migration 026)

DROP INDEX IF EXISTS idx_atlas_user_securities_auth_history_auth;
DROP INDEX IF EXISTS idx_atlas_user_securities_auth_history_org_user;
DROP TABLE IF EXISTS atlas_user_securities_authorization_history;

DROP INDEX IF EXISTS idx_atlas_user_securities_auth_status;
DROP INDEX IF EXISTS idx_atlas_user_securities_auth_user;
DROP INDEX IF EXISTS idx_atlas_user_securities_auth_org;
DROP TABLE IF EXISTS atlas_user_securities_authorization;

DELETE FROM permissions WHERE code = 'securities:verify';
