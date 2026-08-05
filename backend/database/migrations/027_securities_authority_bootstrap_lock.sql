-- RC4 Milestone 1 correction — Initial securities authority bootstrap lock
-- Migration 027
-- Implements BR-074 controlled one-time org bootstrap (not a normal user action).
-- Does not seed users, grants, or authorizations.

CREATE TABLE IF NOT EXISTS atlas_organization_securities_authority_bootstrap (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL REFERENCES atlas_users(id),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  technical_actor TEXT NOT NULL,
  verification_source TEXT NOT NULL,
  evidence_source TEXT NOT NULL,
  evidence_reference TEXT,
  evidence_verified_at TIMESTAMPTZ NOT NULL,
  authorization_id UUID,
  reason_sanitized TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT atlas_org_securities_bootstrap_source_chk
    CHECK (verification_source = 'INITIAL_FIRM_AUTHORITY_BOOTSTRAP')
);

COMMENT ON TABLE atlas_organization_securities_authority_bootstrap IS
  'BR-074 — One-time per-organization lock for initial securities authority bootstrap. Presence of a row means bootstrap is complete and must not re-run.';

COMMENT ON COLUMN atlas_organization_securities_authority_bootstrap.evidence_reference IS
  'Short sanitized firm-internal evidence label only. Do not store registration document contents or unnecessary identifiers.';

CREATE INDEX IF NOT EXISTS idx_atlas_org_securities_bootstrap_target
  ON atlas_organization_securities_authority_bootstrap(target_user_id);
