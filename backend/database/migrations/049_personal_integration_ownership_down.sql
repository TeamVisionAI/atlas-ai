-- BR-147 down — only safe when no personal (user_id NOT NULL) rows exist.

DROP INDEX IF EXISTS uq_whatsapp_integrations_connected_phone_number_id;
DROP INDEX IF EXISTS idx_whatsapp_integrations_user;
DROP INDEX IF EXISTS uq_whatsapp_integrations_org_user;
DROP INDEX IF EXISTS uq_whatsapp_integrations_org_legacy;

ALTER TABLE whatsapp_integrations DROP COLUMN IF EXISTS user_id;

ALTER TABLE whatsapp_integrations
  ADD CONSTRAINT whatsapp_integrations_organization_id_key UNIQUE (organization_id);

DROP INDEX IF EXISTS idx_org_integrations_user;
DROP INDEX IF EXISTS uq_org_integrations_org_user_provider;
DROP INDEX IF EXISTS uq_org_integrations_org_provider_legacy;

ALTER TABLE organization_integrations DROP COLUMN IF EXISTS user_id;

ALTER TABLE organization_integrations
  ADD CONSTRAINT org_integrations_unique UNIQUE (organization_id, provider);
