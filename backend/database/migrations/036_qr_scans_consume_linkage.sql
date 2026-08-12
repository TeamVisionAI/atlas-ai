-- QR Channel Phase 2 — consume linkage columns on qr_scans (BR-129).
-- Additive only. Nullable. No backfill. No new touches table.
--
-- Rollback: backend/database/migrations/036_qr_scans_consume_linkage_down.sql

BEGIN;

ALTER TABLE public.qr_scans
  ADD COLUMN IF NOT EXISTS legacy_prospect_id uuid,
  ADD COLUMN IF NOT EXISTS core_prospect_id uuid,
  ADD COLUMN IF NOT EXISTS inbound_correlation_id text,
  ADD COLUMN IF NOT EXISTS inbound_provider_message_id text,
  ADD COLUMN IF NOT EXISTS attribution_result text;

COMMENT ON COLUMN public.qr_scans.legacy_prospect_id IS
  'Phase 2 — legacy prospects.id linked when QR scan is consumed';
COMMENT ON COLUMN public.qr_scans.core_prospect_id IS
  'Phase 2 — atlas_core_prospects.id linked when QR scan is consumed (BR-120)';
COMMENT ON COLUMN public.qr_scans.inbound_correlation_id IS
  'Phase 2 — WhatsApp inbound correlation id that consumed this scan';
COMMENT ON COLUMN public.qr_scans.inbound_provider_message_id IS
  'Phase 2 — optional Meta provider message id for the consuming inbound';
COMMENT ON COLUMN public.qr_scans.attribution_result IS
  'Phase 2 — audit outcome e.g. attached_new | attached_existing | historical_inactive_campaign';

CREATE INDEX IF NOT EXISTS idx_qr_scans_core_prospect
  ON public.qr_scans (core_prospect_id)
  WHERE core_prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qr_scans_legacy_prospect
  ON public.qr_scans (legacy_prospect_id)
  WHERE legacy_prospect_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_qr_scans_inbound_correlation
  ON public.qr_scans (org_id, inbound_correlation_id)
  WHERE inbound_correlation_id IS NOT NULL;

COMMIT;
