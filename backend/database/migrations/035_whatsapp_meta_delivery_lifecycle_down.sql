-- Down: WhatsApp Meta delivery lifecycle columns (035).

DROP INDEX IF EXISTS public.idx_whatsapp_outbound_deliveries_provider_message_id;

ALTER TABLE public.whatsapp_outbound_deliveries
  DROP COLUMN IF EXISTS meta_delivery_status,
  DROP COLUMN IF EXISTS sent_at,
  DROP COLUMN IF EXISTS delivered_at,
  DROP COLUMN IF EXISTS read_at,
  DROP COLUMN IF EXISTS failed_at,
  DROP COLUMN IF EXISTS failure_code,
  DROP COLUMN IF EXISTS failure_reason;
