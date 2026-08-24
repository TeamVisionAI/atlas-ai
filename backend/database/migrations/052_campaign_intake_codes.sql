-- BR-147 — Campaign Intake Codes (safe CTWA fallback without weakening BR-142)
-- Migration 049

CREATE TABLE IF NOT EXISTS campaign_intake_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_user_id UUID REFERENCES atlas_users(id) ON DELETE SET NULL,
  whatsapp_phone_number_id TEXT NOT NULL,
  code TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('RECRUITING', 'IUL', 'OTHER')),
  language TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'RETIRED')),
  meta_campaign_id TEXT,
  meta_adset_id TEXT,
  meta_ad_id TEXT,
  created_by_user_id UUID REFERENCES atlas_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  retired_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT campaign_intake_codes_code_unique UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_campaign_intake_codes_org_phone_status
  ON campaign_intake_codes (organization_id, whatsapp_phone_number_id, status);

CREATE INDEX IF NOT EXISTS idx_campaign_intake_codes_org_owner
  ON campaign_intake_codes (organization_id, owner_user_id);

CREATE TABLE IF NOT EXISTS campaign_intake_attributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  campaign_intake_code_id UUID NOT NULL REFERENCES campaign_intake_codes(id) ON DELETE RESTRICT,
  prospect_id UUID,
  prospect_phone TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  matched_code TEXT NOT NULL,
  campaign_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  owner_user_id UUID,
  eligibility_decision TEXT NOT NULL,
  matched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT campaign_intake_attributions_provider_unique
    UNIQUE (organization_id, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_campaign_intake_attributions_code
  ON campaign_intake_attributions (campaign_intake_code_id, matched_at DESC);

COMMENT ON TABLE campaign_intake_codes IS
  'BR-147 — Atlas-issued intake tokens for positive campaign attribution when Meta omits referral.';

COMMENT ON TABLE campaign_intake_attributions IS
  'BR-147 — Audit trail for matched campaign intake codes on inbound WhatsApp.';

-- Backend-only RLS (service role). Matches migration 046 / 029 posture.
ALTER TABLE public.campaign_intake_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_intake_codes_deny_anon ON public.campaign_intake_codes;
CREATE POLICY campaign_intake_codes_deny_anon
  ON public.campaign_intake_codes
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS campaign_intake_codes_deny_authenticated ON public.campaign_intake_codes;
CREATE POLICY campaign_intake_codes_deny_authenticated
  ON public.campaign_intake_codes
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.campaign_intake_codes FROM anon, authenticated;
GRANT ALL ON TABLE public.campaign_intake_codes TO service_role;

ALTER TABLE public.campaign_intake_attributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_intake_attributions_deny_anon ON public.campaign_intake_attributions;
CREATE POLICY campaign_intake_attributions_deny_anon
  ON public.campaign_intake_attributions
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS campaign_intake_attributions_deny_authenticated ON public.campaign_intake_attributions;
CREATE POLICY campaign_intake_attributions_deny_authenticated
  ON public.campaign_intake_attributions
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.campaign_intake_attributions FROM anon, authenticated;
GRANT ALL ON TABLE public.campaign_intake_attributions TO service_role;
