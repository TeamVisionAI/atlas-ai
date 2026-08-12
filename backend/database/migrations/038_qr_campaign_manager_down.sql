-- Rollback migration 038 — QR Campaign Manager Phase A columns.

BEGIN;

DROP INDEX IF EXISTS public.idx_qr_campaigns_org_owner_created;

ALTER TABLE public.qr_campaigns
  DROP COLUMN IF EXISTS archived_at,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS created_by_user_id,
  DROP COLUMN IF EXISTS token_version,
  DROP COLUMN IF EXISTS encrypted_public_token;

COMMIT;
