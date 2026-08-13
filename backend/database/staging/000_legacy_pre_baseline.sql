-- Staging-only pre-baseline.
-- Numbered migrations 001–038 ALTER legacy `prospects` and `conversation_logs`
-- that predate the migration series. This file creates EMPTY tables with the
-- original pre-001 columns only. No production rows. Do not apply in production.

CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  name TEXT,
  current_step TEXT DEFAULT 'GREETING',
  status TEXT DEFAULT 'NEW',
  last_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  city TEXT,
  state TEXT,
  work_authorized BOOLEAN,
  occupation TEXT,
  language TEXT DEFAULT 'es',
  appointment_type TEXT,
  appointment_date TIMESTAMPTZ,
  notes TEXT,
  interview_type TEXT,
  interview_time TEXT,
  calendar_event_id TEXT
);

CREATE TABLE IF NOT EXISTS conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_phone TEXT NOT NULL,
  prospect_name TEXT,
  direction TEXT NOT NULL,
  message TEXT NOT NULL,
  intent TEXT,
  pipeline TEXT,
  current_step TEXT,
  language TEXT DEFAULT 'en',
  city TEXT,
  state TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE prospects IS 'Staging pre-baseline — empty legacy phone profile table (pre-001)';
COMMENT ON TABLE conversation_logs IS 'Staging pre-baseline — empty legacy conversation log table (pre-001)';
