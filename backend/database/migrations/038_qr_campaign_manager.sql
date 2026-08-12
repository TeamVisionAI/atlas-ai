-- QR Campaign Manager Phase A — additive campaign manager columns (BR-128).
-- Does not rotate or rewrite existing public_token_hash values (car_recruiting_01 unchanged).
--
-- Rollback: backend/database/migrations/038_qr_campaign_manager_down.sql

BEGIN;

ALTER TABLE public.qr_campaigns
  ADD COLUMN IF NOT EXISTS encrypted_public_token text,
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

COMMENT ON COLUMN public.qr_campaigns.encrypted_public_token IS
  'AES-256-GCM ciphertext (base64url) of opaque public token for authorized re-download; NULL for legacy seed campaigns';
COMMENT ON COLUMN public.qr_campaigns.token_version IS
  'Increments on future token rotation; Phase A always 1 for new campaigns';
COMMENT ON COLUMN public.qr_campaigns.created_by_user_id IS
  'Authenticated creator; may differ from owner_user_id when Management/Admin creates for a teammate';
COMMENT ON COLUMN public.qr_campaigns.description IS
  'Optional human description; not used for attribution';
COMMENT ON COLUMN public.qr_campaigns.archived_at IS
  'Soft-archive timestamp (Phase A schema only; no archive UI)';

CREATE INDEX IF NOT EXISTS idx_qr_campaigns_org_owner_created
  ON public.qr_campaigns (org_id, owner_user_id, created_at DESC);

COMMIT;
