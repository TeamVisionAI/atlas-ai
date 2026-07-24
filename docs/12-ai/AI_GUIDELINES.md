# AI Guidelines

## AI Summary

AI assistants working on Atlas must treat `/docs` as authoritative, read `BUSINESS_RULES.md` before behavioral changes, cite BR-XXX in code, avoid duplicating documentation, and use the Knowledge Hub for operational context. Never invent business rules or move docs into a database.

## Purpose

Define mandatory behavior for AI coding assistants (Cursor, future Atlas Copilot) when modifying Atlas code or documentation.

## Status

Draft — Sprint 13.1

## Business Rules

- Read [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md) before architectural or behavioral decisions
- If a request conflicts with a rule, stop and name the conflict (e.g. "Conflicts with BR-008")
- Propose new BR-XXX entries instead of inventing ad-hoc behavior

## Technical Notes

- Reuse engines in `backend/core/` — do not duplicate business logic in routes
- Knowledge Hub is read-only; `/docs` on disk is the source of truth
- Reference sprint and release docs under `docs/09-releases/`

## API

<!-- Placeholder: future Atlas Copilot API contract -->

_TBD — Atlas Copilot integration Phase 2+_

## Database

No AI-specific database tables in Sprint 13. Client preferences (favorites, pinned) use browser `localStorage` only.

## Related Documents

- [DEVELOPMENT_CONTEXT.md](./DEVELOPMENT_CONTEXT.md)
- [KNOWLEDGE_HUB_USAGE.md](./KNOWLEDGE_HUB_USAGE.md)
- [../03-engineering/DEVELOPMENT_WORKFLOW.md](../03-engineering/DEVELOPMENT_WORKFLOW.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | AI docs live under `/docs/12-ai/`; GitHub remains authoritative |
