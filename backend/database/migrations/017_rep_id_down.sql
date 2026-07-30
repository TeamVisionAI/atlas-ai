-- Sprint 12.1 Phase 1 — Rep ID rollback

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

DROP INDEX IF EXISTS idx_users_rep_id_lookup;
DROP INDEX IF EXISTS idx_atlas_users_rep_id_lookup;
DROP INDEX IF EXISTS idx_users_org_rep_id;
DROP INDEX IF EXISTS idx_atlas_users_org_rep_id;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_rep_id_format_chk;
ALTER TABLE atlas_users DROP CONSTRAINT IF EXISTS atlas_users_rep_id_format_chk;

ALTER TABLE users DROP COLUMN IF EXISTS rep_id;
ALTER TABLE atlas_users DROP COLUMN IF EXISTS rep_id;
