# BR-177 — Unified Agenda Actions & Promotion

Status: V1 implemented.

## Goal

Agenda Contact → Appointment → Outcome → explicit Promote to Recruit or Client.

Unpromoted Agenda contacts are not prospects.

## Client-model decision

Atlas has no canonical Client CRM entity. V1 persists `atlas_agenda_clients` as a durable, tenant-scoped client promotion record linked to `atlas_agenda_contacts`. This is not a Client workspace, pipeline, or billing model.

Do not create a recruiting prospect to represent a client.

## Promotion behavior

### Recruit

1. Requires an explicit Promote to Recruit action.
2. If `promoted_prospect_id` already exists, return that link (no duplicate).
3. Else look up the same-org prospect by normalized phone and link it.
4. Else insert one prospect with `entry_method=AGENDA_PROMOTION`, preserving organization, owner, name, phone, language, source, and notes. Live `prospects` has no `email` column; Agenda contact email is stored as the canonical `EMAIL:` notes token (same as Quick Capture / appointment enrichment). Do not add a `prospects.email` column for this rule.
5. Phone is required. Recruit AI inbox eligibility stays closed unless existing origin rules already allow it.
6. Appointment `prospect_id` / `prospect_phone` are linked after promotion. `standaloneAgenda` remains true so the meeting does not become a recruiting interview.

### Client

1. Requires an explicit Promote to Client action.
2. If `promoted_client_id` already exists, return that link.
3. Else insert one `atlas_agenda_clients` row and store the id on the Agenda contact.
4. No prospect row is written.

## Notifications

Reschedule and cancel reuse BR-176 hooks inside `appointmentApplicationService` only (`APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`). Agenda wrappers do not notify.

## Production follow-up

Apply migration `061_br177_agenda_actions_promotion.sql` to the operational database after merge. No new Railway variables.
