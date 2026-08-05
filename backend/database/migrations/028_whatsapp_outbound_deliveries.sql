-- BR-075 — Durable WhatsApp outbound delivery attempts (customer-care window / template gate).

CREATE TABLE IF NOT EXISTS whatsapp_outbound_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  prospect_phone TEXT NOT NULL,
  intent TEXT NOT NULL,
  idempotency_key TEXT,
  status TEXT NOT NULL,
  delivery_mode TEXT,
  template_key TEXT,
  meta_template_name TEXT,
  language TEXT,
  retryable BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  provider_message_id TEXT,
  conversation_log_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_deliveries_org_phone_created
  ON whatsapp_outbound_deliveries (organization_id, prospect_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_deliveries_status_created
  ON whatsapp_outbound_deliveries (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_outbound_deliveries_idempotent_success
  ON whatsapp_outbound_deliveries (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND status IN ('sent_freeform', 'sent_template');
