# BR-178 — Follow-up Engine V2

Status: V1 implemented.

## Goal

Outcome / operational event → durable follow-up obligation → owner queue → due/overdue → in-app notification.

V1 does not silently send WhatsApp, SMS, or email.

## Source of truth

`atlas_follow_ups` is the queue SoT for `/app/follow-ups`, My Dashboard chips, and BR-176 `FOLLOW_UP_DUE` / `FOLLOW_UP_OVERDUE`.

`agentState.followUpDate`, `followUpTime`, and `futureReminder` remain recruiting workflow milestone fields (BR-035 / BR-036 / BR-037). Interview outcomes still write them so existing workflow engines stay intact.

Leftover agentState-only items without a matching durable row may appear as read-only `source=legacy` rows. There is no silent production backfill.

### Queue classification

| Condition | View status |
|---|---|
| Follow-up exists, no due date | `needs-date` |
| Due date is today (org-local) | `due-today` |
| Due date in the past | `overdue` |
| Due date in the future | `upcoming` |
| Completed / cancelled | `completed` |

Never classify Overdue without an actual due date. Priority must not show “Urgent — overdue” when the date is missing.

### Set date (legacy conversion)

`POST /api/follow-ups` with `legacyConversion: true` creates or updates one durable obligation (`dedup_key` = `legacy:{entityType}:{entityId}`). After that row exists, merge hides the derived legacy row for the same phone/entity. Classification is read-time — existing undated rows self-correct to Needs Date on deploy without a data migration.

### Follow-ups page refresh

Fetch on entry, filter/tab/scope/search change, and after mutations. Optional stale refresh on window/tab focus. No `setInterval` on `FollowUpsPage`. BR-176 NotificationBell polling is unchanged.

## Outcome mapping

| Outcome | Follow-up |
|---|---|
| `follow_up` / Follow Up Needed | Create/update. Date required or default +3 days, 10:00 (existing interview config). |
| `no_show` | Retry obligation. Existing default +7 days, 10:00. Not an aggressive cadence. |
| `not_interested` | Only if a recycle / future date is provided. |
| `recruited` | IBA / onboarding check-in (+3 days). Canonical next step already exists. |
| Interview `Became Client` | 2-day service check-in from existing interview config. |
| Agenda `client` | None. No Client CRM workflow. |
| `rescheduled` | None. The appointment is the next action. |
| `cancelled` | None unless an existing rule already requires outreach (none in V1). |

Hooks live on `recordInterviewOutcome` and `recordStandaloneOutcome` only.

## APIs

- `GET /api/follow-ups` — `filter`, `q`, `sort`, `scope=mine|team`
- `POST /api/follow-ups` — manual create
- `POST /api/follow-ups/:id/complete`
- `POST /api/follow-ups/:id/reschedule`
- `POST /api/follow-ups/:id/cancel`

Dashboard `GET /api/dashboard` adds `followUpsDue`, `followUpsOverdue`, `nextFollowUps`.

## Notifications

In-app BR-176 events, owner only, dedup `${event}:${org}:${followUpId}:${dueDate}`. Sound stays on the existing preference architecture (default OFF).

## UI

Existing route `/app/follow-ups` (`FollowUpsPage.jsx`). My Dashboard reuses the personal Today surface.

## Migration

Apply `backend/database/migrations/062_br178_follow_ups.sql` after merge. No Railway flag. No data backfill required.
