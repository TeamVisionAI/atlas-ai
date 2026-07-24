# Atlas Daily Development Workflow

## AI Summary

This is the official Atlas engineering operating procedure for every development session. Start in the Knowledge Hub with `CURRENT_STATE.md`, follow the Idea → Approval → Implementation → Documentation → Commit pipeline, and end with an Atlas Session Close that updates docs and produces Tomorrow Starting Context. Documentation is the source of truth—not AI memory.

## Purpose

This document defines the standard workflow for every Atlas development session.

The objective is to ensure that:

- documentation always stays current
- AI assistants remain synchronized
- engineering decisions are never lost
- every sprint is reproducible
- the Knowledge Hub remains the single source of truth

---

## Morning Session

At the beginning of every session:

1. Open Atlas Knowledge Hub.

2. Read:

   `CURRENT_STATE.md`

3. Read the current Sprint document.

4. Review:

   - Recent Decisions
   - Next Actions
   - Blockers

5. Confirm today's objective before writing code.

No implementation should begin before understanding the current project state.

---

## During Development

For every approved feature:

```
Idea
  ↓
Discussion
  ↓
Approval
  ↓
Implementation
  ↓
Verification
  ↓
Documentation
  ↓
Commit
```

Never skip documentation.

---

## End of Session

Before ending the day perform an **Atlas Session Close**.

The Session Close MUST include:

1. Summary of completed work.
2. Approved architectural decisions.
3. Documentation updates required.
4. `CURRENT_STATE.md` updates.
5. Sprint document updates.
6. Business Rule updates (if applicable).
7. Architecture updates (if applicable).
8. Generate Cursor prompt to update documentation.
9. Review technical debt.
10. Recommend Git commit message.
11. Produce Tomorrow Starting Context.

---

## Tomorrow Starting Context

Every session should end with a concise summary including:

- Current Sprint
- Current Objective
- Completed Today
- In Progress
- Next Task
- Known Issues

This becomes the starting point for the next session.

---

## Engineering Rules

- Atlas documentation is the source of truth.
- AI memory is never the source of truth.
- No undocumented architectural decisions.
- No undocumented business rules.
- No undocumented APIs.

**If it is not documented, it is not considered approved.**

---

## Knowledge Hub

Knowledge Hub is the official Atlas Brain.

Every important engineering decision must eventually appear there.

See [KNOWLEDGE_HUB.md](./KNOWLEDGE_HUB.md) and [CURRENT_STATE.md](../CURRENT_STATE.md).

---

## Workflow Diagram

```
Morning
  ↓
Knowledge Hub
  ↓
CURRENT_STATE.md
  ↓
Development
  ↓
Verification
  ↓
Documentation
  ↓
Commit
  ↓
Atlas Session Close
  ↓
Tomorrow Starting Context
```

---

## Document control

| Field | Value |
|-------|-------|
| **Status** | Approved |
| **Version** | 1.0 |
| **Owner** | Atlas Engineering |
| **Last Updated** | Automatically updated during Session Close |

## Related Documents

- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) — feature pipeline and Business Rules
- [ENVIRONMENT_CONFIGURATION.md](./ENVIRONMENT_CONFIGURATION.md) — local vs production setup
- [DOCUMENTATION_STANDARD.md](./DOCUMENTATION_STANDARD.md) — doc template
- [KNOWLEDGE_HUB.md](./KNOWLEDGE_HUB.md) — in-app documentation browser
