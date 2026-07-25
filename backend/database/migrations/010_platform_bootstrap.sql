-- LC1.1 Part 0 — Platform bootstrap (first-time setup)

CREATE TABLE IF NOT EXISTS atlas_platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES atlas_users(id);

-- Remove unactivated placeholder users from migration 002 (production bootstrap path).
DELETE FROM atlas_users
WHERE password_hash IS NULL;

ALTER TABLE atlas_platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_settings_deny_anon ON atlas_platform_settings;
CREATE POLICY platform_settings_deny_anon ON atlas_platform_settings FOR ALL TO anon USING (false);

COMMENT ON TABLE atlas_platform_settings IS 'LC1.1 — Platform-wide settings including setup completion marker';
