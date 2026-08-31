-- Down: BR-193 Meta Ad Destination automation flag.

BEGIN;

ALTER TABLE whatsapp_integrations
  DROP COLUMN IF EXISTS meta_ad_destination_automation_enabled;

COMMIT;
