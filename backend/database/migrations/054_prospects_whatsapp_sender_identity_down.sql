DROP INDEX IF EXISTS idx_prospects_org_whatsapp_sender_id;

ALTER TABLE prospects DROP COLUMN IF EXISTS whatsapp_username;
ALTER TABLE prospects DROP COLUMN IF EXISTS whatsapp_sender_id;
