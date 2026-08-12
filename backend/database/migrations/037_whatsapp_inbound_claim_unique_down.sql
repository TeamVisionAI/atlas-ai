-- Rollback migration 037 — drop inbound claim unique index only.
-- Does not un-relabel #historical_duplicate: rows (audit-preserving).

BEGIN;

DROP INDEX IF EXISTS public.idx_workflow_events_whatsapp_inbound_claim;

COMMIT;
