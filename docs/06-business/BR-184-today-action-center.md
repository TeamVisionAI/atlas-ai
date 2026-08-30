# BR-184 — Today / Action Center

Status: V1 implemented.

## Goal

Give each agent one tenant-safe place to see and act on everything that requires attention today, without checking Appointments, Follow-ups, Conversations, Clients, or Documents separately.

`/app/today` is an aggregation / presentation read model. It does not create a competing operational table.

## Source of truth

Canonical source records remain SoT. Today only normalizes them for a daily list.

| Obligation | Canonical source |
| --- | --- |
| Appointments today | Persisted `atlas_appointments` in the BR-079 organization-local today window |
| Overdue / due-today follow-ups | BR-178 `listFollowUps` (`includeLegacy: true`) |
| Needs Attention / unanswered | Prospect attention + BR-080 acknowledgement. Healed first-response SLA leftovers stay out |
| Human takeover | Distinct `HUMAN_TAKEOVER_REQUESTED` only when the conversation is not already on Today |
| Overdue / due-today document requests | BR-183 open requests |
| Overdue / due-today service cases | BR-182 open dated cases |

Do not create parallel obligation tables. Notifications are not a second SoT.

## Dedup

One underlying operational obligation appears once.

Prefer the canonical item when the same work is also surfaced as:

- notification + follow-up
- notification + appointment
- notification + document request
- notification + Needs Attention / takeover

Undated follow-ups, Needs Date document requests, upcoming future items, and fulfilled/closed document requests do not appear.

## Item model

Presentation only:

`kind`, `entityId`, `entityType`, `title`, `personName`, `owner`, `status`, `dueAt`, `priority`, `sourceKind`, `openPath`, `actions`

## Priority

Display order only. Do not invent urgency when no due date exists.

1. Overdue
2. Needs Attention / human takeover
3. Due now / due today
4. Upcoming later today

Within the same priority: due time/date, then stable created timestamp.

## API

`GET /api/today?scope=mine|team&filter=all|overdue|needs_attention|due_today|appointments|follow_ups|documents`

Returns `scope`, `filter`, `teamAvailable`, `timeZone`, `today`, `caughtUp`, unfiltered `counts`, filtered `items`, and compatibility `sections`.

Counts: Overdue, Needs Attention, Due Today, Appointments Today.

Actions reuse existing appointment, follow-up, document, conversation, and client routes. Refresh Today immediately after a mutation.

## Permissions

- Default **My**
- **Team** only when existing hierarchy already allows team visibility
- Org isolation, owner/subtree rules, Support Mode tenant-bound
- Super Admin control-plane empty
- Wrong-org entities fail closed on Today; canonical mutation routes keep 404
- Prospect authorization uses canonical `req.authContext` from `buildAuthContext`

No Team Vision-specific logic. Future tenants get the same behavior through configuration and permissions.

## Refresh

Fetch on page entry, My/Team change, filter change, after mutations, and stale window focus (60s). No `setInterval` on Today. BR-176 NotificationBell polling stays separate.

## Out of scope

Recruit AI, semantic shadow/apply, AI Quality, WhatsApp eligibility/routing, campaign intake, BR-178 SoT, BR-183 storage rules, appointment scheduling rules. Advanced filtering, saved views, and cross-source obligation merging beyond notification dedup stay future work.

No migration. No new Railway variables.
