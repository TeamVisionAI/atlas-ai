# Prospect Permissions & Ownership

## AI Summary

Prospect permissions define who may create, edit, assign, merge, archive, view, export, or restore Prospects across Atlas roles (Administrator through Read Only, plus future External API). Ownership rules govern assignment, transfer, team visibility, and historical record when users become inactive. Every modification, assignment, merge, delete attempt, and permission change must emit a Business Event for audit. Architecture only — no implementation in Sprint 14.0.1.

## Purpose

Design **ownership and security** for the Prospect Engine — roles, permissions, ownership rules, and audit requirements — independent of communication channel.

## Status

Approved — Architecture only (Sprint 14.0.1)

---

## Roles

| Role | Description |
|------|-------------|
| **Administrator** | Full org access; user and permission management |
| **RVP** | Regional oversight; merge, export, team visibility across division |
| **Division Leader** | Division-scoped management; assign within division |
| **Representative** | Primary agent; day-to-day Prospect work |
| **Assistant** | Supports assigned Representative; limited write scope |
| **Read Only** | View Prospects and timeline; no mutations |
| **External API** *(future)* | Machine client with scoped token; no UI |

Roles map to Atlas users (`atlas_users`) and future org hierarchy (RFC-006).

---

## Permission matrix

| Action | Administrator | RVP | Division Leader | Representative | Assistant | Read Only | External API |
|--------|:-------------:|:---:|:---------------:|:--------------:|:---------:|:---------:|:------------:|
| **Create Prospect** | ✅ | ✅ | ✅ | ✅ | ✅* | ❌ | ✅** |
| **Edit Prospect** | ✅ | ✅ | ✅ | ✅† | ✅‡ | ❌ | ✅** |
| **Assign Prospect** | ✅ | ✅ | ✅ | ✅§ | ❌ | ❌ | ❌ |
| **Merge Prospect** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Archive Prospect** | ✅ | ✅ | ✅ | ✅† | ❌ | ❌ | ❌ |
| **Delete Prospect** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **View Timeline** | ✅ | ✅ | ✅ | ✅¶ | ✅¶ | ✅ | ✅** |
| **View AI Insights** | ✅ | ✅ | ✅ | ✅¶ | ✅¶ | ✅ | ✅** |
| **Export Data** | ✅ | ✅ | ✅¶ | ❌ | ❌ | ❌ | ❌ |
| **Restore Prospect** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

\* Assistant: create only when creating on behalf of assigned Representative  
† Own assigned Prospects only (unless elevated)  
‡ Assistant: edit contact/notes only — not lifecycle or assignment  
§ Representative: self-assign from pool per business rules; not arbitrary reassignment of others  
¶ Scoped to visibility rules below  
\*\* External API: token-scoped subset; defined per integration contract

**Delete** is hard-delete or GDPR purge — distinct from **Archive**. Delete attempts by unauthorized roles emit `error_logged` + audit event.

---

## Ownership rules

### Who owns a Prospect

- Every active Prospect has **one primary owner** (`assignedAgentId`) at a time
- **Ownership** = accountability for follow-up, handoff, and Mission Control queue presence
- **Atlas** may temporarily own automation-driven phases (BR-015 – BR-017 handoff rules)

### Transfer ownership

| Initiator | Allowed |
|-----------|---------|
| Administrator / RVP | Transfer to any user in scope |
| Division Leader | Transfer within division |
| Representative | Request transfer or release to pool (policy TBD) |
| System / Atlas | Auto-assign per routing rules |

Every transfer emits `prospect_updated` + assignment Business Event with `previousOwner`, `newOwner`, `actor`, `reason`.

### Shared ownership

- **Primary owner** remains single source of accountability
- **Assistant** may be linked as `supportingAgentId` (future field) with limited edit rights
- **Team visibility** does not imply co-ownership

### Team visibility

| Role | Visibility scope |
|------|------------------|
| Representative | Own Prospects + unassigned pool (if policy allows) |
| Assistant | Assigned Representative's Prospects only |
| Division Leader | All Prospects in division |
| RVP | All Prospects in region |
| Administrator | Organization-wide |
| Read Only | Configurable scope (default: division or org read) |

Prospects outside scope are **not listable** and return 404 on direct ID access (no enumeration leak).

### Historical ownership

- Timeline retains all past assignments permanently
- Reports may attribute outcomes to **owner at time of event**
- Merged Prospects retain assignment history from both records

### Inactive users

- Prospects owned by inactive users **re-enter pool** or auto-reassign per org policy
- Emits `prospect_updated` + notification to Division Leader
- Inactive user cannot authenticate; historical `actor` references remain valid

### Archived users

- Same as inactive for ownership purposes
- Audit trail preserved; no new actions as that user

---

## Audit rules

The following **must** generate Business Events (see [BUSINESS_EVENTS.md](./BUSINESS_EVENTS.md)):

| Action | Event(s) |
|--------|----------|
| Every modification | `prospect_updated` |
| Every assignment | `prospect_updated` (assignment payload) |
| Every merge | `prospect_merged` |
| Every delete attempt | `prospect_archived` or `error_logged` / admin purge event |
| Every permission change | `permission_changed` *(system event — Sprint 14.0.1)* |
| Every export | `export_completed` |
| Every restore | `prospect_updated` (restore flag) |

Audit events are **append-only**. Permission denials log `error_logged` with `errorCode: PERMISSION_DENIED` (no sensitive payload).

---

## Security principles

1. **Least privilege** — default Representative scope, not org-wide
2. **Fail closed** — missing permission → deny
3. **No channel bypass** — permissions apply regardless of WhatsApp/Messenger/etc.
4. **Server-side enforcement** — UI hides actions; API always validates
5. **Bootstrap auth is not a role** — session bootstrap ≠ Administrator

Align with [Privacy_and_Data_Handling.md](../../07-security/Privacy_and_Data_Handling.md).

---

## External API (future)

| Concern | Design |
|---------|--------|
| Authentication | OAuth client credentials or scoped API keys |
| Authorization | Subset of permission matrix per client |
| Rate limits | Per client + org |
| Events | Same Business Event envelope; `actor: API:{clientId}` |
| Ownership | API cannot merge/delete unless explicitly granted |

Document integration contracts under `docs/04-api/` when implemented.

---

## Related Documents

- [PROSPECT_ENGINE.md](./PROSPECT_ENGINE.md)
- [PROSPECT_MODEL.md](./PROSPECT_MODEL.md)
- [BUSINESS_EVENTS.md](./BUSINESS_EVENTS.md)
- [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)
- [RFC-006-organization-model.md](../../10-rfcs/RFC-006-organization-model.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Prospect permissions and ownership model v1.0 (Sprint 14.0.1) |
| 2026-07-24 | All mutations and permission changes emit Business Events |
