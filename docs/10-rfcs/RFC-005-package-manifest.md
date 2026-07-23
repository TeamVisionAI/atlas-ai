# RFC-005 — Package Manifest

**Status:** FROZEN  
**Version:** 1.0  
**Related:** [RFC-004](./RFC-004-workflow-contract.md) · [RFC-006](./RFC-006-organization-model.md) · Release 1.1

---

## Purpose

Define the **permanent contract** for Atlas packages — installable industry workflow extensions.

Packages extend Atlas. They do not modify Core.

---

## Package Identity

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `packageId` | string | Yes | Unique identifier (e.g. `teamvision-recruiting`) |
| `name` | string | Yes | Display name |
| `version` | string | Yes | Semantic version |
| `workflows` | array | Yes | Workflow names registered by package |
| `dependencies` | array | No | Required org resources (`office`, `connectors`) |

---

## Registration Contract

A package MUST:

1. Register workflow contracts via Workflow Intelligence (RFC-004).
2. Subscribe to its own `package.*` events for analytics.
3. Accept configuration via Organization Console — never hardcode org values.
4. Emit package events for observable milestones.
5. Expose `register()` and `unregister()` lifecycle methods.

A package MUST NOT:

1. Modify Atlas Core source code.
2. Import Core business rule implementations for package-specific logic.
3. Store organization secrets in package code.
4. Assume a single organization — configuration is always injected.

---

## Configuration Isolation

Organization Console calls `buildPackageConfiguration(organizationId, packageId)` which returns an **opaque configuration blob**. Atlas Core and other packages cannot read package-internal configuration keys.

---

## Package Events (Team Vision Reference)

| Event | Milestone |
|-------|-----------|
| `package.candidate.qualified` | Qualification evaluated |
| `package.interview.scheduled` | Interview booked |
| `package.interview.completed` | Interview attended |
| `package.presentation.completed` | Presentation outcome recorded |
| `package.license.started` | Licensing begun |
| `package.license.completed` | Licensing finished |
| `package.orientation.completed` | Orientation finished |
| `package.faststart.completed` | Fast Start finished |
| `package.followup.started` | Follow-up sequence started |
| `package.followup.completed` | Follow-up sequence completed |

New packages define their own `package.{packageId}.*` events following RFC-002.

---

## Reference Implementation

`backend/packages/teamvision/` — Team Vision Recruiting Pack

**Verify:** `node backend/dev/verifyRelease1_1.js`
