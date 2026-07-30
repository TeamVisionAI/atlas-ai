-- Sprint 12.1 Phase 1 — Rep ID identity foundation
-- Adds nullable rep_id to atlas_users and users with org-scoped uniqueness.
-- Existing users remain valid with rep_id NULL (email login unchanged).

ALTER TABLE atlas_users ADD COLUMN IF NOT EXISTS rep_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rep_id TEXT;

ALTER TABLE atlas_users DROP CONSTRAINT IF EXISTS atlas_users_rep_id_format_chk;
ALTER TABLE atlas_users ADD CONSTRAINT atlas_users_rep_id_format_chk
  CHECK (rep_id IS NULL OR rep_id ~ '^[A-Z0-9]{5}$');

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rep_id_format_chk;
ALTER TABLE users ADD CONSTRAINT users_rep_id_format_chk
  CHECK (rep_id IS NULL OR rep_id ~ '^[A-Z0-9]{5}$');

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_users_org_rep_id
  ON atlas_users (organization_id, rep_id)
  WHERE rep_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_org_rep_id
  ON users (organization_id, rep_id)
  WHERE rep_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_users_rep_id_lookup
  ON atlas_users (organization_id, rep_id)
  WHERE rep_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_rep_id_lookup
  ON users (organization_id, rep_id)
  WHERE rep_id IS NOT NULL;

-- Keep users ↔ atlas_users trigger in sync with rep_id (source: migration 011).
CREATE OR REPLACE FUNCTION sync_atlas_users_from_users()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM atlas_users WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO atlas_users (
    id, email, first_name, last_name, display_name,
    organization_id, role, status, password_hash, rep_id,
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
    NEW.rep_id,
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
    rep_id = EXCLUDED.rep_id,
    last_login_at = EXCLUDED.last_login_at,
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON COLUMN atlas_users.rep_id IS 'Sprint 12.1 — Organization-scoped recruiter identifier for login/display (nullable until backfill).';
COMMENT ON COLUMN users.rep_id IS 'Sprint 12.1 — Organization-scoped recruiter identifier synced from atlas_users.';
