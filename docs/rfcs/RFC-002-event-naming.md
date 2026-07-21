# RFC-002 — Event Naming

**Status:** FROZEN  
**Version:** 1.0  
**Related:** [RFC-010](./RFC-010-event-bus-principles.md) · [EVENT_CATALOG.md](../EVENT_CATALOG.md)

---

## Purpose

Define **permanent naming conventions** for Atlas Event Bus events.

Consistent naming enables Mission Control subscriptions, package analytics, and cross-domain audit.

---

## Format

```
{domain}.{entity}.{action}
```

| Segment | Rule | Examples |
|---------|------|----------|
| `domain` | Lowercase, singular or compound | `gateway`, `agent`, `organization`, `package` |
| `entity` | Optional sub-resource | `message`, `tool`, `office` |
| `action` | Past tense verb or state | `received`, `created`, `completed`, `failed` |

---

## Registered Namespaces (Version 1)

| Namespace | Owner | Example |
|-----------|-------|---------|
| `gateway.*` | Communication Gateway | `gateway.message.received` |
| `agent.*` | Atlas Agent | `agent.decision.created` |
| `agent.tool.*` | Tool Executor | `agent.tool.executed` |
| `conversation.*` | Agent Runtime | `conversation.started` |
| `workflow.*` | Workflow Intelligence | `workflow.step.completed` |
| `package.*` | Packages | `package.interview.scheduled` |
| `organization.*` | Organization Console | `organization.created` |
| `brief.*` | Daily Brief | `brief.generated` |
| `mission.*` | Mission Control | `mission.updated` |
| `connector.*` | Connectors | `connector.connected` |
| `appointment.*` | Appointments | `appointment.scheduled` |
| `meeting.*` | Meetings | `meeting.ready` |
| `prospect.*` | Prospects | `prospect.created` |

---

## Rules

1. **Never reuse an event name** for a different semantic meaning.
2. **Payload is always an object** — never primitives at top level.
3. **Include `organizationId`** when the event is organization-scoped.
4. **Past tense for completed actions** — `created`, not `create`.
5. **New namespaces require RFC update** — do not invent ad-hoc strings in production code.

---

## Non-Goals

- Timeline event types for Core workflow engine (see EVENT_CATALOG.md — separate vocabulary)
- External webhook event names (platform-specific, adapter-internal)

---

## Reference

Event constant files in each domain (`*Events.js` modules).
