-- Rollback migration 039 — communication_media + private bucket.

BEGIN;

DROP POLICY IF EXISTS communication_media_deny_authenticated ON public.communication_media;
DROP POLICY IF EXISTS communication_media_deny_anon ON public.communication_media;
DROP TABLE IF EXISTS public.communication_media;

-- Bucket objects are not deleted here. Dropping the bucket requires owner privileges
-- and would destroy stored voice notes; leave communication-media bucket in place.

COMMIT;
