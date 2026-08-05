-- RC4 Milestone 1 — Firm-Verified Securities Access Foundation
-- Migration 026
-- Implements BR-074
-- Does not seed verifiers. Does not grant securities:verify to any role.

-- ---------------------------------------------------------------------------
-- Permission catalog entry (no role_permissions, no user_permissions seeds)
-- ---------------------------------------------------------------------------

INSERT INTO permissions (code, name, category, description) VALUES
  (
    'securities:verify',
    'Verify Securities Access',
    'Compliance',
    'Explicit user-level authority to create/update/verify/revoke firm-verified securities authorization for other users in the same organization. Not granted by role wildcards.'
  )
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Current authorization (one row per org user)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_user_securities_authorization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  securities_access_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  registration_type TEXT,
  permitted_product_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  verification_source TEXT,
  verified_by UUID REFERENCES atlas_users(id),
  verified_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  jurisdiction_scope JSONB,
  principal_scope JSONB NOT NULL DEFAULT '[]'::jsonb,
  supervisory_restrictions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status_reason TEXT,
  last_reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,

  CONSTRAINT atlas_user_securities_authorization_org_user_unique
    UNIQUE (organization_id, user_id),

  CONSTRAINT atlas_user_securities_authorization_status_chk
    CHECK (
      securities_access_status IN (
        'UNKNOWN',
        'NOT_REGISTERED',
        'PENDING_VERIFICATION',
        'VERIFIED_ACTIVE',
        'RESTRICTED',
        'SUSPENDED',
        'EXPIRED',
        'TERMINATED'
      )
    ),

  CONSTRAINT atlas_user_securities_authorization_dates_chk
    CHECK (
      effective_to IS NULL
      OR effective_from IS NULL
      OR effective_to >= effective_from
    )
);

COMMENT ON TABLE atlas_user_securities_authorization IS
  'BR-074 — Current firm-verified securities authorization per organization user. Missing row = UNKNOWN (fail closed).';

COMMENT ON COLUMN atlas_user_securities_authorization.verification_source IS
  'v1 canonical source: MANUAL_FIRM_VERIFICATION. Atlas does not independently certify FINRA/CRD registration.';

COMMENT ON COLUMN atlas_user_securities_authorization.jurisdiction_scope IS
  'Nullable. Informational in v1 unless a resource declares explicit jurisdiction restrictions. Null must not mean unrestricted.';

CREATE INDEX IF NOT EXISTS idx_atlas_user_securities_auth_org
  ON atlas_user_securities_authorization(organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_user_securities_auth_user
  ON atlas_user_securities_authorization(organization_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_user_securities_auth_status
  ON atlas_user_securities_authorization(organization_id, securities_access_status)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Append-only history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_user_securities_authorization_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  authorization_id UUID,
  change_action TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  verification_source TEXT,
  verified_by UUID,
  verified_at TIMESTAMPTZ,
  effective_from TIMESTAMPTZ,
  effective_to TIMESTAMPTZ,
  permitted_product_scope JSONB,
  principal_scope JSONB,
  jurisdiction_scope JSONB,
  changed_by UUID REFERENCES atlas_users(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason_sanitized TEXT,

  CONSTRAINT atlas_user_securities_auth_history_action_chk
    CHECK (
      change_action IN (
        'created',
        'updated',
        'verified',
        'revoked',
        'expired',
        'restricted',
        'suspended',
        'terminated',
        'reviewed',
        'pending'
      )
    )
);

COMMENT ON TABLE atlas_user_securities_authorization_history IS
  'BR-074 — Append-only securities authorization history. Normal application routes must not update or delete rows.';

CREATE INDEX IF NOT EXISTS idx_atlas_user_securities_auth_history_org_user
  ON atlas_user_securities_authorization_history(organization_id, user_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_atlas_user_securities_auth_history_auth
  ON atlas_user_securities_authorization_history(authorization_id, changed_at DESC);
