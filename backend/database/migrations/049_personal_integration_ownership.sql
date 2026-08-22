-- BR-147 — Primerica personal workspace: user-owned integrations coexist with
-- legacy organization-owned rows (user_id IS NULL). Do not reassign existing rows.

-- ---------------------------------------------------------------------------
-- organization_integrations: nullable user_id ownership
-- ---------------------------------------------------------------------------

ALTER TABLE organization_integrations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES atlas_users(id) ON DELETE CASCADE;

COMMENT ON COLUMN organization_integrations.user_id IS
  'BR-147 owning atlas_users.id. NULL = legacy organization-owned integration.';

ALTER TABLE organization_integrations
  DROP CONSTRAINT IF EXISTS org_integrations_unique;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_integrations_org_provider_legacy
  ON organization_integrations (organization_id, provider)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_org_integrations_org_user_provider
  ON organization_integrations (organization_id, user_id, provider)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_org_integrations_user
  ON organization_integrations (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- whatsapp_integrations: nullable user_id ownership
-- ---------------------------------------------------------------------------

ALTER TABLE whatsapp_integrations
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES atlas_users(id) ON DELETE CASCADE;

COMMENT ON COLUMN whatsapp_integrations.user_id IS
  'BR-147 owning atlas_users.id. NULL = legacy organization-owned WhatsApp channel.';

-- Drop org-wide uniqueness so personal numbers can coexist with org channel.
ALTER TABLE whatsapp_integrations
  DROP CONSTRAINT IF EXISTS whatsapp_integrations_organization_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integrations_org_legacy
  ON whatsapp_integrations (organization_id)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integrations_org_user
  ON whatsapp_integrations (organization_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_integrations_user
  ON whatsapp_integrations (organization_id, user_id)
  WHERE user_id IS NOT NULL;

-- One connected Meta Phone Number ID globally (idempotent if already applied).
CREATE UNIQUE INDEX IF NOT EXISTS uq_whatsapp_integrations_connected_phone_number_id
  ON whatsapp_integrations (phone_number_id)
  WHERE status = 'connected' AND phone_number_id IS NOT NULL AND length(trim(phone_number_id)) > 0;
