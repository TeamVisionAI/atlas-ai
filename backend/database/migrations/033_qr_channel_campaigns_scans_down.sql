-- Rollback for 033_qr_channel_campaigns_scans.sql
-- Drops Phase 1 QR Channel tables. Do not run in production without explicit authorization.

BEGIN;

DROP TABLE IF EXISTS public.qr_scans;
DROP TABLE IF EXISTS public.qr_campaigns;

COMMIT;
