-- Migration 039 — Org-scoped communication media (WhatsApp audio Phase 1).
-- Implements BR-140 — media modalities plug into the canonical prospect /
-- conversation / ownership / qualification / outcome model.
-- No STT. No public URLs. Private bucket only.
--
-- Rollback: backend/database/migrations/039_communication_media_down.sql

BEGIN;

-- ---------------------------------------------------------------------------
-- Private storage bucket for original inbound media
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'communication-media',
    'communication-media',
    false,
    16777216,
    ARRAY[
      'audio/ogg',
      'audio/opus',
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/aac',
      'audio/x-m4a',
      'audio/amr',
      'audio/webm'
    ]::text[]
  )
  ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping storage.buckets upsert for communication-media (insufficient privilege). Runtime ensureCommunicationMediaBucket will create it.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Skipping storage.buckets upsert for communication-media: %', SQLERRM;
END $$;

-- ---------------------------------------------------------------------------
-- communication_media
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS communication_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  prospect_id UUID,
  conversation_log_id UUID,
  provider_message_id TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  media_kind TEXT NOT NULL DEFAULT 'audio',
  meta_media_id TEXT,
  mime_type TEXT,
  is_voice_note BOOLEAN NOT NULL DEFAULT true,
  sha256 TEXT,
  file_size INTEGER,
  duration_ms INTEGER,
  storage_path TEXT,
  playback_path TEXT,
  playback_mime_type TEXT,
  fetch_status TEXT NOT NULL DEFAULT 'pending',
  fetch_attempts INTEGER NOT NULL DEFAULT 0,
  fetch_error TEXT,
  transcode_status TEXT NOT NULL DEFAULT 'pending',
  transcode_attempts INTEGER NOT NULL DEFAULT 0,
  transcode_error TEXT,
  transcript_status TEXT,
  transcript_text TEXT,
  transcript_language TEXT,
  transcript_confidence NUMERIC,
  transcript_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT communication_media_fetch_status_check
    CHECK (fetch_status IN ('pending', 'fetching', 'stored', 'failed')),
  CONSTRAINT communication_media_transcode_status_check
    CHECK (transcode_status IN ('pending', 'processing', 'ready', 'failed', 'not_required')),
  CONSTRAINT communication_media_media_kind_check
    CHECK (media_kind IN ('audio', 'image', 'video', 'document', 'sticker')),
  CONSTRAINT communication_media_org_provider_kind_unique
    UNIQUE (organization_id, provider_message_id, media_kind)
);

COMMENT ON TABLE communication_media IS
  'BR-140 — org-scoped inbound communication media. WhatsApp audio Phase 1+1B playback derivative; STT columns reserved nullable. Never public.';

COMMENT ON COLUMN communication_media.fetch_status IS
  'pending | fetching | stored | failed';

COMMENT ON COLUMN communication_media.transcode_status IS
  'pending | processing | ready | failed | not_required — Safari-safe MP3 derivative. Original always preserved.';

COMMENT ON COLUMN communication_media.storage_path IS
  'Private bucket path: organizationId/prospectId/wamid/original.<ext>';

COMMENT ON COLUMN communication_media.playback_path IS
  'Private bucket path: organizationId/prospectId/wamid/playback.mp3 (or original when transcode not_required)';

COMMENT ON COLUMN communication_media.transcript_status IS
  'Reserved for future STT. Phase 1 does not populate.';

CREATE INDEX IF NOT EXISTS idx_communication_media_org_prospect
  ON communication_media (organization_id, prospect_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_communication_media_org_log
  ON communication_media (organization_id, conversation_log_id)
  WHERE conversation_log_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_media_fetch_pending
  ON communication_media (fetch_status, updated_at)
  WHERE fetch_status IN ('pending', 'fetching');

CREATE INDEX IF NOT EXISTS idx_communication_media_transcode_pending
  ON communication_media (transcode_status, updated_at)
  WHERE transcode_status IN ('pending', 'processing');

ALTER TABLE public.communication_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS communication_media_deny_anon ON public.communication_media;
CREATE POLICY communication_media_deny_anon
  ON public.communication_media
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS communication_media_deny_authenticated ON public.communication_media;
CREATE POLICY communication_media_deny_authenticated
  ON public.communication_media
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.communication_media FROM anon, authenticated;
GRANT ALL ON TABLE public.communication_media TO service_role;

COMMIT;
