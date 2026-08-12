-- WhatsApp inbound atomic claim (provider message idempotency).
-- Partial UNIQUE on canonical inbound claim keys only:
--   whatsapp:inbound:{providerMessageId}
-- Does NOT unique stall:/reconcile:/advance: or suffixed inbound keys
--   (whatsapp:inbound:{wamid}:prospect_created, :conversation_started, …).
--
-- Historical duplicate claim keys (race artifacts) are retained: later rows
-- are relabeled with #historical_duplicate:{id} so they stay auditable and
-- fall outside the unique predicate. No DELETE.
--
-- Rollback: backend/database/migrations/037_whatsapp_inbound_claim_unique_down.sql

BEGIN;

-- Preserve later duplicates; keep the earliest row as the canonical claim.
UPDATE public.workflow_events AS w
SET correlation_id = w.correlation_id || '#historical_duplicate:' || w.id::text
FROM (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY correlation_id
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.workflow_events
  WHERE correlation_id ~ '^whatsapp:inbound:[^:]+$'
) AS dups
WHERE w.id = dups.id
  AND dups.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_events_whatsapp_inbound_claim
  ON public.workflow_events (correlation_id)
  WHERE correlation_id ~ '^whatsapp:inbound:[^:]+$';

COMMENT ON INDEX public.idx_workflow_events_whatsapp_inbound_claim IS
  'Atomic WhatsApp inbound claim: one workflow_events row per whatsapp:inbound:{providerMessageId}. Suffixed inbound keys and other correlation families are excluded.';

COMMIT;
