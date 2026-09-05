-- Rollback BR-234. Fails if contact-only rows exist (prospect_id IS NULL).

BEGIN;

DELETE FROM public.unsupported_whatsapp_inbound_reviews
 WHERE prospect_id IS NULL;

ALTER TABLE public.unsupported_whatsapp_inbound_reviews
  ALTER COLUMN prospect_id SET NOT NULL;

COMMIT;
