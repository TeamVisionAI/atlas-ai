-- BR-176 — Agent Notifications Foundation.
-- Tenant-scoped in-app notifications. Service-role writes; deny anon/authenticated.

BEGIN;

CREATE TABLE IF NOT EXISTS agent_notifications (
  id UUID PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES atlas_users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'NEW_APPOINTMENT',
      'APPOINTMENT_RESCHEDULED',
      'APPOINTMENT_CANCELLED',
      'NEEDS_ATTENTION',
      'HUMAN_TAKEOVER_REQUESTED'
    )),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  action_url TEXT,
  severity TEXT NOT NULL DEFAULT 'HIGH'
    CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  dedup_key TEXT NOT NULL
);

COMMENT ON TABLE agent_notifications IS
  'BR-176 per-user in-app operational notifications. Not a tenant-wide inbox.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_notifications_dedup
  ON agent_notifications (organization_id, recipient_user_id, dedup_key);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_recipient_created
  ON agent_notifications (organization_id, recipient_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_notifications_recipient_unread
  ON agent_notifications (organization_id, recipient_user_id)
  WHERE read_at IS NULL AND dismissed_at IS NULL;

ALTER TABLE agent_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_notifications_deny_anon ON agent_notifications;
CREATE POLICY agent_notifications_deny_anon
  ON agent_notifications FOR ALL TO anon USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS agent_notifications_deny_authenticated ON agent_notifications;
CREATE POLICY agent_notifications_deny_authenticated
  ON agent_notifications FOR ALL TO authenticated USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE agent_notifications FROM anon, authenticated;
GRANT ALL ON TABLE agent_notifications TO service_role;

COMMIT;
