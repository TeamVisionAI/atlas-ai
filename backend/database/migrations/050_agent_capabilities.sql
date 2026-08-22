-- BR-148 — Primerica agent lead/source capabilities (tenant + user scoped).
-- Additive JSONB; empty/missing reads as safe defaults in application code.

ALTER TABLE atlas_users
  ADD COLUMN IF NOT EXISTS agent_capabilities JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN atlas_users.agent_capabilities IS
  'BR-148 Primerica agent capabilities (not derived from business_rank): canReceiveOrganizationLeads, roundRobinEligible, personalWhatsAppEnabled, personalLeadSourcesEnabled, personalMetaAdsEnabled';

CREATE INDEX IF NOT EXISTS idx_atlas_users_org_agent_capabilities
  ON atlas_users (organization_id)
  WHERE agent_capabilities <> '{}'::jsonb;
