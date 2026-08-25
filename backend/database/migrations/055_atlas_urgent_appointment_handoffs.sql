-- Urgent appointment handoff alerts (<=60 minute lead time).

CREATE TABLE IF NOT EXISTS atlas_urgent_appointment_handoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  assigned_user_id UUID NOT NULL,
  prospect_phone TEXT NOT NULL,
  prospect_name TEXT,
  appointment_start TIMESTAMPTZ NOT NULL,
  purpose TEXT,
  meeting_type TEXT,
  minutes_until_start INTEGER,
  status TEXT NOT NULL DEFAULT 'open',
  prospect_confirmation_sent_at TIMESTAMPTZ,
  prospect_confirmation_status TEXT,
  agent_whatsapp_status TEXT,
  agent_whatsapp_sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by_user_id UUID,
  escalated_at TIMESTAMPTZ,
  escalated_to_user_id UUID,
  escalation_due_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_urgent_handoffs_status_chk CHECK (
    status IN ('open', 'acknowledged', 'escalated', 'expired', 'cancelled')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_urgent_handoffs_appointment
  ON atlas_urgent_appointment_handoffs (appointment_id);

CREATE INDEX IF NOT EXISTS idx_atlas_urgent_handoffs_org_user_status
  ON atlas_urgent_appointment_handoffs (organization_id, assigned_user_id, status);

CREATE INDEX IF NOT EXISTS idx_atlas_urgent_handoffs_escalation_due
  ON atlas_urgent_appointment_handoffs (status, escalation_due_at)
  WHERE status = 'open';

COMMENT ON TABLE atlas_urgent_appointment_handoffs IS
  'Urgent appointment handoff alerts for appointments booked <=60 minutes before start.';

ALTER TABLE public.atlas_urgent_appointment_handoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_urgent_handoffs_deny_anon ON public.atlas_urgent_appointment_handoffs;
CREATE POLICY atlas_urgent_handoffs_deny_anon
  ON public.atlas_urgent_appointment_handoffs
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_urgent_handoffs_deny_authenticated ON public.atlas_urgent_appointment_handoffs;
CREATE POLICY atlas_urgent_handoffs_deny_authenticated
  ON public.atlas_urgent_appointment_handoffs
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
