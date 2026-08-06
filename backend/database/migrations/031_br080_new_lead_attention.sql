-- BR-080 — Canonical New Lead Assignment and Attention Lifecycle
-- Additive only. No ownership backfill. No destructive rewrite.

ALTER TABLE prospects
  ADD COLUMN IF NOT EXISTS assignment_status text,
  ADD COLUMN IF NOT EXISTS assignment_source text,
  ADD COLUMN IF NOT EXISTS attention_status text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS human_attention_reason text,
  ADD COLUMN IF NOT EXISTS new_lead_received_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_escalated_at timestamptz;

COMMENT ON COLUMN prospects.assignment_status IS 'BR-080 assigned|unassigned';
COMMENT ON COLUMN prospects.assignment_source IS 'BR-080 assignment provenance';
COMMENT ON COLUMN prospects.attention_status IS 'BR-080 new|ai_responding|waiting_for_prospect|human_required|acknowledged|resolved';
COMMENT ON COLUMN prospects.acknowledged_at IS 'BR-080 human acknowledgement timestamp';
COMMENT ON COLUMN prospects.acknowledged_by_user_id IS 'BR-080 acknowledging atlas_users.id';
COMMENT ON COLUMN prospects.human_attention_reason IS 'BR-080 sanitized human-attention reason';
COMMENT ON COLUMN prospects.new_lead_received_at IS 'BR-080 create-time new-lead clock (UTC)';
COMMENT ON COLUMN prospects.escalation_level IS 'BR-080 0|1|2 escalation level';
COMMENT ON COLUMN prospects.last_escalated_at IS 'BR-080 last escalation timestamp (UTC)';

CREATE INDEX IF NOT EXISTS idx_prospects_org_unassigned
  ON prospects (organization_id, created_at)
  WHERE owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_prospects_org_attention
  ON prospects (organization_id, attention_status, new_lead_received_at);

CREATE INDEX IF NOT EXISTS idx_prospects_org_unack_new
  ON prospects (organization_id, acknowledged_at, new_lead_received_at)
  WHERE acknowledged_at IS NULL;
