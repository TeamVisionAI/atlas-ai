-- BR-080 down — remove additive attention columns (authorized ops only).

DROP INDEX IF EXISTS idx_prospects_org_unack_new;
DROP INDEX IF EXISTS idx_prospects_org_attention;
DROP INDEX IF EXISTS idx_prospects_org_unassigned;

ALTER TABLE prospects
  DROP COLUMN IF EXISTS last_escalated_at,
  DROP COLUMN IF EXISTS escalation_level,
  DROP COLUMN IF EXISTS new_lead_received_at,
  DROP COLUMN IF EXISTS human_attention_reason,
  DROP COLUMN IF EXISTS acknowledged_by_user_id,
  DROP COLUMN IF EXISTS acknowledged_at,
  DROP COLUMN IF EXISTS attention_status,
  DROP COLUMN IF EXISTS assignment_source,
  DROP COLUMN IF EXISTS assignment_status;
