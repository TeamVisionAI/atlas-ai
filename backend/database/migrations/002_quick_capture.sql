-- Sprint 10.1 — Quick Capture prospect fields and Atlas user ownership

CREATE TABLE IF NOT EXISTS atlas_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE,
  first_name TEXT,
  last_name TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS atlas_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_atlas_sessions_token ON atlas_sessions(token);
CREATE INDEX IF NOT EXISTS idx_atlas_sessions_user_id ON atlas_sessions(user_id);

INSERT INTO atlas_users (id, email, first_name, last_name, display_name)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    'ana@teamvision.ai',
    'Ana',
    'Recruiter',
    'Ana'
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    'niovel@teamvision.ai',
    'Niovel',
    'Perez',
    'Niovel'
  )
ON CONFLICT (id) DO NOTHING;

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS last_name TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS normalized_phone TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS communication_language TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS entry_method TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES atlas_users(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES atlas_users(id);
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS prospect_number TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS preferred_communication_channel TEXT DEFAULT 'WHATSAPP';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_normalized_phone
  ON prospects(normalized_phone)
  WHERE normalized_phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_prospect_number
  ON prospects(prospect_number)
  WHERE prospect_number IS NOT NULL;

COMMENT ON COLUMN prospects.normalized_phone IS 'E.164 digits-only phone for deduplication';
COMMENT ON COLUMN prospects.communication_language IS 'Prospect communication language: es | en';
COMMENT ON COLUMN prospects.entry_method IS 'Capture channel e.g. QUICK_CAPTURE';
COMMENT ON COLUMN prospects.source IS 'Manual lead source e.g. IN_PERSON, REFERRAL';
COMMENT ON COLUMN prospects.preferred_communication_channel IS 'Preferred outreach channel e.g. WHATSAPP';
