-- DR1 down — remove durable appointment reminder storage.

DROP POLICY IF EXISTS atlas_appointment_reminders_deny_authenticated ON public.atlas_appointment_reminders;
DROP POLICY IF EXISTS atlas_appointment_reminders_deny_anon ON public.atlas_appointment_reminders;

DROP INDEX IF EXISTS idx_atlas_appointment_reminders_active_type;
DROP INDEX IF EXISTS idx_atlas_appointment_reminders_due;
DROP INDEX IF EXISTS idx_atlas_appointment_reminders_appointment;
DROP INDEX IF EXISTS idx_atlas_appointment_reminders_org_scheduled;

DROP TABLE IF EXISTS atlas_appointment_reminders;
