-- BR-193 — Explicit Meta Ad Destination automation on a WhatsApp connection.
-- Default OFF. Existing personal/org connections stay fail-closed until an
-- operator enables the setting. Do not infer eligibility from greetings.

BEGIN;

ALTER TABLE whatsapp_integrations
  ADD COLUMN IF NOT EXISTS meta_ad_destination_automation_enabled BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN whatsapp_integrations.meta_ad_destination_automation_enabled IS
  'BR-193. When true, unknown inbound on this CONNECTED phone_number_id may be promoted if Meta omitted CTWA metadata. Default false.';

UPDATE whatsapp_integrations
SET meta_ad_destination_automation_enabled = false
WHERE meta_ad_destination_automation_enabled IS DISTINCT FROM false;

COMMIT;
