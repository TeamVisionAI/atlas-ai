-- Conversations inbox: org + phone + recency lookups for sidebar previews/unread.
CREATE INDEX IF NOT EXISTS idx_conversation_logs_org_phone_created
  ON conversation_logs (organization_id, prospect_phone, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_logs_phone_created
  ON conversation_logs (prospect_phone, created_at DESC);
