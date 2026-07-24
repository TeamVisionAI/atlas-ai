# Conversation Patterns

## AI Summary

Templates for how Atlas agents (future Copilot) and engineering assistants should structure responses: confirm context, cite docs, surface BR conflicts, list files changed, and avoid speculative fixes. Patterns mirror Team Vision recruiting tone where user-facing.

## Purpose

Define repeatable conversation structures for AI-assisted Atlas development and future in-product Copilot.

## Status

Draft — Sprint 13.1

## Business Rules

User-facing copy must follow BR-011 – BR-014 (conversation style). Engineering responses should cite BR numbers when discussing behavior.

---

## Pattern: Read before implement

1. **Context** — Which docs were read (`CURRENT_STATE`, `BUSINESS_RULES`, sprint spec)
2. **Alignment** — Applicable BR-XXX or "recommend new rule"
3. **Plan** — Minimal diff approach
4. **Execute** — Code + doc updates
5. **Verify** — Tests/build; file list

## Pattern: Conflict surfacing

```
This request conflicts with {BR-XXX}: {one-line rule}.
Options: (a) change feature, (b) update rule with approval, (c) document exception.
Stopping until resolved.
```

## Pattern: Operational snapshot

When updating `CURRENT_STATE.md`:

- Update **Last Updated** date
- Keep **Overall Status** emoji accurate (🟢 / 🟡 / 🔴)
- Link new docs in **Recently Updated Documents**

## Related Documents

- [PROMPT_LIBRARY.md](./PROMPT_LIBRARY.md)
- [../06-business/BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Conversation patterns documented for AI consistency |
