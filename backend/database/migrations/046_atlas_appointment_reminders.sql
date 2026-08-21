-- DR1 — Durable tenant-scoped appointment reminder jobs.
-- Replaces ephemeral backend/data/appointmentReminders.json (Railway-unsafe).

CREATE TABLE IF NOT EXISTS atlas_appointment_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  appointment_id UUID NOT NULL,
  reminder_type TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  offset_minutes INTEGER,
  status TEXT NOT NULL DEFAULT 'scheduled',
  channel TEXT NOT NULL DEFAULT 'whatsapp',
  prospect_phone TEXT,
  appointment_start TIMESTAMPTZ,
  timezone TEXT,
  virtual_meeting_url TEXT,
  meeting_type TEXT,
  meeting_location_type TEXT,
  meeting_provider TEXT,
  meeting_address TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_status TEXT,
  failure_reason TEXT,
  retryable BOOLEAN,
  sent_at TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancel_reason TEXT,
  migrated_from TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT atlas_appointment_reminders_type_chk CHECK (
    reminder_type IN (
      'confirmation',
      'reminder_24h',
      'reminder_1h',
      'reminder_30m',
      'reminder_15m'
    )
  ),
  CONSTRAINT atlas_appointment_reminders_status_chk CHECK (
    status IN ('pending', 'scheduled', 'sent', 'cancelled', 'failed')
  )
);

CREATE INDEX IF NOT EXISTS idx_atlas_appointment_reminders_org_scheduled
  ON atlas_appointment_reminders (organization_id, status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_atlas_appointment_reminders_appointment
  ON atlas_appointment_reminders (appointment_id);

CREATE INDEX IF NOT EXISTS idx_atlas_appointment_reminders_due
  ON atlas_appointment_reminders (status, scheduled_for)
  WHERE status = 'scheduled';

-- At most one active scheduled job per appointment + reminder type.
CREATE UNIQUE INDEX IF NOT EXISTS idx_atlas_appointment_reminders_active_type
  ON atlas_appointment_reminders (appointment_id, reminder_type)
  WHERE status = 'scheduled';

COMMENT ON TABLE atlas_appointment_reminders IS
  'DR1 durable appointment reminder jobs (24h/1h/30m). Tenant-scoped via organization_id.';

-- Backend-only RLS (service role). Matches migration 029 posture.
ALTER TABLE public.atlas_appointment_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atlas_appointment_reminders_deny_anon ON public.atlas_appointment_reminders;
CREATE POLICY atlas_appointment_reminders_deny_anon
  ON public.atlas_appointment_reminders
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS atlas_appointment_reminders_deny_authenticated ON public.atlas_appointment_reminders;
CREATE POLICY atlas_appointment_reminders_deny_authenticated
  ON public.atlas_appointment_reminders
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON TABLE public.atlas_appointment_reminders FROM anon, authenticated;
GRANT ALL ON TABLE public.atlas_appointment_reminders TO service_role;
