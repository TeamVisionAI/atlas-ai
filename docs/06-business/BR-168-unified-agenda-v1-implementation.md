# BR-168 — Unified Agenda V1 implementation boundary

## Included in this PR

- Individually owned standalone Agenda contacts.
- Dashboard `Add to Agenda` for Training, Warm Market, Orientation, Client Service, and Other meetings.
- Reuse of Atlas availability, personal Google Calendar booking, office location, and personal Zoom resolution.
- Standalone appointments persist in `atlas_appointments` through `agenda_contact_id` while keeping `prospect_id` and `prospect_phone` null.
- `standaloneAgenda` / `noRecruitAi` metadata fail-safe markers.
- Dashboard Today Agenda merges the signed-in user's standalone meetings with the existing recruiting interview/orientation Agenda.
- Existing Appointments screen may display the persisted meeting, but prospect/recruiting lifecycle actions are suppressed for standalone Agenda rows.
- Backend Agenda outcome recording endpoint exists; recruited/client outcomes only mark promotion pending.

## Explicitly not included yet

- Hierarchy/RVP roll-up for standalone Agenda meetings.
- WhatsApp reminders for standalone Agenda contacts.
- Tenant-requested temporary Support Access. Existing Support Mode rules remain unchanged.
- Full Client CRM workspace (BR-177 stores only a durable Agenda client foundation).

Promotion, outcome, reschedule, and cancel actions are delivered by BR-177.

## Safety rules

1. Creating a standalone Agenda meeting never creates or mutates a prospect.
2. Recruit AI never owns a standalone Agenda contact.
3. Standalone attendee phone/email remain Agenda contact data until explicit promotion.
4. Recruiting KPIs continue to use recruiting prospect/workflow sources.
5. Global Super Admin control-plane UI remains operationally empty; no new control-plane data path is added.
