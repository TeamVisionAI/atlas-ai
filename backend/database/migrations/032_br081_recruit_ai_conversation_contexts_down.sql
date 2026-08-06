-- Rollback for 032_br081_recruit_ai_conversation_contexts.sql
-- Drops Phase 2 tables. Do not run in production without explicit authorization.

BEGIN;

DROP TABLE IF EXISTS public.recruit_ai_v2_shadow_evaluations;
DROP TABLE IF EXISTS public.recruit_ai_conversation_contexts;

COMMIT;
