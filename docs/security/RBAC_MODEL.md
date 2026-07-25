# RBAC Model

**LC1 status:** Implemented — see [LAUNCH_CANDIDATE_SECURITY_REPORT.md](./LAUNCH_CANDIDATE_SECURITY_REPORT.md)

## Roles

| Role | Code | Scope |
|------|------|-------|
| Administrator | `administrator` | Full platform administration within organization |
| RVP | `rvp` | Entire organization |
| Division Leader | `division_leader` | Assigned division hierarchy |
| Agent | `agent` | Assigned prospects only |
| Recruiter | `recruiter` | Personal recruiting workspace (assigned prospects) |
| Operations | `operations` | Operations Center only — no prospect mutations |
| Support | `support` | Limited troubleshooting with masked PII |

## Permission matrix

Defined in `backend/security/permissions.js` and enforced via:

- `requirePermission()` — capability checks
- `requireRole()` — role checks
- `requireProspectAccess()` — ownership + hierarchy checks
- `canAccessProspect()` — centralized prospect authorization

| Permission | administrator | rvp | division_leader | agent | recruiter | operations | support |
|------------|---------------|-----|-----------------|-------|-----------|------------|---------|
| prospect:read | Yes | Yes | Yes | Assigned | Assigned | No | Yes (masked) |
| prospect:write | Yes | Yes | Yes | Assigned | Assigned | No | No |
| prospect:assign | Yes | Yes | Yes | No | No | No | No |
| prospect:communicate | Yes | Yes | Yes | Assigned | Assigned | No | No |
| dashboard:executive | Yes | Yes | Yes | No | No | No | No |
| operations:access | Yes | No | No | No | No | Yes | No |
| audit:read | Yes | Yes | No | No | No | Yes | Yes |

## Authorization flow

1. `requireAtlasUser` validates bearer session and attaches `req.authContext`.
2. Route middleware checks permissions (`requirePermission`) and/or roles (`requireRole`).
3. Prospect routes load the prospect row and call `canAccessProspect(authContext, prospect)`.
4. List endpoints apply `getProspectListScope()` filters (organization, division, owner).

## Prospect ownership

Every prospect record includes:

- `organization_id` — tenant boundary
- `owner_user_id` — primary owner
- `assigned_agent_id` — active assignee (core prospects)
- `assigned_division_id` — division scope for leaders
- `assigned_rvp_id` — RVP hierarchy reference

## Operations Center

Access requires `operations:access` permission (`administrator` or `operations` roles). Recruiting APIs remain blocked for operations users via missing prospect permissions.

## Authentication flow

See [SECURITY_CHARTER.md](./SECURITY_CHARTER.md) and [LAUNCH_CANDIDATE_SECURITY_REPORT.md](./LAUNCH_CANDIDATE_SECURITY_REPORT.md).

Bootstrap authentication has been removed. Users authenticate with email + password via `POST /api/auth/login`.
