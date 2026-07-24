# Documentation Standard

## AI Summary

Every Atlas documentation page should start with an **AI Summary** paragraph, then follow a fixed section order: Purpose, Status, Business Rules, Technical Notes, API, Database, Related Documents, Decision History, and optional Migration Notes. This structure optimizes human readability and AI assistant context loading via the Knowledge Hub.

## Purpose

Define the canonical template for Atlas Markdown documentation under `/docs`.

## Status

Approved — Sprint 13.1

## Business Rules

Documentation that describes product behavior must reference applicable **BR-XXX** entries or explicitly recommend new rules. Narrative docs must not contradict [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md).

## Technical Notes

### Required section order

1. **Title** (`#`)
2. **AI Summary** — one concise paragraph: purpose, current state, most important rules
3. **Purpose**
4. **Status** — Draft | Approved | Deprecated
5. **Business Rules** — linked BR-XXX or "None"
6. **Technical Notes**
7. **API** — endpoints or "N/A"
8. **Database** — tables/migrations or "None"
9. **Related Documents** — links to canonical docs
10. **Decision History** — dated decisions
11. **Migration Notes** *(optional)*

### Document control block

Executive and specification documents may include a document control table after the title (see [KNOWLEDGE_HUB.md](./KNOWLEDGE_HUB.md)).

### Operational snapshot

[../CURRENT_STATE.md](../CURRENT_STATE.md) uses a dedicated template (Current Sprint, Overall Status, etc.) and is maintained manually after each sprint.

### Knowledge Hub

Documents in `/docs` are rendered live in the Knowledge Hub. Do not duplicate content into the app or a database.

## API

N/A — documentation standard only.

## Database

None.

## Related Documents

- [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md)
- [KNOWLEDGE_HUB.md](./KNOWLEDGE_HUB.md)
- [../12-ai/AI_GUIDELINES.md](../12-ai/AI_GUIDELINES.md)
- [../01-product/KNOWLEDGE_HUB_VISION.md](../01-product/KNOWLEDGE_HUB_VISION.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | AI Summary required on all new and updated major docs |
| 2026-07-24 | Standard section order adopted for Sprint 13 |

## Migration Notes

Existing docs should gain an **AI Summary** section when next edited for substance—not in bulk rewrites without review.
