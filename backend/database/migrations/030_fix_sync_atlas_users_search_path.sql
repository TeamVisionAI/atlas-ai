-- Migration 030 — Security Advisor: Function Search Path Mutable
-- Function: public.sync_atlas_users_from_users
--
-- Minimum safe hardening (SECURITY INVOKER preserved):
-- 1) Pin search_path to pg_catalog, public
-- 2) Fully qualify public.atlas_users and selected builtins
-- 3) Revoke EXECUTE from PUBLIC / anon / authenticated
-- 4) Preserve GRANT EXECUTE to service_role for trigger invocations
--
-- Trigger trg_sync_atlas_users_from_users on public.users is NOT dropped/recreated.
-- Field sync contract matches migration 017 (includes rep_id).
-- Does not touch Meta Review identity columns (profile_settings).
-- Does not modify migration 029 / RLS policies / table data.

BEGIN;

CREATE OR REPLACE FUNCTION public.sync_atlas_users_from_users()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path TO pg_catalog, public
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.atlas_users WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  INSERT INTO public.atlas_users (
    id, email, first_name, last_name, display_name,
    organization_id, role, status, password_hash, rep_id,
    last_login_at, created_at, updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    pg_catalog.split_part(NEW.name, ' ', 1),
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
      ELSE pg_catalog.lower(pg_catalog.replace(NEW.role, '_', ' '))
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
    -- COALESCE is a SQL special form (not pg_catalog.coalesce(...)); safe with pinned search_path.
    password_hash = COALESCE(EXCLUDED.password_hash, public.atlas_users.password_hash),
    rep_id = EXCLUDED.rep_id,
    last_login_at = EXCLUDED.last_login_at,
    updated_at = pg_catalog.now();

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.sync_atlas_users_from_users() IS
  'Keeps public.atlas_users synchronized from public.users (ADR-0001). SECURITY INVOKER; search_path pinned to pg_catalog, public. Intended for trigger use only — not callable by anon/authenticated.';

REVOKE ALL ON FUNCTION public.sync_atlas_users_from_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_atlas_users_from_users() FROM anon;
REVOKE ALL ON FUNCTION public.sync_atlas_users_from_users() FROM authenticated;

GRANT EXECUTE ON FUNCTION public.sync_atlas_users_from_users() TO service_role;

COMMIT;
