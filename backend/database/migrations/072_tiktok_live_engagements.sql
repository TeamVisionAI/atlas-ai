-- BR-230 — TikTok LIVE engagement attribution (TikFinity webhook, Phase 1).
-- Engagement only. No prospect_id. Service-role writes; deny anon/authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tiktok_live_engagements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  platform TEXT NOT NULL DEFAULT 'tiktok',
  source TEXT NOT NULL DEFAULT 'TIKTOK_LIVE',
  event_type TEXT NOT NULL,
  username TEXT NOT NULL,
  command TEXT NOT NULL,
  command_text TEXT,
  gift_name TEXT,
  campaign TEXT,
  funnel TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tiktok_live_engagements IS
  'BR-230 — TikTok LIVE command/gift attribution from TikFinity. No prospect creation.';

CREATE INDEX IF NOT EXISTS idx_tiktok_live_engagements_organization_id
  ON public.tiktok_live_engagements (organization_id);

CREATE INDEX IF NOT EXISTS idx_tiktok_live_engagements_received_at
  ON public.tiktok_live_engagements (received_at DESC);

CREATE INDEX IF NOT EXISTS idx_tiktok_live_engagements_command
  ON public.tiktok_live_engagements (command);

CREATE INDEX IF NOT EXISTS idx_tiktok_live_engagements_username
  ON public.tiktok_live_engagements (username);

ALTER TABLE public.tiktok_live_engagements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tiktok_live_engagements_deny_anon ON public.tiktok_live_engagements;
CREATE POLICY tiktok_live_engagements_deny_anon
  ON public.tiktok_live_engagements
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS tiktok_live_engagements_deny_authenticated ON public.tiktok_live_engagements;
CREATE POLICY tiktok_live_engagements_deny_authenticated
  ON public.tiktok_live_engagements
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.tiktok_live_engagements FROM anon, authenticated;
GRANT ALL ON TABLE public.tiktok_live_engagements TO service_role;

COMMIT;
