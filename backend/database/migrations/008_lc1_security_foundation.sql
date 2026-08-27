-- LC1 — Security Foundation (Authentication, RBAC, Prospect Ownership, RLS)
-- Migration 008

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO organizations (id, name, slug, status)
VALUES (
  '00000000-0000-4000-8000-000000000001',
  'Team Vision Financial',
  'team-vision',
  'active'
)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rvp_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE divisions
  DROP CONSTRAINT IF EXISTS divisions_rvp_user_id_fkey;

ALTER TABLE divisions
  ADD CONSTRAINT divisions_rvp_user_id_fkey
  FOREIGN KEY (rvp_user_id) REFERENCES atlas_users(id);

CREATE INDEX IF NOT EXISTS idx_divisions_org ON divisions(organization_id);

ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'recruiter';
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS division_id UUID REFERENCES divisions(id);
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS remember_me BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS atlas_password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_user ON atlas_password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS atlas_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES atlas_users(id),
  user_email TEXT,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  result TEXT NOT NULL DEFAULT 'success',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_created ON atlas_audit_log(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_created ON atlas_audit_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON atlas_audit_log(action);

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_division_id UUID REFERENCES divisions(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS assigned_rvp_id UUID REFERENCES atlas_users(id);

ALTER TABLE atlas_core_prospects ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES atlas_users(id);
ALTER TABLE atlas_core_prospects ADD COLUMN IF NOT EXISTS assigned_division_id UUID REFERENCES divisions(id);
ALTER TABLE atlas_core_prospects ADD COLUMN IF NOT EXISTS assigned_rvp_id UUID REFERENCES atlas_users(id);

UPDATE organizations SET updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000001';

UPDATE atlas_users
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;

UPDATE prospects
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;

UPDATE atlas_core_prospects
SET organization_id = '00000000-0000-4000-8000-000000000001'
WHERE organization_id IS NULL;

UPDATE atlas_users
SET role = 'administrator', status = 'active', updated_at = now()
WHERE email = 'niovel@teamvision.ai';

UPDATE atlas_users
SET role = 'recruiter', status = 'active', updated_at = now()
WHERE id = '00000000-0000-4000-8000-000000000001';

-- Ensure seed users exist before prospect ownership backfill (migration 002 may have been skipped).
INSERT INTO atlas_users (id, email, first_name, last_name, display_name)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'ana.reyes1510@gmail.com',
    'Ana',
    'Perez',
    'Ana Perez'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'niovel@teamvision.ai',
    'Niovel',
    'Perez',
    'Niovel'
  )
ON CONFLICT (id) DO NOTHING;

-- Drop orphan ownership references before backfill (invalid FK targets must not be copied forward).
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
SET owner_user_id = NULL
WHERE owner_user_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = atlas_core_prospects.owner_user_id);

UPDATE atlas_core_prospects
SET assigned_agent_id = NULL
WHERE assigned_agent_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = atlas_core_prospects.assigned_agent_id);

UPDATE atlas_core_prospects
SET assigned_rvp_id = NULL
WHERE assigned_rvp_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = atlas_core_prospects.assigned_rvp_id);

-- Backfill ownership only with user IDs that exist in atlas_users.
UPDATE prospects p
SET owner_user_id = COALESCE(
  CASE
    WHEN p.created_by_user_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = p.created_by_user_id)
    THEN p.created_by_user_id
  END,
  (
    SELECT u.id
    FROM atlas_users u
    ORDER BY u.created_at ASC NULLS LAST, u.id ASC
    LIMIT 1
  )
)
WHERE p.owner_user_id IS NULL
  AND EXISTS (SELECT 1 FROM atlas_users u LIMIT 1);

UPDATE atlas_core_prospects acp
SET owner_user_id = COALESCE(
  CASE
    WHEN acp.assigned_agent_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM atlas_users u WHERE u.id = acp.assigned_agent_id)
    THEN acp.assigned_agent_id
  END,
  (
    SELECT u.id
    FROM atlas_users u
    ORDER BY u.created_at ASC NULLS LAST, u.id ASC
    LIMIT 1
  )
)
WHERE acp.owner_user_id IS NULL
  AND EXISTS (SELECT 1 FROM atlas_users u LIMIT 1);

-- Row Level Security (defense in depth — backend uses service role; anon direct access denied)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_core_prospects ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE organizations IS 'LC1 — Tenant boundary for multi-organization isolation';
COMMENT ON TABLE divisions IS 'LC1 — Recruiting hierarchy subdivision within an organization';
COMMENT ON TABLE atlas_audit_log IS 'LC1 — Immutable security and compliance audit trail';

-- Policy summary (enforced when using Supabase anon/authenticated roles):
-- organizations: SELECT/UPDATE only where id matches JWT organization claim (future direct client)
-- atlas_users: SELECT self row; administrators manage org users
-- prospects / atlas_core_prospects: org-scoped + ownership hierarchy (see docs/security/RBAC_MODEL.md)
-- atlas_audit_log: append-only for service role; read restricted to admin/operations/support
-- atlas_sessions / password_reset_tokens: no anon access

DROP POLICY IF EXISTS atlas_users_deny_anon ON atlas_users;
DROP POLICY IF EXISTS atlas_sessions_deny_anon ON atlas_sessions;
DROP POLICY IF EXISTS prospects_deny_anon ON prospects;
DROP POLICY IF EXISTS atlas_core_prospects_deny_anon ON atlas_core_prospects;
DROP POLICY IF EXISTS atlas_audit_log_deny_anon ON atlas_audit_log;
DROP POLICY IF EXISTS organizations_deny_anon ON organizations;
DROP POLICY IF EXISTS divisions_deny_anon ON divisions;
DROP POLICY IF EXISTS password_reset_deny_anon ON atlas_password_reset_tokens;

CREATE POLICY atlas_users_deny_anon ON atlas_users FOR ALL TO anon USING (false);
CREATE POLICY atlas_sessions_deny_anon ON atlas_sessions FOR ALL TO anon USING (false);
CREATE POLICY prospects_deny_anon ON prospects FOR ALL TO anon USING (false);
CREATE POLICY atlas_core_prospects_deny_anon ON atlas_core_prospects FOR ALL TO anon USING (false);
CREATE POLICY atlas_audit_log_deny_anon ON atlas_audit_log FOR ALL TO anon USING (false);
CREATE POLICY organizations_deny_anon ON organizations FOR ALL TO anon USING (false);
CREATE POLICY divisions_deny_anon ON divisions FOR ALL TO anon USING (false);
CREATE POLICY password_reset_deny_anon ON atlas_password_reset_tokens FOR ALL TO anon USING (false);
