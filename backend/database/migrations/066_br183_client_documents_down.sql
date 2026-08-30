-- BR-183 down — metadata tables only. Does not delete the private storage bucket.

BEGIN;

DROP TABLE IF EXISTS atlas_client_documents;
DROP TABLE IF EXISTS atlas_client_document_requests;

COMMIT;
