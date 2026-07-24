# Sprint 16 — Production Recruiting Automation

## AI Summary

Phase 2 begins after Atlas RC1 certification. Sprint 16 delivers the first fully automated recruiting workflow from Facebook lead capture through WhatsApp conversation to interview scheduling — without human intervention.

## Document control

| Field | Value |
|-------|-------|
| **Sprint** | 16 — Production Recruiting Automation |
| **Phase** | 2 — Team Vision Operations |
| **Start date** | 2026-07-24 |
| **Status** | Active |

---

## Objective

Build the first fully automated recruiting workflow:

```
Facebook Lead
→ Atlas
→ WhatsApp Conversation
→ Qualification
→ Interview Scheduling
→ Mission Control
→ Executive Dashboard
```

**Goal:** First interview scheduled without human intervention.

---

## Scope

| Area | Deliverable |
|------|-------------|
| Lead intake | Facebook Lead Ads connector → Prospect Engine |
| Conversation | WhatsApp Cloud API automated qualification flow |
| Scheduling | Interview booking via Business Events + Timeline |
| Operations | Mission Control queue updates from automation |
| Leadership | Executive Dashboard funnel metrics from live events |

---

## Success criteria

| Criterion | Target |
|-----------|--------|
| End-to-end automation | Facebook lead → scheduled interview with zero manual steps |
| Business Events | All workflow steps emit canonical events |
| Projections | Timeline, Mission Control, Executive Dashboard rebuild from replay |
| Certification | RC1 baseline remains green after automation changes |

---

## Dependencies

- Atlas RC1 certified (`atlas-rc1` tag)
- WhatsApp Cloud API production credentials
- Meta Lead Ads webhook configured
- Default Atlas users (Ana + Niovel) seeded

---

## Related documents

- [RC1 Certification](../10-release-candidate/RC1_CERTIFICATION.md)
- [CURRENT_STATE.md](../CURRENT_STATE.md)
- [BACKLOG.md](../01-product/BACKLOG.md)
