# Atlas Core v1.0

## AI Summary

Atlas Core v1.0 is the executive architecture overview for Team Vision's business operating platform. Atlas centers on one business object—the **Prospect**—with everything else supporting the Prospect lifecycle. Read this document first, then follow the Reading Order to detailed specs. Platform-independent, event-driven, documentation-first, rules-governed.

---

## Purpose

**Atlas is a business operating platform for Team Vision.**

It helps recruiting and sales teams manage people from first contact through qualification, interviews, and conversion to **Client** or **Recruit** — and beyond into ongoing relationship management.

Atlas is centered around **one business object: the Prospect**.

Everything else in the platform exists to help manage the **Prospect lifecycle**:

- Capture and identity
- Conversation across any channel
- Qualification and scheduling
- Outcomes and reporting
- AI assistance and automation

This document is the **first read** for every engineer and AI assistant before working on Atlas. It does not replace detailed architecture documents — it orients you and points to them.

---

## Core Principles

These principles guide every future architectural and product decision:

| Principle | Meaning |
|-----------|---------|
| **One Prospect = One Truth** | Single canonical record per person; no duplicate business objects per channel |
| **Atlas is platform independent** | Must not depend on WhatsApp, Facebook, Instagram, Email, SMS, or any single channel |
| **Communication channels are connectors** | Connectors translate; the Prospect Engine persists |
| **Business Events are the language of Atlas** | One meaningful action → one standardized event |
| **Timeline is the historical source of truth** | Append-only Prospect history; channels are not the system of record |
| **Documentation is the project source of truth** | GitHub `/docs` is authoritative; Knowledge Hub reads it live |
| **AI assists business processes but does not replace business rules** | AI recommends; [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md) govern behavior |
| **Architecture first, implementation second** | Design and document before code; cite BR-XXX and sprint specs |

---

## Atlas Core Components

### Prospect Engine

| | |
|--|--|
| **Purpose** | Core domain object and lifecycle owner for every Prospect |
| **Responsibilities** | Identity, status, assignment, merge, correlation across channels |
| **Does NOT own** | Message transport, provider credentials, raw webhook payloads |
| **Documentation** | [prospect-engine/PROSPECT_ENGINE.md](./prospect-engine/PROSPECT_ENGINE.md) · [PROSPECT_MODEL.md](./prospect-engine/PROSPECT_MODEL.md) · [PROSPECT_LIFECYCLE.md](./prospect-engine/PROSPECT_LIFECYCLE.md) |

### Business Events

| | |
|--|--|
| **Purpose** | Official language of Atlas — standardized facts from every action |
| **Responsibilities** | Event schema, categories, producer/consumer contracts |
| **Does NOT own** | UI rendering, connector HTTP calls |
| **Documentation** | [prospect-engine/BUSINESS_EVENTS.md](./prospect-engine/BUSINESS_EVENTS.md) · [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md) |

### Timeline

| | |
|--|--|
| **Purpose** | Chronological, append-only history per Prospect |
| **Responsibilities** | Store and query ordered Business Events for a Prospect |
| **Does NOT own** | Channel-native thread views (those are connector concerns) |
| **Documentation** | [prospect-engine/PROSPECT_TIMELINE.md](./prospect-engine/PROSPECT_TIMELINE.md) |

### Lifecycle

| | |
|--|--|
| **Purpose** | Explicit state machine (New Lead → … → Client / Recruit / Lost) |
| **Responsibilities** | Allowed transitions, automatic vs manual moves, BR alignment |
| **Does NOT own** | Conversation wording (Conversation Engine) |
| **Documentation** | [prospect-engine/PROSPECT_LIFECYCLE.md](./prospect-engine/PROSPECT_LIFECYCLE.md) · [MILESTONE_DEFINITIONS.md](../06-business/MILESTONE_DEFINITIONS.md) |

### Permissions

| | |
|--|--|
| **Purpose** | Roles, ownership, visibility, and audit for Prospect data |
| **Responsibilities** | Who can create, edit, assign, merge, archive, export |
| **Does NOT own** | Bootstrap session tokens (auth layer) |
| **Documentation** | [prospect-engine/PROSPECT_PERMISSIONS.md](./prospect-engine/PROSPECT_PERMISSIONS.md) |

### Communication Connectors

| | |
|--|--|
| **Purpose** | Adapters between external platforms and Atlas standard events |
| **Responsibilities** | Normalize inbound/outbound; emit Business Events |
| **Does NOT own** | Prospect lifecycle decisions or timeline storage logic |
| **Documentation** | [prospect-engine/COMMUNICATION_CONNECTORS.md](./prospect-engine/COMMUNICATION_CONNECTORS.md) · [RFC-007](../10-rfcs/RFC-007-connector-contract.md) · [Communication_Hub.md](../02-architecture/Communication_Hub.md) |

### Knowledge Hub

| | |
|--|--|
| **Purpose** | In-app operational brain — live read of repository `/docs` |
| **Responsibilities** | Document tree, search, CURRENT_STATE dashboard, quick links |
| **Does NOT own** | Documentation content (GitHub `/docs` is authoritative) |
| **Documentation** | [KNOWLEDGE_HUB.md](../03-engineering/KNOWLEDGE_HUB.md) · [KNOWLEDGE_HUB_VISION.md](../01-product/KNOWLEDGE_HUB_VISION.md) |

### Mission Control

| | |
|--|--|
| **Purpose** | Operator workspace for queues, workflow advancement, and daily execution |
| **Responsibilities** | Present work items; invoke workflow engine; surface Prospect context |
| **Does NOT own** | Prospect truth or timeline storage |
| **Documentation** | [WORKFLOW_ENGINE_SPEC.md](../02-architecture/WORKFLOW_ENGINE_SPEC.md) · [ATLAS_CORE_ARCHITECTURE.md](../02-architecture/ATLAS_CORE_ARCHITECTURE.md) |

### Executive Dashboard

| | |
|--|--|
| **Purpose** | Leadership view of interviews, team activity, and outcomes |
| **Responsibilities** | Aggregates and KPIs from events and appointments |
| **Does NOT own** | Raw timeline or message content |
| **Documentation** | [00-executive/Current_System_State.md](../00-executive/Current_System_State.md) |

### AI Services

| | |
|--|--|
| **Purpose** | Recommendations, summaries, qualification hints, risk/opportunity flags |
| **Responsibilities** | Generate AI Business Events; update AI Insights on Prospect |
| **Does NOT own** | Lifecycle transitions without rule approval; business rule decisions |
| **Documentation** | [12-ai/AI_GUIDELINES.md](../12-ai/AI_GUIDELINES.md) · [ATLAS_AGENT_ARCHITECTURE.md](../02-architecture/ATLAS_AGENT_ARCHITECTURE.md) |

---

## Layered Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  PRESENTATION LAYER                                         │
│  Executive Dashboard · Mission Control · Prospect Center    │
│  Quick Capture · Knowledge Hub · Public Website             │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  APPLICATION LAYER                                          │
│  Prospect Engine · Business Rules Engine · Scheduling       │
│  Conversation Engine · Workflow Engine · AI Services        │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  INTEGRATION LAYER                                          │
│  Communication Connectors · Calendar · Email                │
│  WhatsApp · Messenger · API · CSV Import · Manual Entry     │
└─────────────────────────────┬───────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE LAYER                                       │
│  Authentication · Database (Supabase) · Knowledge Hub (/docs)│
│  Logging · Configuration · Deployment (Vercel / Railway)    │
└─────────────────────────────────────────────────────────────┘
```

**Flow:** Presentation calls Application services. Application emits/consumes Business Events. Integration layer never bypasses the Prospect Engine. Infrastructure supports all layers without owning business logic.

Detailed workflow architecture: [ATLAS_CORE_ARCHITECTURE.md](../02-architecture/ATLAS_CORE_ARCHITECTURE.md).

---

## Business Flow

Standard Team Vision journey — every step creates **Business Events** and **Timeline** entries:

```
Lead Generated
      ↓
Prospect Created          ← prospect_created
      ↓
Conversation              ← message_received / message_sent
      ↓
Qualification             ← lifecycle → Qualified
      ↓
Appointment               ← appointment_created
      ↓
Interview                 ← interview_completed
      ↓
    ┌─────────┴─────────┐
    ↓                   ↓
 Client              Recruit          ← policy_issued / recruit_joined
    ↓                   ↓
Ongoing Relationship    ← continued events, follow-ups, service
```

Alternate paths (Follow-Up, Lost) are documented in [PROSPECT_LIFECYCLE.md](./prospect-engine/PROSPECT_LIFECYCLE.md).

---

## Engineering Workflow

Do not start coding without context. Follow existing procedures:

| Topic | Document |
|-------|----------|
| Daily session | [DAILY_WORKFLOW.md](../03-engineering/DAILY_WORKFLOW.md) |
| Feature pipeline | [DEVELOPMENT_WORKFLOW.md](../03-engineering/DEVELOPMENT_WORKFLOW.md) |
| Session close | End-of-day checklist in DAILY_WORKFLOW.md |
| Live snapshot | [CURRENT_STATE.md](../CURRENT_STATE.md) |
| Sprint scope | [09-releases/sprints/](../09-releases/sprints/README.md) |
| Browse all docs | Knowledge Hub at `/app/knowledge` · [KNOWLEDGE_HUB.md](../03-engineering/KNOWLEDGE_HUB.md) |

---

## AI Philosophy

| AI does | AI does not |
|---------|-------------|
| **Recommend** next actions | Override Business Rules |
| **Summarize** Prospect context | Invent undocumented behavior |
| **Analyze** patterns and risk | Silently change lifecycle state |
| **Automate** repetitive, rule-approved work | Replace human judgment on outcomes |

**Business rules always have priority.** When AI output conflicts with BR-XXX, the rule wins. See [12-ai/AI_GUIDELINES.md](../12-ai/AI_GUIDELINES.md).

---

## Future Expansion

Atlas Core v1.0 is designed for growth. The Prospect + Events + Timeline model supports future modules **without redesigning the core**:

| Possible future module | Relationship to core |
|------------------------|---------------------|
| Training | Events + timeline on Prospect/Recruit |
| Licensing | Recruiting events extension |
| Client Service | Post-Client lifecycle + timeline |
| Policy Management | Sales events extension |
| Recognition | Reporting on events |
| Commissions | Derived from outcome events |
| Analytics | Event stream aggregation |
| Marketing | Campaign events + connectors |
| Voice AI | New connector + AI events |
| Mobile App | Presentation layer |
| API Marketplace | Integration layer |

These modules are **not designed in v1.0** — only acknowledged as architecturally compatible.

---

## Reading Order

Recommended path for new developers and AI assistants:

1. **[ATLAS_CORE_v1.md](./ATLAS_CORE_v1.md)** ← you are here
2. **[CURRENT_STATE.md](../CURRENT_STATE.md)** — what is happening now
3. **[DAILY_WORKFLOW.md](../03-engineering/DAILY_WORKFLOW.md)** — how to work each session
4. **Prospect Engine documents** — [prospect-engine/](./prospect-engine/PROSPECT_ENGINE.md) (engine → model → lifecycle → events → permissions → connectors → timeline)
5. **[Sprint History](../09-releases/sprints/README.md)** — recent delivery context
6. **[ENGINEERING_STANDARDS.md](../03-engineering/ENGINEERING_STANDARDS.md)** — quality and performance targets

Also essential when changing behavior: **[BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md)**.

---

## Version

| Field | Value |
|-------|-------|
| **Atlas Core** | Version 1.0 |
| **Status** | Approved |
| **Owner** | Atlas Engineering |
| **Last Updated** | 2026-07-24 |
| **Sprint** | 14.0.2 |

## Related Documents

- [04-architecture/README.md](./README.md)
- [02-architecture/ATLAS_CORE_ARCHITECTURE.md](../02-architecture/ATLAS_CORE_ARCHITECTURE.md) — workflow engine detail
- [SPRINT_14_0_2_ATLAS_CORE_v1.md](../09-releases/sprints/SPRINT_14_0_2_ATLAS_CORE_v1.md)
