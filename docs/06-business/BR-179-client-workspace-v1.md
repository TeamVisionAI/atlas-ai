# BR-179 — Client Workspace V1

Status: V1 implemented.

## Goal

Agenda Contact → Appointment → Client → Follow-ups, with later room for FNA / Policy Review. Production tracking is BR-181.

Clients stay completely separate from recruiting prospects and Recruit AI.

## Source of truth

`atlas_agenda_clients` is the canonical V1 client entity (created by BR-177 Promote to Client).

No second client table. Smallest additive migration only:

- `status` TEXT NOT NULL DEFAULT `ACTIVE`
- `history` JSONB NOT NULL DEFAULT `[]`

Apply `backend/database/migrations/063_br179_client_workspace.sql` after merge. No Railway variables. No data backfill.

## APIs

- `GET /api/clients` — `q`, `scope=mine|team`
- `GET /api/clients/:id` — profile, Agenda contact, appointments, BR-178 follow-ups
- `POST /api/clients/:id/notes`
- `POST /api/clients/:id/status`

Follow-ups reuse `POST /api/follow-ups` with `entityType=client`. Appointments reuse existing appointment routes/dialogs.

## UI

- `/app/clients` — My Clients / authorized Team Clients
- `/app/clients/:clientId` — profile
- Sidebar **Clients** next to Follow-ups
- Promote to Client lands on `/app/clients/:id`
- Client follow-ups in `/app/follow-ups` open the client profile

## Permissions

Same owner / hierarchy model as BR-178. Wrong-org IDs → 404. Super Admin control-plane empty. Support Mode tenant-bound.

## Out of scope

FNA, Policy Review, Policy Intelligence, service-appointment productization, and household relationships. Production/premium tracking is BR-181.
