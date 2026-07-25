-- Sprint 16.9 — Atlas SaaS Multi-Tenant Foundation
-- Migration 011
-- Additive: extends existing LC1 schema without breaking atlas_users FK references.

-- ---------------------------------------------------------------------------
-- PART 1 — Organizations (extend existing table)
-- ---------------------------------------------------------------------------

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#1a365d';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#2b6cb0';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_plan TEXT DEFAULT 'professional';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- Align status column with is_active for existing rows
UPDATE organizations
SET is_active = (status = 'active')
WHERE is_active IS NULL OR is_active = true;

UPDATE organizations
SET
  name = 'Team Vision',
  slug = 'team-vision',
  status = 'active',
  is_active = true,
  subscription_plan = COALESCE(subscription_plan, 'professional'),
  subscription_status = COALESCE(subscription_status, 'active'),
  timezone = COALESCE(timezone, 'America/New_York'),
  updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- PART 2 — Users (canonical SaaS identity table)
-- ---------------------------------------------------------------------------

-- Sanitize orphan ownership before users ↔ atlas_users synchronization.
UPDATE prospects
SET owner_user_id = NULL
WHERE owner_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = prospects.owner_user_id);

UPDATE prospects
SET created_by_user_id = NULL
WHERE created_by_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = prospects.created_by_user_id);

UPDATE prospects
SET assigned_rvp_id = NULL
WHERE assigned_rvp_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = prospects.assigned_rvp_id);

UPDATE atlas_core_prospects
SET owner_user_id = NULL,
    assigned_agent_id = NULL,
    assigned_rvp_id = NULL
WHERE (owner_user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = atlas_core_prospects.owner_user_id))
   OR (assigned_agent_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = atlas_core_prospects.assigned_agent_id))
   OR (assigned_rvp_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = atlas_core_prospects.assigned_rvp_id));

UPDATE organizations
SET owner_user_id = NULL
WHERE owner_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = organizations.owner_user_id);

UPDATE divisions
SET rvp_user_id = NULL
WHERE rvp_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = divisions.rvp_user_id);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT,
  role TEXT NOT NULL DEFAULT 'REPRESENTATIVE',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Migrate existing atlas_users into users (preserve UUIDs)
INSERT INTO users (
  id, organization_id, name, email, password_hash, role, is_active, last_login, created_at, updated_at
)
SELECT
  au.id,
  COALESCE(au.organization_id, '00000000-0000-4000-8000-000000000001'),
  COALESCE(
    NULLIF(TRIM(au.display_name), ''),
    NULLIF(TRIM(CONCAT(COALESCE(au.first_name, ''), ' ', COALESCE(au.last_name, ''))), ''),
    SPLIT_PART(au.email, '@', 1)
  ),
  au.email,
  au.password_hash,
  CASE au.role
    WHEN 'administrator' THEN 'ADMIN'
    WHEN 'rvp' THEN 'RVP'
    WHEN 'division_leader' THEN 'DIVISION_LEADER'
    WHEN 'operations' THEN 'OPERATIONS'
    WHEN 'support' THEN 'SUPPORT'
    WHEN 'agent' THEN 'REPRESENTATIVE'
    WHEN 'recruiter' THEN 'REPRESENTATIVE'
    ELSE UPPER(REPLACE(COALESCE(au.role, 'recruiter'), ' ', '_'))
  END,
  (au.status = 'active'),
  au.last_login_at,
  au.created_at,
  COALESCE(au.updated_at, au.created_at, now())
FROM atlas_users au
WHERE au.email IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  organization_id = EXCLUDED.organization_id,
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  password_hash = COALESCE(EXCLUDED.password_hash, users.password_hash),
  role = EXCLUDED.role,
  is_active = EXCLUDED.is_active,
  last_login = COALESCE(EXCLUDED.last_login, users.last_login),
  updated_at = now();

-- Keep atlas_users in sync when users table changes (backward compatibility)
CREATE OR REPLACE FUNCTION sync_atlas_users_from_users()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM atlas_users WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO atlas_users (
    id, email, first_name, last_name, display_name,
    organization_id, role, status, password_hash,
    last_login_at, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    SPLIT_PART(NEW.name, ' ', 1),
    NULLIF(TRIM(SUBSTRING(NEW.name FROM POSITION(' ' IN NEW.name) + 1)), ''),
    NEW.name,
    NEW.organization_id,
    CASE NEW.role
      WHEN 'SUPER_ADMIN' THEN 'administrator'
      WHEN 'ADMIN' THEN 'administrator'
      WHEN 'OPERATIONS' THEN 'operations'
      WHEN 'SUPPORT' THEN 'support'
      WHEN 'RVP' THEN 'rvp'
      WHEN 'DIVISION_LEADER' THEN 'division_leader'
      WHEN 'REGIONAL_LEADER' THEN 'division_leader'
      WHEN 'FIELD_TRAINER' THEN 'agent'
      WHEN 'REPRESENTATIVE' THEN 'recruiter'
      ELSE LOWER(REPLACE(NEW.role, '_', ' '))
    END,
    CASE WHEN NEW.is_active THEN 'active' ELSE 'suspended' END,
    NEW.password_hash,
    NEW.last_login,
    NEW.created_at,
    NEW.updated_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    display_name = EXCLUDED.display_name,
    organization_id = EXCLUDED.organization_id,
    role = EXCLUDED.role,
    status = EXCLUDED.status,
    password_hash = COALESCE(EXCLUDED.password_hash, atlas_users.password_hash),
    last_login_at = EXCLUDED.last_login_at,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_atlas_users_from_users ON users;
CREATE TRIGGER trg_sync_atlas_users_from_users
  AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION sync_atlas_users_from_users();

-- ---------------------------------------------------------------------------
-- PART 3 — Roles
-- ---------------------------------------------------------------------------

-- Correct legacy role mappings if migration was previously applied with incorrect ADMIN mapping.
UPDATE users u
SET role = 'OPERATIONS', updated_at = now()
FROM atlas_users au
WHERE u.id = au.id AND au.role = 'operations' AND u.role = 'ADMIN';

UPDATE users u
SET role = 'SUPPORT', updated_at = now()
FROM atlas_users au
WHERE u.id = au.id AND au.role = 'support' AND u.role IN ('REPRESENTATIVE', 'ADMIN');

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO roles (code, name, description) VALUES
  ('SUPER_ADMIN', 'Super Admin', 'Platform-wide administrator across all organizations'),
  ('ADMIN', 'Admin', 'Organization administrator with full org access'),
  ('OPERATIONS', 'Operations', 'Operations Center access only — no prospect mutations'),
  ('SUPPORT', 'Support', 'Limited troubleshooting with masked PII'),
  ('RVP', 'RVP', 'Regional Vice President — organization-wide recruiting leadership'),
  ('DIVISION_LEADER', 'Division Leader', 'Division-scoped recruiting leadership'),
  ('REGIONAL_LEADER', 'Regional Leader', 'Regional recruiting leadership'),
  ('FIELD_TRAINER', 'Field Trainer', 'Field training and assigned prospect management'),
  ('REPRESENTATIVE', 'Representative', 'Individual contributor — assigned prospects only')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- PART 4 — Permissions (DB-backed, not hardcoded)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO permissions (code, name, category) VALUES
  ('dashboard:read', 'Dashboard', 'Dashboard'),
  ('dashboard:executive', 'Executive Dashboard', 'Dashboard'),
  ('mission_control:access', 'Mission Control', 'Operations'),
  ('prospect_center:access', 'Prospect Center', 'Prospects'),
  ('prospect:read', 'Prospect Read', 'Prospects'),
  ('prospect:write', 'Prospect Write', 'Prospects'),
  ('prospect:assign', 'Prospect Assign', 'Prospects'),
  ('prospect:communicate', 'Prospect Communicate', 'Prospects'),
  ('calendar:access', 'Calendar', 'Calendar'),
  ('ai:access', 'AI', 'AI'),
  ('reports:access', 'Reports', 'Reports'),
  ('users:manage', 'Users', 'Administration'),
  ('settings:manage', 'Settings', 'Administration'),
  ('billing:access', 'Billing', 'Administration'),
  ('meta:access', 'Meta', 'Integrations'),
  ('whatsapp:access', 'WhatsApp', 'Integrations'),
  ('workflow_builder:access', 'Workflow Builder', 'Workflows'),
  ('operations:access', 'Operations Center', 'Operations'),
  ('org:read', 'Organization Read', 'Administration'),
  ('org:write', 'Organization Write', 'Administration'),
  ('audit:read', 'Audit Read', 'Administration')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_code TEXT NOT NULL REFERENCES roles(code) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (role_code, permission_code)
);

-- Seed role_permissions (SUPER_ADMIN and ADMIN get all permissions)
INSERT INTO role_permissions (role_code, permission_code)
SELECT 'SUPER_ADMIN', code FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT 'ADMIN', code FROM permissions
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'RVP'
  AND p.code IN (
    'dashboard:read', 'dashboard:executive', 'mission_control:access',
    'prospect_center:access', 'prospect:read', 'prospect:write',
    'prospect:assign', 'prospect:communicate', 'calendar:access',
    'reports:access', 'org:read', 'audit:read', 'whatsapp:access', 'meta:access'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'DIVISION_LEADER'
  AND p.code IN (
    'dashboard:read', 'dashboard:executive', 'mission_control:access',
    'prospect_center:access', 'prospect:read', 'prospect:write',
    'prospect:assign', 'prospect:communicate', 'calendar:access',
    'reports:access', 'org:read'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('REGIONAL_LEADER', 'FIELD_TRAINER')
  AND p.code IN (
    'dashboard:read', 'prospect_center:access',
    'prospect:read', 'prospect:write', 'prospect:communicate',
    'calendar:access'
  )
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'OPERATIONS'
  AND p.code IN ('operations:access', 'audit:read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPPORT'
  AND p.code IN ('prospect:read', 'audit:read')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'REPRESENTATIVE'
  AND p.code IN (
    'dashboard:read', 'prospect_center:access',
    'prospect:read', 'prospect:write', 'prospect:communicate'
  )
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission_code TEXT NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_by UUID REFERENCES users(id),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, permission_code)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);

-- ---------------------------------------------------------------------------
-- PART 5 — Tenant isolation (organization_id on business tables)
-- ---------------------------------------------------------------------------

ALTER TABLE conversation_logs ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE workflow_events ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE conversation_logs
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;

UPDATE workflow_events
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_logs_org ON conversation_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_workflow_events_org ON workflow_events(organization_id);

CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organization_settings (organization_id)
VALUES ('00000000-0000-4000-8000-000000000001')
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- PART 9 — Organization integrations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected',
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  credentials_encrypted TEXT,
  connected_at TIMESTAMPTZ,
  connected_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT org_integrations_unique UNIQUE (organization_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_org_integrations_org ON organization_integrations(organization_id);

INSERT INTO organization_integrations (organization_id, provider, status)
SELECT '00000000-0000-4000-8000-000000000001', provider, 'disconnected'
FROM (VALUES ('meta'), ('whatsapp'), ('google_calendar'), ('google_drive'), ('email'), ('openai')) AS p(provider)
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- PART 10 — Subscription architecture
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'professional',
  status TEXT NOT NULL DEFAULT 'active',
  renewal_date TIMESTAMPTZ,
  limits JSONB NOT NULL DEFAULT '{
    "max_users": 50,
    "max_prospects": 10000,
    "max_whatsapp_numbers": 5,
    "ai_tokens_monthly": 100000
  }'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organization_subscriptions (organization_id, plan, status, renewal_date)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'professional',
  'active',
  (now() + interval '1 year')
)
ON CONFLICT (organization_id) DO UPDATE SET
  plan = EXCLUDED.plan,
  status = EXCLUDED.status,
  updated_at = now();

-- Sync organizations.subscription_plan from subscription table
UPDATE organizations o
SET
  subscription_plan = os.plan,
  subscription_status = os.status
FROM organization_subscriptions os
WHERE o.id = os.organization_id;

-- ---------------------------------------------------------------------------
-- PART 11 — Future-ready extension registry
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS organization_features (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  feature_code TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, feature_code)
);

INSERT INTO organization_features (organization_id, feature_code, enabled) VALUES
  ('00000000-0000-4000-8000-000000000001', 'workflow_marketplace', false),
  ('00000000-0000-4000-8000-000000000001', 'custom_ai_agents', false),
  ('00000000-0000-4000-8000-000000000001', 'crm_integrations', false),
  ('00000000-0000-4000-8000-000000000001', 'insurance_products', false),
  ('00000000-0000-4000-8000-000000000001', 'recruiting_products', true),
  ('00000000-0000-4000-8000-000000000001', 'client_portal', false),
  ('00000000-0000-4000-8000-000000000001', 'api_access', false)
ON CONFLICT DO NOTHING;

-- JWT session tracking (supports revocation alongside atlas_sessions)
ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS jwt_jti TEXT;
ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS token_type TEXT NOT NULL DEFAULT 'opaque';

CREATE INDEX IF NOT EXISTS idx_atlas_sessions_jti ON atlas_sessions(jwt_jti)
  WHERE jwt_jti IS NOT NULL;

-- RLS on new tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_features ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_deny_anon ON users;
CREATE POLICY users_deny_anon ON users FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS roles_deny_anon ON roles;
CREATE POLICY roles_deny_anon ON roles FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS permissions_deny_anon ON permissions;
CREATE POLICY permissions_deny_anon ON permissions FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS role_permissions_deny_anon ON role_permissions;
CREATE POLICY role_permissions_deny_anon ON role_permissions FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS user_permissions_deny_anon ON user_permissions;
CREATE POLICY user_permissions_deny_anon ON user_permissions FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS org_integrations_deny_anon ON organization_integrations;
CREATE POLICY org_integrations_deny_anon ON organization_integrations FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS org_subscriptions_deny_anon ON organization_subscriptions;
CREATE POLICY org_subscriptions_deny_anon ON organization_subscriptions FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS org_settings_deny_anon ON organization_settings;
CREATE POLICY org_settings_deny_anon ON organization_settings FOR ALL TO anon USING (false);

DROP POLICY IF EXISTS org_features_deny_anon ON organization_features;
CREATE POLICY org_features_deny_anon ON organization_features FOR ALL TO anon USING (false);

COMMENT ON TABLE users IS 'Sprint 16.9 — Canonical SaaS identity table (syncs to atlas_users)';
COMMENT ON TABLE roles IS 'Sprint 16.9 — DB-backed role definitions';
COMMENT ON TABLE permissions IS 'Sprint 16.9 — DB-backed permission definitions';
COMMENT ON TABLE organization_integrations IS 'Sprint 16.9 — Per-organization integration credentials';
COMMENT ON TABLE organization_subscriptions IS 'Sprint 16.9 — Subscription plans and limits';
