# Knowledge Hub Usage

## AI Summary

The Knowledge Hub at `/app/knowledge` reads live Markdown from `/docs`. Use it as the operational brain: start at the home dashboard (`CURRENT_STATE.md`), search by filename/title/folder, star favorites, and pin key docs locally. AI assistants should prefer linked docs over guessing repo state.

## Purpose

Guide humans and AI on using the Atlas Knowledge Hub effectively.

## Status

Approved — Sprint 13.1

## Business Rules

Knowledge Hub does not enforce business rules; it surfaces them. Always open [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md) for behavior contracts.

## Technical Notes

| Feature | Storage |
|---------|---------|
| Recently opened / viewed | `localStorage` (`atlas_knowledge_activity_v2`) |
| Pinned documents | `localStorage` |
| Favorites (star) | `localStorage` |
| Document content | Repository `/docs` via API |

### Routes

- Frontend: `/app/knowledge` (redirect from `/knowledge`)
- API: `GET /api/knowledge/tree`, `GET /api/knowledge/document?path=`

### Home dashboard

When no `?path=` query is set, the hub shows:

- Current Sprint, Overall Status, Current Objective (from `CURRENT_STATE.md`)
- Recently opened / viewed (client)
- Quick links (Architecture, Backlog, README, etc.)
- Full `CURRENT_STATE.md` content below

## API

See [KNOWLEDGE_HUB.md](../03-engineering/KNOWLEDGE_HUB.md).

## Database

None. Read-only filesystem access.

## Related Documents

- [../03-engineering/KNOWLEDGE_HUB.md](../03-engineering/KNOWLEDGE_HUB.md)
- [../01-product/KNOWLEDGE_HUB_VISION.md](../01-product/KNOWLEDGE_HUB_VISION.md)
- [../CURRENT_STATE.md](../CURRENT_STATE.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Phase 1 — filesystem source of truth |
| 2026-07-24 | Sprint 13.1 — dashboard home + client activity |
