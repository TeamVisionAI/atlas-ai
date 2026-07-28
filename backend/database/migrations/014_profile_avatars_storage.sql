-- Sprint 19.1 — Profile avatar storage (Supabase Storage)

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS avatars_public_read ON storage.objects;

CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT
  USING (bucket_id = 'avatars');

COMMENT ON TABLE storage.buckets IS 'Supabase Storage buckets (avatars added Sprint 19.1)';
