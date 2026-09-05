-- Rollback for 074_br237_conversation_turn_locks.sql

BEGIN;

DROP FUNCTION IF EXISTS public.release_atlas_conversation_turn_lock(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.acquire_atlas_conversation_turn_lock(uuid, uuid, text, integer, text);
DROP TABLE IF EXISTS public.atlas_conversation_turn_locks;

COMMIT;
