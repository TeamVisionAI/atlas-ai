# BR-168 — Unified Agenda V1

Status: design only. No production behavior is changed by this document.

## Goal

Allow Atlas users to schedule operational meetings with people who are not yet Atlas prospects, see those meetings together with existing appointments in the Dashboard Agenda, record an outcome, and later promote the person into the Recruit or Client workflow without creating duplicate history.

## Invariants

1. Standalone Agenda contacts are tenant-scoped and individually owned.
2. Creating an Agenda contact or appointment never enrolls the person into Recruit AI.
3. Recruiting KPIs continue to count recruiting workflow/prospect activity only.
4. Dashboard Agenda is a schedule view, not a recruiting funnel; it may include recruiting interviews, orientations, training, warm-market, client service, and other meetings.
5. Super Admin control-plane mode exposes no operational Agenda data. Tenant Support Mode remains tenant-scoped.
6. Promotion is explicit. A meeting outcome may be `recruited`, `client`, `follow_up`, `no_show`, `not_interested`, `rescheduled`, or `other`, but `recruited`/`client` does not silently create a workflow record until promotion is confirmed.
7. If promoted, appointment/contact history remains linked to the resulting business identity.
8. Existing recruiting appointment behavior, reminders, scheduling, WhatsApp automation, and Recruit AI are unchanged unless explicitly covered by a later implementation step.

## V1 delivery slices

- Foundation: Agenda contact identity + standalone appointment linkage.
- Scheduling: reuse Atlas availability, Google Calendar, meeting location and personal Zoom rules without prospect workflow side effects.
- Read model: persisted appointments become the source for Dashboard Today Agenda while recruiting KPIs remain prospect-scoped.
- Outcome: record operational meeting outcome.
- Promotion: explicit promote-to-Recruit / promote-to-Client actions (may be delivered as a follow-up slice if client-domain prerequisites are not ready).
- Hierarchy: individual ownership first; authorized hierarchy/oversight roll-up is a separate read scope, not ownership transfer.
