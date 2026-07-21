# Journey #2 — First Appointment

**Status:** IN PROGRESS  
**Depends on:** Journey #1 (locked)

## Objective

When a prospect completes the recruiting workflow interview step, Atlas books the **first appointment**, generates a **confirmation**, and the agency owner sees it on the Home Dashboard.

No Mission Control. No Executive Dashboard. One clear outcome: **the first meeting appears on `/app` with confirmation complete.**

## Scope

| In scope | Out of scope |
|----------|--------------|
| Book appointment when `workflow.interviewRequested` fires | Reminder delivery |
| Generate confirmation object + message | SMS / Email / WhatsApp delivery |
| Emit `appointment.confirmed` | Reschedule / cancel UI |
| Persist appointments + confirmations (JSON for now) | Full scheduling engine UI |
| Populate Home Dashboard cards | CRM sync |
| Resolve simple preferred date/time (tomorrow, morning, etc.) | Multi-org calendar tokens |
| Atlas Activity entry for confirmation | Google Calendar API, Zoom creation |

## Flow

```
Prospect conversation
  → Recruiting workflow (INTERVIEW_TYPE_SELECTED)
  → workflow.interviewRequested
  → AppointmentBookingService
  → Appointment created
  → Confirmation generated
  → appointment.confirmed
  → Home Dashboard shows Today's Meetings / Next Meeting / Activity
```

## Confirmation model

```json
{
  "appointmentId": "...",
  "prospectName": "Maria Lopez",
  "meetingType": "office",
  "date": "Tuesday, August 5",
  "time": "5:00 PM",
  "timezone": "America/New_York",
  "locationName": "Team Vision Office",
  "address": "123 Main Street, Miami, FL",
  "meetingUrl": null,
  "confirmationMessage": "You're all set!\n\n...",
  "createdAt": "2026-07-21T..."
}
```

Confirmation generation lives in `backend/appointments/ConfirmationService.js`. It does not call any delivery channel.

## API

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/home/summary` | Today's meetings, next meeting, new prospects, activity |

## Events

- `workflow.interviewRequested` (input)
- `appointment.scheduled` (appointment created)
- `appointment.confirmed` (confirmation generated; payload: `appointment`, `confirmation`, `organization`, `prospect`)

## Acceptance criteria

### Increment 1 — Appointment booking

- First prospect interview request creates an appointment record
- Activated user's dashboard shows the appointment
- New prospect count reflects gateway prospects
- Activity feed shows the scheduling event

### Increment 2 — Appointment confirmation

- Confirmation object generated with date, time, location, and message
- Confirmation stored on appointment record (`status: confirmed`)
- `appointment.confirmed` emitted with full payload
- Atlas Activity shows: `Appointment confirmed for {name}.`
- No delivery integrations (Journey #3)

## Verify

```bash
node backend/dev/verifyJourney2.js
```
