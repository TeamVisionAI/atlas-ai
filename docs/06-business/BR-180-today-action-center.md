# BR-180 — Today / Action Center

Status: V1 implemented.

## Goal

Give each user one place to answer: **What needs my attention today?**

`/app/today` is an aggregation / read model. It does not create a competing operational table or mutate priority because an item appears on Today.

## Source systems

| Section | Canonical source |
| --- | --- |
| Needs Attention | Prospect attention + BR-080 acknowledgement. Real `human_required` / takeover only, including persisted CRM rows that are not yet BR-159 operational-pipeline members. Healed first-response SLA leftovers (`waiting_for_prospect` / `ai_responding` + `unacknowledged_sla_15m`) are excluded. |
| Today’s Appointments | Persisted `atlas_appointments` filtered by BR-079 organization-local today. |
| Follow-ups Due | BR-178 `listFollowUps` (`includeLegacy: true`) — Due Today, Overdue, Needs Date. Needs Date comes from that canonical list (durable dated rows or legacy undated coverage). Do not require a nullable `atlas_follow_ups.due_date`. Recruiting and client (`entityType=client`). |
| New Leads / Conversations | `needsManualAcknowledge` / operational acknowledgement. Atlas-answered New is not actionable. |
| Notifications | BR-176 `listMyNotifications` unread rows. No second notification system. |

Today loads persisted org prospects (simulator / BR-136 TEST-CANARY excluded) and then keeps rows with a durable attention/inbound signal **or** BR-159 operational membership. My Today still owner-scopes; unowned rows do not leak into My Today.

Clients participate only through real items: appointment today, follow-up due/overdue/needs-date, or a relevant notification. They are not added to recruiting metrics.

## API

`GET /api/today?scope=mine|team`

Returns:

- `scope`, `teamAvailable`, `timeZone`, `today` (org-local date)
- `caughtUp`
- `counts`: `needsAttention`, `appointmentsToday`, `followUpsDueOverdue`, `newActionable` (same items as the sections)
- `sections`: `needsAttention`, `appointmentsToday`, `followUps`, `newLeads`, `notifications`

Each item has `href`, `displayPriority`, `whenLabel` (friendly, org-local), and reused action metadata. Follow-up mutations still go through `/api/follow-ups`. Appointment open/reschedule/cancel/outcome stay on `/app/appointments?appointmentId=`.

## Priority

Display order only:

1. Human takeover / real Needs Attention
2. Overdue follow-ups
3. Appointment starting soon / today
4. Due Today follow-ups
5. Needs Date
6. New actionable conversations
7. Lower-priority notifications

## Timezone

“Today” is the BR-079 organization timezone window, not server UTC. UI shows friendly times only.

## Permissions

- Default **My Today** — current user only
- **Team Today** only when existing hierarchy already allows team visibility (same helper as BR-178)
- Org isolation, owner/subtree rules, Support Mode tenant binding
- Super Admin control-plane empty

## Refresh

Fetch on page entry, My/Team change, after mutations, and stale window focus (60s). No `setInterval` on Today. BR-176 NotificationBell polling stays separate.

## Out of scope

Recruit AI, semantic apply, AI Quality, WhatsApp eligibility, campaign intake, scheduling rules, BR-176 engine, BR-178/179 sources of truth. No Team Vision-specific code. No migration.
