-- BR: WhatsApp Meta delivery lifecycle observability (sent / delivered / read / failed).
-- Separate from BR-075 gate status column (`status`).

ALTER TABLE public.whatsapp_outbound_deliveries
  ADD COLUMN IF NOT EXISTS meta_delivery_status TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_code TEXT,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_deliveries_provider_message_id
  ON public.whatsapp_outbound_deliveries (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON COLUMN public.whatsapp_outbound_deliveries.meta_delivery_status IS
  'Meta WhatsApp Cloud API lifecycle: sent | delivered | read | failed. Distinct from BR-075 gate status.';
