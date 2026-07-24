# Atlas Knowledge Hub Vision

## AI Summary

The Knowledge Hub is Atlas's operational brain: a single in-app window into GitHub `/docs` for humans and AI. It avoids duplicated documentation, supports future semantic search and Atlas Copilot, and anchors daily work on `CURRENT_STATE.md`. GitHub remains authoritative; the hub reads live Markdown only.

## Purpose

Explain why the Knowledge Hub exists and how it fits Atlas product strategy.

## Status

Approved — Sprint 13.1

## Business Rules

The Hub surfaces rules; it does not replace [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md) as the behavior contract.

---

## Why Atlas Knowledge Hub exists

Atlas spans product, architecture, integrations, Meta compliance, and recruiting operations. Scattered docs and tribal knowledge slow engineering and AI-assisted development. The Knowledge Hub centralizes **read access** to the same Markdown engineers commit to GitHub.

## Single source of truth

- **Authoritative:** repository `/docs`
- **Not authoritative:** databases, wikis, copied Markdown in the app
- **Rule:** one file, one location; link instead of duplicate

## Humans + AI

Humans use the hub for sprint context, architecture, and runbooks. AI assistants use **AI Summary** sections and `/docs/12-ai/` to load context quickly. Both read the same files.

## No duplicated documentation

Phase 1 and Sprint 13 explicitly reject:

- Syncing docs to Supabase or CMS
- Maintaining parallel copies in frontend bundles
- Auto-generated duplicates without human review

## GitHub is authoritative

Changes flow: edit Markdown in Git → merge to `main` → deploy API with repo → Knowledge Hub reflects updates. Vercel/Railway deploys carry the `/docs` tree.

## Future semantic search

Sprint 13 improves keyword search (filename, title, folder, partial match) with a pluggable search module. Phase 2+ may add:

- Full-text indexing (still sourced from `/docs`)
- Embedding-based semantic search
- Optional Atlas Copilot query API

Architecture remains **read from filesystem first**; search indexes are derived, not primary.

## Future Atlas Copilot integration

Atlas Copilot will:

- Read Knowledge Hub routes and `/docs/12-ai/` guidelines
- Cite document paths in answers
- Propose doc updates via PR workflow (not in-app editing in Phase 1–2)

## Related Documents

- [../03-engineering/KNOWLEDGE_HUB.md](../03-engineering/KNOWLEDGE_HUB.md)
- [../12-ai/KNOWLEDGE_HUB_USAGE.md](../12-ai/KNOWLEDGE_HUB_USAGE.md)
- [../CURRENT_STATE.md](../CURRENT_STATE.md)
- [../03-engineering/DOCUMENTATION_STANDARD.md](../03-engineering/DOCUMENTATION_STANDARD.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Knowledge Hub Phase 1 — filesystem read-only |
| 2026-07-24 | Sprint 13 — operational dashboard + AI doc standards |
| TBD | Phase 2 semantic search — derived index, GitHub still authoritative |
