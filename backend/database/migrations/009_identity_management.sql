-- LC1.1 — Identity Management (profiles, invitations, session metadata)

ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS reports_to_user_id UUID REFERENCES atlas_users(id);
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE atlas_sessions ADD COLUMN IF NOT EXISTS device_label TEXT;

CREATE TABLE IF NOT EXISTS atlas_invitation_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  invited_by UUID REFERENCES atlas_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invitation_tokens_user ON atlas_invitation_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_invitation_tokens_hash ON atlas_invitation_tokens(token_hash);

CREATE TABLE IF NOT EXISTS atlas_login_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES atlas_users(id) ON DELETE SET NULL,
  user_email TEXT,
  event_type TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'success',
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_created ON atlas_login_history(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_email_created ON atlas_login_history(user_email, created_at DESC);

ALTER TABLE atlas_invitation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_login_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invitation_tokens_deny_anon ON atlas_invitation_tokens;
DROP POLICY IF EXISTS login_history_deny_anon ON atlas_login_history;

CREATE POLICY invitation_tokens_deny_anon ON atlas_invitation_tokens FOR ALL TO anon USING (false);
CREATE POLICY login_history_deny_anon ON atlas_login_history FOR ALL TO anon USING (false);

UPDATE atlas_users SET status = 'pending_invitation' WHERE status = 'invited';

COMMENT ON TABLE atlas_invitation_tokens IS 'LC1.1 — One-time user invitation tokens';
COMMENT ON TABLE atlas_login_history IS 'LC1.1 — Login and identity lifecycle events';
