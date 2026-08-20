-- Platform Support Mode — explicit super-admin tenant context per authenticated session.

CREATE TABLE IF NOT EXISTS atlas_support_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  auth_session_id TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  exited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active Support Mode context per authenticated session (not per admin globally).
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_support_sessions_active_auth_session
  ON atlas_support_sessions(admin_user_id, auth_session_id)
  WHERE exited_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_support_sessions_org_entered
  ON atlas_support_sessions(organization_id, entered_at DESC);

ALTER TABLE atlas_support_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_support_sessions_deny_anon ON atlas_support_sessions;
CREATE POLICY atlas_support_sessions_deny_anon ON atlas_support_sessions FOR ALL TO anon USING (false);

COMMENT ON TABLE atlas_support_sessions IS 'Super Admin Support Mode — explicit tenant selection scoped to authenticated session (not impersonation)';
COMMENT ON COLUMN atlas_support_sessions.auth_session_id IS 'jwt:{jti} or opaque:{atlas_sessions.token}';
