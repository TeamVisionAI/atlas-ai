-- BR-156 — Unsupported Meta WhatsApp inbound review queue (error 131060).
-- Operational recovery only; does not weaken BR-142 automation eligibility.

CREATE TABLE IF NOT EXISTS unsupported_whatsapp_inbound_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_type TEXT NOT NULL DEFAULT 'UNSUPPORTED_WHATSAPP_INBOUND_REVIEW'
    CHECK (review_type = 'UNSUPPORTED_WHATSAPP_INBOUND_REVIEW'),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prospect_id UUID NOT NULL,
  owner_user_id UUID,
  assigned_owner_user_id UUID,
  sender_phone_e164 TEXT NOT NULL,
  whatsapp_sender_id TEXT,
  prospect_name TEXT,
  provider_message_id TEXT NOT NULL,
  destination_phone_number_id TEXT NOT NULL,
  destination_display_phone_number TEXT,
  meta_error_code INTEGER NOT NULL,
  meta_error_title TEXT,
  status TEXT NOT NULL DEFAULT 'pending_review'
    CHECK (status IN (
      'pending_review',
      'recovered_automatically',
      'confirmed_manual',
      'dismissed_reviewed'
    )),
  observability_id UUID,
  conversation_log_id UUID,
  correlation_id TEXT,
  received_at TIMESTAMPTZ NOT NULL,
  reviewed_at TIMESTAMPTZ,
  reviewed_by_user_id UUID,
  recovery_campaign_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unsupported_whatsapp_inbound_reviews_provider_unique
    UNIQUE (provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_unsupported_whatsapp_inbound_reviews_org_status
  ON unsupported_whatsapp_inbound_reviews (organization_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_unsupported_whatsapp_inbound_reviews_prospect
  ON unsupported_whatsapp_inbound_reviews (prospect_id, status, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_unsupported_whatsapp_inbound_reviews_owner_pending
  ON unsupported_whatsapp_inbound_reviews (assigned_owner_user_id, status, received_at DESC)
  WHERE status = 'pending_review';

COMMENT ON TABLE unsupported_whatsapp_inbound_reviews IS
  'BR-156 — Meta unsupported inbound (131060) operational review queue; no BR-142 bypass.';

ALTER TABLE public.unsupported_whatsapp_inbound_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unsupported_whatsapp_inbound_reviews_deny_anon
  ON public.unsupported_whatsapp_inbound_reviews;
CREATE POLICY unsupported_whatsapp_inbound_reviews_deny_anon
  ON public.unsupported_whatsapp_inbound_reviews
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS unsupported_whatsapp_inbound_reviews_deny_authenticated
  ON public.unsupported_whatsapp_inbound_reviews;
CREATE POLICY unsupported_whatsapp_inbound_reviews_deny_authenticated
  ON public.unsupported_whatsapp_inbound_reviews
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.unsupported_whatsapp_inbound_reviews FROM anon, authenticated;
GRANT ALL ON TABLE public.unsupported_whatsapp_inbound_reviews TO service_role;
