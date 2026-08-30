-- BR-183 — Client Documents & Secure Document Requests V1
-- Metadata + request workflow only. Binary objects live in private Supabase Storage.
-- Service-role writes; deny anon/authenticated. Manual status only. No OCR.

BEGIN;

-- Private storage bucket (best-effort; runtime ensureClientDocumentBucket is the fallback)
DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'client-documents',
    'client-documents',
    false,
    10485760,
    ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage.buckets upsert for client-documents (insufficient privilege). Runtime ensureClientDocumentBucket will create it.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping storage.buckets upsert for client-documents: %', SQLERRM;
END $$;

CREATE TABLE IF NOT EXISTS atlas_client_document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES atlas_agenda_clients(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES atlas_users(id),
  service_case_id UUID REFERENCES atlas_client_service_cases(id) ON DELETE SET NULL,
  production_id UUID REFERENCES atlas_client_production(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL
    CHECK (document_type IN (
      'POLICY_DOCUMENT',
      'APPLICATION',
      'STATEMENT',
      'IDENTIFICATION',
      'BENEFICIARY_FORM',
      'SERVICE_FORM',
      'OTHER'
    )),
  title TEXT NOT NULL,
  instructions TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN'
    CHECK (status IN (
      'OPEN',
      'RECEIVED',
      'COMPLETED',
      'CANCELLED'
    )),
  due_date DATE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  fulfilled_document_id UUID,
  created_by_user_id UUID REFERENCES atlas_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS atlas_client_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES atlas_agenda_clients(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES atlas_users(id),
  uploaded_by_user_id UUID REFERENCES atlas_users(id),
  service_case_id UUID REFERENCES atlas_client_service_cases(id) ON DELETE SET NULL,
  production_id UUID REFERENCES atlas_client_production(id) ON DELETE SET NULL,
  request_id UUID REFERENCES atlas_client_document_requests(id) ON DELETE SET NULL,
  document_type TEXT NOT NULL
    CHECK (document_type IN (
      'POLICY_DOCUMENT',
      'APPLICATION',
      'STATEMENT',
      'IDENTIFICATION',
      'BENEFICIARY_FORM',
      'SERVICE_FORM',
      'OTHER'
    )),
  original_filename TEXT NOT NULL,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  status TEXT NOT NULL DEFAULT 'RECEIVED'
    CHECK (status IN (
      'RECEIVED',
      'REVIEW_PENDING',
      'REVIEWED',
      'REJECTED',
      'ARCHIVED'
    )),
  notes TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  history JSONB NOT NULL DEFAULT '[]'::jsonb,
  UNIQUE (organization_id, storage_key)
);

ALTER TABLE atlas_client_document_requests
  DROP CONSTRAINT IF EXISTS atlas_client_document_requests_fulfilled_document_id_fkey;

ALTER TABLE atlas_client_document_requests
  ADD CONSTRAINT atlas_client_document_requests_fulfilled_document_id_fkey
  FOREIGN KEY (fulfilled_document_id) REFERENCES atlas_client_documents(id) ON DELETE SET NULL;

COMMENT ON TABLE atlas_client_document_requests IS
  'BR-183 client document requests. Manual status only. No WhatsApp or filename auto-match.';

COMMENT ON TABLE atlas_client_documents IS
  'BR-183 client document metadata. Binary objects stay in private client-documents storage. No OCR.';

CREATE INDEX IF NOT EXISTS idx_atlas_client_doc_req_org_owner_status
  ON atlas_client_document_requests (organization_id, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_atlas_client_doc_req_org_client
  ON atlas_client_document_requests (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_atlas_client_doc_req_org_service
  ON atlas_client_document_requests (organization_id, service_case_id);

CREATE INDEX IF NOT EXISTS idx_atlas_client_doc_req_org_due
  ON atlas_client_document_requests (organization_id, due_date)
  WHERE status = 'OPEN';

CREATE INDEX IF NOT EXISTS idx_atlas_client_docs_org_owner_status
  ON atlas_client_documents (organization_id, owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_atlas_client_docs_org_client
  ON atlas_client_documents (organization_id, client_id);

CREATE INDEX IF NOT EXISTS idx_atlas_client_docs_org_service
  ON atlas_client_documents (organization_id, service_case_id);

CREATE INDEX IF NOT EXISTS idx_atlas_client_docs_org_request
  ON atlas_client_documents (organization_id, request_id);

ALTER TABLE atlas_client_document_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas_client_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE atlas_client_document_requests FROM anon, authenticated;
REVOKE ALL ON TABLE atlas_client_documents FROM anon, authenticated;
GRANT ALL ON TABLE atlas_client_document_requests TO service_role;
GRANT ALL ON TABLE atlas_client_documents TO service_role;

COMMIT;
