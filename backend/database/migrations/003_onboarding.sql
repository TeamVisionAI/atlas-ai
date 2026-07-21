-- Journey #1 — Organization onboarding foundation

ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'email';

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE RESTRICT,
  activated_at TIMESTAMPTZ,
  onboarding_step TEXT NOT NULL DEFAULT 'meta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS organization_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  meeting_locations JSONB NOT NULL DEFAULT '{}'::jsonb,
  office_address TEXT,
  starbucks_preference TEXT,
  custom_location_name TEXT,
  custom_location_address TEXT,
  zoom_interview_url TEXT,
  meta_connected BOOLEAN NOT NULL DEFAULT false,
  meta_connected_at TIMESTAMPTZ,
  calendar_connected BOOLEAN NOT NULL DEFAULT false,
  calendar_connected_at TIMESTAMPTZ,
  calendar_refresh_token_encrypted TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organizations_owner_user_id ON organizations(owner_user_id);
