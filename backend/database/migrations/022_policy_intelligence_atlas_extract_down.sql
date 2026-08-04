-- Rollback Atlas Extract (migration 022)

DROP TABLE IF EXISTS atlas_policy_extractions;

DELETE FROM storage.objects WHERE bucket_id = 'policy-documents';
DELETE FROM storage.buckets WHERE id = 'policy-documents';
