# Communication Hub

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0010 |
| **Title** | Communication Hub Architecture |
| **Version** | 0.1 |
| **Status** | Draft |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-21 |
| **Related Sprint** | 11.4 |
| **Related Release** | Sprint 11.4 Phase A |

---

## Related documents

- [Current_System_State.md](../00-executive/Current_System_State.md)
- [Sprint-11.4.md](../05-sprints/Sprint-11.4.md)
- [Sprint-11.4-Implementation-Plan.md](../05-sprints/Sprint-11.4-Implementation-Plan.md)
- [README.md](./README.md)
- [../architecture/atlas-communication-platform.md](../architecture/atlas-communication-platform.md) — platform vision & Communication Gateway (DOC-0020)
- [../04-meta/Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md)

---

## Purpose

Define the **Communication Hub** — the unified transport layer for inbound and outbound agency communication across channels. Platform vision and gateway responsibilities: [Atlas Communication Platform](../architecture/atlas-communication-platform.md) (DOC-0020).

> **Note:** Phase A implements the transport layer and WhatsApp routing. Full multi-channel adapter interface is Phase B.

---

## Goals

1. Single conversation thread per prospect across supported channels
2. Policy-aware routing (business rules, opt-in, Meta templates)
3. Auditable message log linked to workflow events
4. Extensibility for future channels without rewriting core engines

---

## Current state (Sprint 11.4 Phase A)

| Capability | Status |
|------------|--------|
| WhatsApp webhook ingest | Implemented |
| Outbound WhatsApp send | Implemented |
| Communication Hub (transport) | **Implemented — Phase A** |
| Conversation Engine (live WhatsApp) | **Implemented — Phase A** |
| Unified conversation UI | Partial (Prospect Workspace) |
| Multi-channel adapters (email, SMS, etc.) | Planned — Phase B+ |

---

## Target architecture (Sprint 11.4+)

```mermaid
flowchart LR
  subgraph channels [Channels]
    WA[WhatsApp Business]
    Email[Email - future]
    SMS[SMS - future]
  end

  subgraph hub [Communication Hub]
    CE[Conversation Engine]
    BR[Business Rules Engine]
    EV[Event Engine]
  end

  subgraph app [Atlas App]
    PW[Prospect Workspace]
    MC[Mission Control]
  end

  WA --> CE
  Email -.-> CE
  SMS -.-> CE
  CE --> BR
  CE --> EV
  CE --> PW
  CE --> MC
```

---

## Out of scope (this document)

- Meta submission copy → [../04-meta/Meta_Approval_Portfolio.md](../04-meta/Meta_Approval_Portfolio.md)
- Sprint task breakdown → [Sprint-11.4.md](../05-sprints/Sprint-11.4.md)
