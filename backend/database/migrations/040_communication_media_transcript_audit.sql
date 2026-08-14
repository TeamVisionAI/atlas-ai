-- Migration 040 — communication_media STT audit columns (WhatsApp audio Phase 2).
-- Implements BR-141 — Spanish-first STT + semantic replay.
-- Additive only. Does not rewrite 039. Do NOT apply to production.
--
-- Staging apply: backend/dev/environment/applyStagingMigration040.js
-- Rollback: backend/database/migrations/040_communication_media_transcript_audit_down.sql

BEGIN;

ALTER TABLE communication_media
  ADD COLUMN IF NOT EXISTS transcript_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE communication_media
  ADD COLUMN IF NOT EXISTS transcript_provider TEXT;

ALTER TABLE communication_media
  ADD COLUMN IF NOT EXISTS transcript_model TEXT;

ALTER TABLE communication_media
  ADD COLUMN IF NOT EXISTS transcript_billed_ms INTEGER;

ALTER TABLE communication_media
  ADD COLUMN IF NOT EXISTS transcript_turn_id TEXT;

ALTER TABLE communication_media
  DROP CONSTRAINT IF EXISTS communication_media_transcript_status_check;

ALTER TABLE communication_media
  ADD CONSTRAINT communication_media_transcript_status_check
  CHECK (
    transcript_status IS NULL
    OR transcript_status IN ('pending', 'processing', 'ready', 'failed', 'skipped')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_communication_media_transcript_turn_id
  ON communication_media (transcript_turn_id)
  WHERE transcript_turn_id IS NOT NULL;

COMMENT ON COLUMN communication_media.transcript_status IS
  'BR-141 — pending | processing | ready | failed | skipped. Transcript is derived; original audio is immutable.';

COMMENT ON COLUMN communication_media.transcript_turn_id IS
  'BR-141 — semantic replay id audio-stt:{communication_media.id}. Original wamid remains linkage only.';

COMMENT ON COLUMN communication_media.transcript_provider IS
  'STT provider id (openai). Never expose in customer UI.';

COMMENT ON COLUMN communication_media.transcript_model IS
  'STT model id (gpt-transcribe). Never expose in customer UI.';

COMMENT ON COLUMN communication_media.transcript_billed_ms IS
  'Provider billed duration in milliseconds when reported.';

COMMIT;
