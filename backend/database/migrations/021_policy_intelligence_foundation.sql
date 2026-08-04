-- Policy Intelligence foundation
-- Migration 021
-- Implements BR-051 — PolicyReview / PolicyDocument aggregates (no AI/OCR/extraction yet)

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

INSERT INTO permissions (code, name, category, description) VALUES
  (
    'policy:read',
    'Policy Intelligence Read',
    'Intelligence',
    'View Policy Intelligence workspace, reviews, and documents'
  ),
  (
    'policy:write',
    'Policy Intelligence Write',
    'Intelligence',
    'Create and update policy reviews and documents'
  )
ON CONFLICT (code) DO NOTHING;

-- Grant only to roles that exist in this database (avoids role_code FK failures).
INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('SUPER_ADMIN', 'ADMIN')
  AND p.code IN ('policy:read', 'policy:write')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code IN ('RVP', 'DIVISION_LEADER', 'REGIONAL_LEADER', 'FIELD_TRAINER', 'REPRESENTATIVE')
  AND p.code IN ('policy:read', 'policy:write')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_code, permission_code)
SELECT r.code, p.code
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SUPPORT'
  AND p.code = 'policy:read'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- PolicyReview aggregate (atlas_policy_reviews)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_policy_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  owner_user_id UUID,
  prospect_id UUID,
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE atlas_policy_reviews IS
  'Policy Intelligence — PolicyReview aggregate. Foundation only; AI/OCR/extraction deferred (BR-051).';

COMMENT ON COLUMN atlas_policy_reviews.status IS
  'draft | uploaded | in_review | completed | archived';

CREATE INDEX IF NOT EXISTS idx_atlas_policy_reviews_org
  ON atlas_policy_reviews(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_policy_reviews_org_status
  ON atlas_policy_reviews(organization_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_policy_reviews_owner
  ON atlas_policy_reviews(owner_user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_policy_reviews_prospect
  ON atlas_policy_reviews(prospect_id)
  WHERE prospect_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_policy_reviews_created
  ON atlas_policy_reviews(organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- PolicyDocument aggregate (atlas_policy_documents)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_policy_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  policy_review_id UUID NOT NULL REFERENCES atlas_policy_reviews(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT,
  mime_type TEXT,
  file_size_bytes BIGINT,
  checksum TEXT,
  page_count INTEGER,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  uploaded_by UUID,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE atlas_policy_documents IS
  'Policy Intelligence — PolicyDocument aggregate linked to a PolicyReview. Storage path reserved; OCR/extraction deferred (BR-051).';

COMMENT ON COLUMN atlas_policy_documents.upload_status IS
  'pending | stored | failed';

CREATE INDEX IF NOT EXISTS idx_atlas_policy_documents_org
  ON atlas_policy_documents(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_policy_documents_review
  ON atlas_policy_documents(policy_review_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_policy_documents_org_status
  ON atlas_policy_documents(organization_id, upload_status)
  WHERE deleted_at IS NULL;
