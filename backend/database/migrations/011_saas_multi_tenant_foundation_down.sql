-- Sprint 16.9 — Rollback migration for saas_multi_tenant_foundation
-- Run manually only when reverting migration 011.

DROP TRIGGER IF EXISTS trg_sync_atlas_users_from_users ON users;
DROP FUNCTION IF EXISTS sync_atlas_users_from_users();

DROP TABLE IF EXISTS user_permissions;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS organization_features;
DROP TABLE IF EXISTS organization_integrations;
DROP TABLE IF EXISTS organization_subscriptions;
DROP TABLE IF EXISTS organization_settings;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;

ALTER TABLE atlas_sessions DROP COLUMN IF EXISTS jwt_jti;
ALTER TABLE atlas_sessions DROP COLUMN IF EXISTS token_type;

ALTER TABLE conversation_logs DROP COLUMN IF EXISTS organization_id;
ALTER TABLE workflow_events DROP COLUMN IF EXISTS organization_id;

ALTER TABLE organizations DROP COLUMN IF EXISTS logo_url;
ALTER TABLE organizations DROP COLUMN IF EXISTS primary_color;
ALTER TABLE organizations DROP COLUMN IF EXISTS secondary_color;
ALTER TABLE organizations DROP COLUMN IF EXISTS website;
ALTER TABLE organizations DROP COLUMN IF EXISTS timezone;
ALTER TABLE organizations DROP COLUMN IF EXISTS subscription_plan;
ALTER TABLE organizations DROP COLUMN IF EXISTS subscription_status;
ALTER TABLE organizations DROP COLUMN IF EXISTS is_active;
