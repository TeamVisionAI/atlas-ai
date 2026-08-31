# BR-185 — Timezone Consistency + Minimum Booking Lead Time

Status: V1 implemented.

## Goal

Keep operational date/time on one timezone resolution path, and never offer or book an automated appointment less than 120 minutes from now.

## Canonical timezone resolution

Reuse BR-079. Do not add a second timezone system.

1. Organization settings timezone
2. Organization / appointment profile timezone
3. Atlas default (`America/New_York` or `ATLAS_DEFAULT_TIMEZONE`)
4. `UTC` only when every candidate fails IANA validation

Sprint 22 slot generation uses `appointmentProfile.defaults.timezone` for wall-clock → UTC (`buildIsoTimestamp`). “Now” is `Date.now()` / injectable `nowMs` compared as UTC instants after that conversion.

## Lead time

`appointmentProfile.defaults.minimumBookingLeadMinutes`

- Default: **120**
- Applied in `appointmentSchedulingEngine.getAvailableSlots` (SoT for automated offers and `createAppointment` confirmation)
- Conversation reads re-filter past slots only unless a caller/fixture passed an explicit lead, so a tenant value below 120 is not overridden
- Reschedule availability uses the same engine
- `existingBooking` and `skipSlotValidation` remain explicit human/admin overrides

No migration. `normalizeAppointmentProfile` fills 120 when the field is missing, so current tenants self-correct after deploy.

## Empty today

If today has no remaining bookable slot after the lead filter, Today is treated as unavailable. Automated conversation reads roll to the next valid day and offer those slots. Copy reuses the existing offer renderer with a today-exhausted prefix (ES/EN).

## Rendering

Appointments list and history use `formatFriendlyAppointmentWhen` with the appointment/operational timezone. Date-only follow-up, document, and service due dates stay date-only. Today / follow-up overdue windows already use BR-079.

## Out of scope

Recruit AI intent logic, semantic shadow/apply, AI Quality classification, WhatsApp routing, campaign intake, BR-178 SoT, BR-183 storage rules. No Team Vision-specific code.
