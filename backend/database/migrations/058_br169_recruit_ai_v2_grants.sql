-- BR-169 — Recruit AI v2 tenant/user certification and enablement grants.
-- Durable onboarding so Railway org/user allowlists are not required for
-- normal activation. Global env kill switches remain fail-closed.
-- Backend-only RLS (deny anon/authenticated). Service-role writes only.

BEGIN;

CREATE TABLE IF NOT EXISTS recruit_ai_v2_tenant_grants (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  certified BOOLEAN NOT NULL DEFAULT false,
  certified_at TIMESTAMPTZ,
  certified_by_user_id UUID,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_at TIMESTAMPTZ,
  enabled_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recruit_ai_v2_tenant_grants_enabled_requires_certified
    CHECK (enabled = false OR certified = true)
);

COMMENT ON TABLE recruit_ai_v2_tenant_grants IS
  'BR-169 Super Admin tenant certification + enablement for Recruit AI v2. Default off.';

CREATE TABLE IF NOT EXISTS recruit_ai_v2_user_grants (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  authoring_enabled BOOLEAN NOT NULL DEFAULT false,
  execution_enabled BOOLEAN NOT NULL DEFAULT false,
  updated_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, user_id)
);

COMMENT ON TABLE recruit_ai_v2_user_grants IS
  'BR-169 per-user V2 authoring/execution grants. Execution is never implied by authoring or role.';

CREATE INDEX IF NOT EXISTS idx_recruit_ai_v2_user_grants_org
  ON recruit_ai_v2_user_grants (organization_id);

ALTER TABLE recruit_ai_v2_tenant_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE recruit_ai_v2_user_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recruit_ai_v2_tenant_grants_deny_anon
  ON recruit_ai_v2_tenant_grants;
CREATE POLICY recruit_ai_v2_tenant_grants_deny_anon
  ON recruit_ai_v2_tenant_grants
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recruit_ai_v2_tenant_grants_deny_authenticated
  ON recruit_ai_v2_tenant_grants;
CREATE POLICY recruit_ai_v2_tenant_grants_deny_authenticated
  ON recruit_ai_v2_tenant_grants
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recruit_ai_v2_user_grants_deny_anon
  ON recruit_ai_v2_user_grants;
CREATE POLICY recruit_ai_v2_user_grants_deny_anon
  ON recruit_ai_v2_user_grants
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS recruit_ai_v2_user_grants_deny_authenticated
  ON recruit_ai_v2_user_grants;
CREATE POLICY recruit_ai_v2_user_grants_deny_authenticated
  ON recruit_ai_v2_user_grants
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE recruit_ai_v2_tenant_grants FROM anon, authenticated;
REVOKE ALL ON TABLE recruit_ai_v2_user_grants FROM anon, authenticated;
GRANT ALL ON TABLE recruit_ai_v2_tenant_grants TO service_role;
GRANT ALL ON TABLE recruit_ai_v2_user_grants TO service_role;

COMMIT;
