-- Staging-only PostgREST privilege repair.
-- Fresh Supabase projects do not automatically GRANT table DML to service_role
-- when tables are created as postgres via DATABASE_URL. Production already has
-- these grants from historical dashboard/SQL apply. Atlas backend uses the
-- service role through PostgREST; without GRANT it cannot boot.
--
-- Does not weaken RLS. Does not GRANT DML to anon/authenticated.
-- Do not apply in production as a standalone change; harmless if replayed.

GRANT USAGE ON SCHEMA public TO service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
