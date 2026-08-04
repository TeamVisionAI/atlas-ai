-- Sprint 1 — Atlas Extract (Policy Intelligence)
-- Migration 022
-- Implements BR-052 — document ingestion + canonical PolicyExtraction (no AI/OCR)
--
-- Storage bucket `policy-documents`:
--   Preferred: insert below as a Supabase SQL-editor / postgres owner.
--   Fallback: runtime ensurePolicyDocumentBucket() via service-role Storage API.

-- ---------------------------------------------------------------------------
-- Private storage bucket for policy documents (best-effort; may require owner)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'policy-documents',
    'policy-documents',
    false,
    26214400,
    ARRAY[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'text/plain',
      'application/json'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage.buckets upsert for policy-documents (insufficient privilege). Runtime ensurePolicyDocumentBucket will create it.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping storage.buckets upsert for policy-documents: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- PolicyExtraction aggregate (atlas_policy_extractions)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS atlas_policy_extractions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  policy_review_id UUID NOT NULL REFERENCES atlas_policy_reviews(id) ON DELETE CASCADE,
  policy_document_id UUID NOT NULL REFERENCES atlas_policy_documents(id) ON DELETE CASCADE,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'pending',
  extraction_method TEXT NOT NULL DEFAULT 'structured_ingest',
  extracted_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  field_confidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_hints JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  extracted_at TIMESTAMPTZ,
  extracted_by UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_policy_extractions_document_unique UNIQUE (policy_document_id)
);

COMMENT ON TABLE atlas_policy_extractions IS
  'Policy Intelligence — PolicyExtraction aggregate (canonical structured model). Atlas Extract Sprint 1; AI/OCR deferred (BR-052).';

COMMENT ON COLUMN atlas_policy_extractions.status IS
  'pending | extracted | failed';

COMMENT ON COLUMN atlas_policy_extractions.extraction_method IS
  'structured_ingest | rules — never ai/ocr in Sprint 1';

COMMENT ON COLUMN atlas_policy_extractions.extracted_data IS
  'Canonical PolicyExtraction payload (schemaVersion 1.0)';

CREATE INDEX IF NOT EXISTS idx_atlas_policy_extractions_org
  ON atlas_policy_extractions(organization_id);

CREATE INDEX IF NOT EXISTS idx_atlas_policy_extractions_review
  ON atlas_policy_extractions(policy_review_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_atlas_policy_extractions_org_status
  ON atlas_policy_extractions(organization_id, status)
  WHERE deleted_at IS NULL;
