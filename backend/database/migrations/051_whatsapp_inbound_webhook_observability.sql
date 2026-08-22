-- Durable sanitized Meta WhatsApp inbound webhook snapshots (diagnostics only).
-- Backend service-role access; not exposed to tenant users directly.

CREATE TABLE IF NOT EXISTS whatsapp_inbound_webhook_observability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  prospect_id UUID,
  conversation_log_id UUID,
  owner_user_id UUID,
  prospect_phone TEXT,
  provider_message_id TEXT NOT NULL,
  waba_id TEXT,
  phone_number_id TEXT,
  display_phone_number TEXT,
  message_type TEXT,
  message_from TEXT,
  message_timestamp TEXT,
  has_referral BOOLEAN NOT NULL DEFAULT false,
  has_ctwa_clid BOOLEAN NOT NULL DEFAULT false,
  referral_source_type TEXT,
  payload JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  linked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT whatsapp_inbound_webhook_obs_provider_message_id_chk CHECK (
    char_length(trim(provider_message_id)) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_inbound_webhook_obs_provider_message_id
  ON whatsapp_inbound_webhook_observability (provider_message_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_webhook_obs_org_received
  ON whatsapp_inbound_webhook_observability (organization_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_webhook_obs_phone_received
  ON whatsapp_inbound_webhook_observability (prospect_phone, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_webhook_obs_prospect_id
  ON whatsapp_inbound_webhook_observability (prospect_id)
  WHERE prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_inbound_webhook_obs_received_at
  ON whatsapp_inbound_webhook_observability (received_at);

COMMENT ON TABLE whatsapp_inbound_webhook_observability IS
  'Sanitized raw Meta WhatsApp inbound message webhook snapshots for CTWA diagnostics. Bounded retention; service-role only.';

ALTER TABLE public.whatsapp_inbound_webhook_observability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_inbound_webhook_obs_deny_anon
  ON public.whatsapp_inbound_webhook_observability;
CREATE POLICY whatsapp_inbound_webhook_obs_deny_anon
  ON public.whatsapp_inbound_webhook_observability
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS whatsapp_inbound_webhook_obs_deny_authenticated
  ON public.whatsapp_inbound_webhook_observability;
CREATE POLICY whatsapp_inbound_webhook_obs_deny_authenticated
  ON public.whatsapp_inbound_webhook_observability
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.whatsapp_inbound_webhook_observability FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_inbound_webhook_observability TO service_role;
