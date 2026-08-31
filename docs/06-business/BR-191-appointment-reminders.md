# BR-191 — Appointment Reminders After Every Create Path

**Implements:** Every active future appointment gets the same WhatsApp reminder schedule after persist, regardless of create path (AI / WhatsApp, Add Agenda, Mission Control, Prospect Center, reschedule). Missing jobs can be repaired without resending past reminders.  
**Domain:** Appointments / communications  
**Depends on:** DR1 reminder storage; BR-075 outbound gate; BR-168 Agenda contacts  
**Related:** BR-076 (Zoom snapshot), BR-172 (ownership return after create)  
**Status:** Implemented  
**Engine target:** `appointmentReminderEngine.scheduleReminders`; `appointmentReminderSchedule`; `agendaApplicationService.createStandaloneAppointment`; `appointmentApplicationService.createAppointment` / `rescheduleAppointment` / `cancelAppointment`  
**Tests:** `backend/test/appointmentReminderCoverageBr191.test.js`

## Rules

1. **One engine** — After a successful appointment persist, call `scheduleReminders`. Do not register reminders in a screen-specific path or a second store.
2. **Cadence** — Offsets come from `resolveAppointmentReminderSchedule` (org settings override, else global 24h / 1h / 30m). Do not hardcode times in Agenda or UI.
3. **Recipient** — WhatsApp uses `prospectPhone` or Agenda `metadata.agendaContactPhone`. Email is never required.
4. **Timezone** — Job fire times are computed from the persisted `startDateTime` instant; display copy uses the appointment timezone.
5. **Idempotent create** — Retrying schedule does not create a second active job for the same appointment + reminder type.
6. **Reschedule** — Cancel pending jobs for the old start, then schedule jobs for the new start. Do not duplicate active types.
7. **Cancel** — Disable future pending reminder jobs. Do not send them.
8. **Repair** — For active future appointments missing expected jobs, create only still-future reminders. Never send or insert a job whose reminder time has already passed. Do not duplicate existing scheduled/sent jobs for the current start.
9. **Boundaries** — Do not enroll Agenda contacts into Recruit AI. Do not write Agenda attendee phone onto `prospects.phone`. No new reminder table.
