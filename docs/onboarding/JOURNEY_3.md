# Journey #3 — The Perfect Day

**Status:** IN PROGRESS  
**Depends on:** Journey #1 (locked), Journey #2 (locked)

## Objective

After an appointment is confirmed, Atlas prepares the full meeting experience automatically: Google Calendar event, Zoom link (when virtual), reminders, and a ready state on the Home Dashboard.

The agent should log in and immediately know where to be, who they are meeting, and what needs attention.

## Scope

| In scope | Out of scope |
|----------|--------------|
| Google Calendar event creation | Notification delivery (SMS, email, WhatsApp) |
| Zoom meeting creation (virtual only) | Reschedule / cancel |
| Reminder object generation | Meeting outcome recording |
| Meeting lifecycle states | Mission Control / Executive Dashboard |
| Home Dashboard improvements | Reminder editor / calendar editor |

## Flow

```
appointment.confirmed
  → meeting.created
  → meeting.calendar.created
  → meeting.zoom.created | meeting.zoom.skipped
  → meeting.reminder.created (×4 default offsets)
  → meeting.ready
  → Home Dashboard updated
```

## Meeting lifecycle

```
scheduled → confirmed → reminder_pending → reminder_generated → meeting_ready → completed → outcome
```

Outcome and completed transitions are reserved for future journeys.

## Domain

`backend/meetings/`

| Module | Responsibility |
|--------|----------------|
| `MeetingService.js` | Listens to `appointment.confirmed`, creates meeting |
| `CalendarService.js` | Google Calendar create only |
| `ZoomService.js` | Zoom create for virtual meetings; skips physical |
| `ReminderService.js` | Generates reminders (24h, 2h, 30m, 5m) — no send |
| `MeetingLifecycleService.js` | Lifecycle states and attention rules |
| `MeetingDashboardService.js` | Dashboard queries |
| `MeetingStore.js` | JSON persistence |

Services communicate only through events.

## Events

- `meeting.created`
- `meeting.calendar.created`
- `meeting.zoom.created`
- `meeting.zoom.skipped`
- `meeting.reminder.created`
- `meeting.ready`

## Dashboard sections

- Today's Meetings
- Next Meeting
- Needs Attention
- Upcoming Meetings
- Atlas Activity

Empty state example: *"You have no meetings scheduled today."*

## Acceptance criteria

- Appointment creates Google Calendar event (`calendarEventId`, `calendarLink`)
- Zoom meeting created when meeting type is virtual
- Physical meetings skip Zoom
- Reminder objects generated and stored
- Meeting lifecycle reaches `meeting_ready`
- Dashboard reflects today's and upcoming meetings
- Empty states handled
- Events emitted correctly

## Verify

```bash
node backend/dev/verifyJourney3.js
```

Uses simulator guard to mock Google Calendar and Zoom API calls.

## Environment (production)

| Variable | Purpose |
|----------|---------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Calendar OAuth |
| Org `calendar_refresh_token_encrypted` | Per-org calendar token from onboarding |
| `ZOOM_ACCOUNT_ID` / `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` | Zoom Server-to-Server OAuth |

Fallback: `GOOGLE_REFRESH_TOKEN` for calendar when org token is unavailable.
