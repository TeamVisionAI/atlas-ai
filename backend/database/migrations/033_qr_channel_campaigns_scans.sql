-- QR Channel Phase 1 — campaigns + scans (Car Magnet V1 infrastructure).
-- Implements BR-128 / BR-129 entry primitives (no inbound attribution consume yet).
-- Additive only. Safe to apply before application deploy.
--
-- Rollback: backend/database/migrations/033_qr_channel_campaigns_scans_down.sql

BEGIN;

CREATE TABLE IF NOT EXISTS public.qr_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  owner_user_id uuid NOT NULL,
  name text NOT NULL,
  campaign_key text NOT NULL,
  source text NOT NULL,
  campaign_type text NOT NULL DEFAULT 'car_magnet',
  default_conversation_goal text NOT NULL DEFAULT 'interview',
  public_token_hash text NOT NULL,
  public_token_prefix text,
  status text NOT NULL DEFAULT 'active',
  destination_channel text NOT NULL DEFAULT 'whatsapp',
  whatsapp_e164 text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_campaigns_status_chk
    CHECK (status IN ('active', 'inactive')),
  CONSTRAINT qr_campaigns_goal_chk
    CHECK (default_conversation_goal IN ('interview', 'policy_review', 'unresolved')),
  CONSTRAINT qr_campaigns_channel_chk
    CHECK (destination_channel IN ('whatsapp')),
  CONSTRAINT qr_campaigns_key_len_chk
    CHECK (char_length(campaign_key) >= 3 AND char_length(campaign_key) <= 64),
  CONSTRAINT qr_campaigns_token_hash_len_chk
    CHECK (char_length(public_token_hash) = 64)
);

COMMENT ON TABLE public.qr_campaigns IS
  'BR-128 QR Channel campaigns — opaque public token stored as SHA-256 hex hash only';
COMMENT ON COLUMN public.qr_campaigns.public_token_hash IS
  'SHA-256 hex of opaque public token; plaintext never stored';
COMMENT ON COLUMN public.qr_campaigns.whatsapp_e164 IS
  'Optional digits-only E.164 without plus; falls back to env allowlisted Team Vision number';

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_campaigns_org_key
  ON public.qr_campaigns (org_id, campaign_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_qr_campaigns_token_hash
  ON public.qr_campaigns (public_token_hash);

CREATE INDEX IF NOT EXISTS idx_qr_campaigns_org_status
  ON public.qr_campaigns (org_id, status);

CREATE TABLE IF NOT EXISTS public.qr_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.qr_campaigns(id),
  org_id uuid NOT NULL,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  handoff_mode text NOT NULL DEFAULT 'phone_bind',
  status text NOT NULL DEFAULT 'pending_phone',
  bound_phone_normalized text,
  handoff_code_hash text,
  expires_at timestamptz NOT NULL,
  bound_at timestamptz,
  consumed_at timestamptz,
  redirect_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT qr_scans_handoff_mode_chk
    CHECK (handoff_mode IN ('phone_bind', 'micro_code')),
  CONSTRAINT qr_scans_status_chk
    CHECK (status IN (
      'pending_phone',
      'pending_inbound',
      'consumed',
      'expired',
      'superseded',
      'ambiguous_conflict',
      'throttled'
    ))
);

COMMENT ON TABLE public.qr_scans IS
  'BR-129 QR Channel scans / phone-bind handoffs — Phase 1 create+bind; Phase 2 inbound consume';

CREATE INDEX IF NOT EXISTS idx_qr_scans_org_phone_open
  ON public.qr_scans (org_id, bound_phone_normalized, status)
  WHERE bound_phone_normalized IS NOT NULL
    AND status IN ('pending_phone', 'pending_inbound');

CREATE INDEX IF NOT EXISTS idx_qr_scans_campaign_created
  ON public.qr_scans (campaign_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_qr_scans_org_correlation
  ON public.qr_scans (org_id, correlation_id);

CREATE INDEX IF NOT EXISTS idx_qr_scans_expires
  ON public.qr_scans (expires_at)
  WHERE status IN ('pending_phone', 'pending_inbound');

-- Backend-only RLS (same posture as migration 029 / 032).
ALTER TABLE public.qr_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qr_campaigns_deny_anon ON public.qr_campaigns;
CREATE POLICY qr_campaigns_deny_anon
  ON public.qr_campaigns
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS qr_campaigns_deny_authenticated ON public.qr_campaigns;
CREATE POLICY qr_campaigns_deny_authenticated
  ON public.qr_campaigns
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS qr_scans_deny_anon ON public.qr_scans;
CREATE POLICY qr_scans_deny_anon
  ON public.qr_scans
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS qr_scans_deny_authenticated ON public.qr_scans;
CREATE POLICY qr_scans_deny_authenticated
  ON public.qr_scans
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
