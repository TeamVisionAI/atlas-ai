-- Rollback migration 036 — drop Phase 2 consume linkage columns.

BEGIN;

DROP INDEX IF EXISTS public.idx_qr_scans_inbound_correlation;
DROP INDEX IF EXISTS public.idx_qr_scans_legacy_prospect;
DROP INDEX IF EXISTS public.idx_qr_scans_core_prospect;

ALTER TABLE public.qr_scans
  DROP COLUMN IF EXISTS attribution_result,
  DROP COLUMN IF EXISTS inbound_provider_message_id,
  DROP COLUMN IF EXISTS inbound_correlation_id,
  DROP COLUMN IF EXISTS core_prospect_id,
  DROP COLUMN IF EXISTS legacy_prospect_id;

COMMIT;
