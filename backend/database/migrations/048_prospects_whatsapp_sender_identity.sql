-- WhatsApp username / BSUID sender identity (Meta username rollout compatibility)

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS whatsapp_sender_id TEXT;
ALTER TABLE prospects ADD COLUMN IF NOT EXISTS whatsapp_username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_org_whatsapp_sender_id
  ON prospects (organization_id, whatsapp_sender_id)
  WHERE whatsapp_sender_id IS NOT NULL
    AND btrim(whatsapp_sender_id) <> '';

COMMENT ON COLUMN prospects.whatsapp_sender_id IS
  'Meta Business-Scoped User ID (BSUID) for WhatsApp when phone is hidden';
COMMENT ON COLUMN prospects.whatsapp_username IS
  'Optional WhatsApp @username handle for display when phone is hidden';
