-- Sprint 20.1 — Persistent WhatsApp Embedded Signup integration per organization.

CREATE TABLE IF NOT EXISTS whatsapp_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  business_id TEXT,
  waba_id TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  business_name TEXT,
  connection_type TEXT NOT NULL DEFAULT 'whatsapp_business_app',
  status TEXT NOT NULL DEFAULT 'pending',
  access_token_encrypted TEXT,
  last_health_status TEXT,
  last_health_checked_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_integrations_status_check
    CHECK (status IN ('connected', 'pending', 'disconnected', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_integrations_org
  ON whatsapp_integrations (organization_id);

CREATE INDEX IF NOT EXISTS idx_whatsapp_integrations_status
  ON whatsapp_integrations (status);
