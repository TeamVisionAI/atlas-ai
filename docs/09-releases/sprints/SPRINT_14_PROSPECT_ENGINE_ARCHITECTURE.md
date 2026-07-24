# Sprint 14.0 — Prospect Engine Architecture

## AI Summary

Sprint 14.0 defines the Prospect Engine as Atlas's platform-independent core business object. Sprint 14.0.1 adds Business Events and Permissions. Documentation-only sprints — no code implementation. Atlas must not depend on any single communication channel.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 14.0 (+ 14.0.1) |
| **Status** | Complete (architecture) |
| **Date** | 2026-07-24 |
| **Owner** | Atlas Engineering |

---

## Objective

Design the **Prospect Engine** that will become the core business object of Atlas — independent of any communication platform.

---

## Delivered (documentation)

| Document | Path |
|----------|------|
| Prospect Engine overview | [04-architecture/prospect-engine/PROSPECT_ENGINE.md](../../04-architecture/prospect-engine/PROSPECT_ENGINE.md) |
| Prospect model | [04-architecture/prospect-engine/PROSPECT_MODEL.md](../../04-architecture/prospect-engine/PROSPECT_MODEL.md) |
| Prospect lifecycle | [04-architecture/prospect-engine/PROSPECT_LIFECYCLE.md](../../04-architecture/prospect-engine/PROSPECT_LIFECYCLE.md) |
| Communication connectors | [04-architecture/prospect-engine/COMMUNICATION_CONNECTORS.md](../../04-architecture/prospect-engine/COMMUNICATION_CONNECTORS.md) |
| Prospect timeline | [04-architecture/prospect-engine/PROSPECT_TIMELINE.md](../../04-architecture/prospect-engine/PROSPECT_TIMELINE.md) |
| Section index | [04-architecture/README.md](../../04-architecture/README.md) |

### Sprint 14.0.1 (complete)

| Document | Path |
|----------|------|
| Business Events | [04-architecture/prospect-engine/BUSINESS_EVENTS.md](../../04-architecture/prospect-engine/BUSINESS_EVENTS.md) |
| Prospect Permissions | [04-architecture/prospect-engine/PROSPECT_PERMISSIONS.md](../../04-architecture/prospect-engine/PROSPECT_PERMISSIONS.md) |
| Sprint record | [SPRINT_14_0_1_BUSINESS_EVENTS_PERMISSIONS.md](./SPRINT_14_0_1_BUSINESS_EVENTS_PERMISSIONS.md) |

---

## Key decisions

1. **One Prospect = One Truth** — single canonical record per person
2. **Platform independence** — connectors translate; engine never calls third-party APIs
3. **Timeline is append-only** — single historical record per Prospect
4. **Lifecycle is rule-governed** — transitions align with BUSINESS_RULES.md
5. **AI recommends; rules approve** — no silent lifecycle changes from AI

---

## Out of scope (Sprint 14.0)

- Database migrations
- API routes
- UI changes
- Connector implementation
- Prospect Engine code in `backend/core/`

---

## Next sprint candidates

- Prospect Engine implementation plan
- Event bus integration with timeline
- Connector refactor (WhatsApp/Messenger → standard events)
- Prospect merge / deduplication rules

---

## Verification

Architecture review only — no build or test requirements for Sprint 14.0.

---

## Related Documents

- [CURRENT_STATE.md](../../CURRENT_STATE.md)
- [PROSPECT_ENGINE.md](../../04-architecture/prospect-engine/PROSPECT_ENGINE.md)
