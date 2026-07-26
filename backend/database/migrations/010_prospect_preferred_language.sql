-- Sprint 17.3 — Prospect preferred language (Quick Capture + Mission Control)

ALTER TABLE prospects ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'english';

COMMENT ON COLUMN prospects.preferred_language IS 'Prospect preferred language: english | spanish (independent of recruiter UI)';
