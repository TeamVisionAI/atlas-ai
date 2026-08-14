-- Down 040 — drop Phase 2 STT audit columns.
-- Do not apply in production. Does not drop 039 communication_media or objects.

BEGIN;

DROP INDEX IF EXISTS idx_communication_media_transcript_turn_id;

ALTER TABLE communication_media
  DROP CONSTRAINT IF EXISTS communication_media_transcript_status_check;

ALTER TABLE communication_media
  DROP COLUMN IF EXISTS transcript_turn_id,
  DROP COLUMN IF EXISTS transcript_billed_ms,
  DROP COLUMN IF EXISTS transcript_model,
  DROP COLUMN IF EXISTS transcript_provider,
  DROP COLUMN IF EXISTS transcript_attempts;

COMMIT;
