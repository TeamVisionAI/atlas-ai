# PII Standard

## Definition

PII is any information that identifies or can reasonably identify a prospect, recruit, or agent.

## PII Inventory

| Field | Examples | Storage | Display | APIs exposing | Current access |
|-------|----------|---------|---------|---------------|----------------|
| Name | first_name, last_name, display_name | `prospects`, `atlas_core_prospects`, conversation logs | Mission Control, Prospect Center, Workspace | `/api/mission-control/*`, `/api/prospect-center`, `/api/prospect-workspace/*`, `/api/prospects/*` | Authenticated Atlas user (post-remediation on legacy routes) |
| Phone | phone, primary_phone, WhatsApp ID | `prospects`, logs, business events | All recruiting surfaces | Same as above + webhooks | Authenticated user; webhooks from Meta |
| Email | email, notes-extracted email | prospects, notes, calendar | Workspace, scheduling | Mission Control, workspace | Authenticated user |
| Address / city | city, state | prospects | Workspace, Mission Control | Dashboard, workspace | Authenticated user |
| Conversation content | message text, direction, timestamps | `conversation_logs`, business events | Conversation panel, timeline | `/timeline/:phone`, mission control payload | Authenticated user |
| Internal notes | agent notes, notes field | prospects, agent state | Mission Control, Workspace | mission-control actions, workspace | Authenticated user |
| Recruiting status | milestone, step, qualification | prospects, workflow state, projections | Mission Control, Prospect Center | dashboard, prospect-center | Authenticated user |
| Assignment | assigned_agent_id, owner_user_id, organization_id | atlas_core_prospects, prospects | Prospect Center, Core API | `/api/prospects/*` | RBAC-scoped (LC1) |
| Calendar | appointment_date, interview_time, event IDs | prospects, Google Calendar | Workspace, Mission Control | scheduling engines | System + authenticated user |
| Session identity | email, display_name | atlas_users, atlas_sessions | N/A (internal) | `/api/auth/me` | Bearer session token holder |

## Handling rules

| Rule | Requirement |
|------|-------------|
| Minimum exposure | API responses must not include fields unnecessary for the requesting UI |
| Masking | Support role receives masked phone/email via `piiFilter.js` (LC1) |
| Logging | Never log full message bodies, emails, or phone numbers in production access logs |
| Local storage | Session token only in `localStorage`; no prospect PII in browser storage |
| Exports | No bulk export API today; any future export requires Administrator role + audit event |
| Retention | Follow Team Vision data retention policy; document in Privacy_and_Data_Handling |

## Prohibited

- Embedding `ATLAS_BOOTSTRAP_TOKEN` or `VITE_ATLAS_BOOTSTRAP_TOKEN` in production frontend builds
- Returning stack traces or SQL errors to clients in production
- Storing Meta access tokens in client-side code
- Logging contact form submissions with full message content in production

## Verification

See [PRODUCTION_SECURITY_CHECKLIST.md](./PRODUCTION_SECURITY_CHECKLIST.md) — PII section.
