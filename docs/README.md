# Atlas Documentation Hub

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0999 |
| **Title** | Atlas Documentation Index |
| **Version** | 2.0 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-23 |
| **Related Release** | Documentation Foundation v1.0 |

> **Atlas Documentation Foundation v1.0** — single canonical structure consolidated from `main` and `sprint-7-engine-integration`.

---

## Quick start by audience

| Audience | Start here |
|----------|------------|
| **Executive / stakeholder** | [00-executive/Current_System_State.md](./00-executive/Current_System_State.md) |
| **Product owner** | [01-product/](./01-product/README.md) · [Product_Vision.md](./01-product/Product_Vision.md) |
| **Meta reviewer** | [11-meta-tech-provider/](./11-meta-tech-provider/README.md) · [05-integrations/meta/Meta_Approval_Portfolio.md](./05-integrations/meta/Meta_Approval_Portfolio.md) |
| **Engineer (new)** | [03-engineering/DEVELOPMENT_WORKFLOW.md](./03-engineering/DEVELOPMENT_WORKFLOW.md) · [08-operations/local-development.md](./08-operations/local-development.md) |
| **Engineer (architecture)** | [02-architecture/ATLAS_CORE_ARCHITECTURE.md](./02-architecture/ATLAS_CORE_ARCHITECTURE.md) · [06-business/BUSINESS_RULES.md](./06-business/BUSINESS_RULES.md) |
| **Operations / deploy** | [08-operations/deployment/](./08-operations/deployment/) |

---

## Section indexes

| Folder | Index |
|--------|-------|
| [00-executive/](./00-executive/README.md) | Strategy & production state |
| [01-product/](./01-product/README.md) | Vision, backlog, archives |
| [02-architecture/](./02-architecture/README.md) | System architecture |
| [03-engineering/](./03-engineering/README.md) | Dev workflow & frontend audits |
| [04-api/](./04-api/README.md) | API specifications |
| [05-integrations/](./05-integrations/README.md) | Meta & WhatsApp |
| [06-business/](./06-business/README.md) | Business rules & domain model |
| [07-security/](./07-security/README.md) | Privacy & compliance |
| [08-operations/](./08-operations/README.md) | Deployment & troubleshooting |
| [09-releases/](./09-releases/README.md) | Changelog & sprints |
| [10-rfcs/](./10-rfcs/README.md) | Version 1 RFCs |
| [11-meta-tech-provider/](./11-meta-tech-provider/README.md) | Meta Tech Provider approval portfolio |
| [Health Report](./DOCUMENTATION_HEALTH_REPORT.md) | Documentation audit results |

---

## Documentation map

```
docs/
├── README.md                         ← You are here (DOC-0999)
├── 00-executive/                     Strategy & production state
├── 01-product/                       Vision, backlog, archived journeys
├── 02-architecture/                  System & platform architecture
├── 03-engineering/                   Dev workflow, standards, frontend audits
├── 04-api/                           HTTP API specifications
├── 05-integrations/                  Meta, WhatsApp, third-party APIs
├── 06-business/                      Business rules, milestones, events, glossary
├── 07-security/                      Privacy, compliance, Meta Q&A
├── 08-operations/                    Deployment, troubleshooting, investigations
├── 09-releases/                      Changelog, sprint specs, release history
├── 10-rfcs/                          Version 1 permanent contracts
├── 11-meta-tech-provider/            Meta Tech Provider approval portfolio
└── [legacy stubs]                    Root-level redirects (BUSINESS_RULES.md, etc.)
```

---

## Documentation index

### 00-executive

| ID | Document | Status |
|----|----------|--------|
| DOC-0001 | [Current_System_State.md](./00-executive/Current_System_State.md) | Approved |
| DOC-0005 | [Roadmap.md](./00-executive/Roadmap.md) | Approved |

### 01-product

| ID | Document | Status |
|----|----------|--------|
| DOC-0006 | [Product_Vision.md](./01-product/Product_Vision.md) | Approved |
| — | [WHY_ATLAS_EXISTS.md](./01-product/WHY_ATLAS_EXISTS.md) | FROZEN (V1) |
| — | [BACKLOG.md](./01-product/BACKLOG.md) | Active |

### 02-architecture

| ID | Document | Status |
|----|----------|--------|
| — | [ATLAS_CORE_ARCHITECTURE.md](./02-architecture/ATLAS_CORE_ARCHITECTURE.md) | Active |
| — | [ATLAS_PLATFORM_V1.md](./02-architecture/ATLAS_PLATFORM_V1.md) | FROZEN (V1) |
| — | [ATLAS_AGENT_ARCHITECTURE.md](./02-architecture/ATLAS_AGENT_ARCHITECTURE.md) | FROZEN (V1) |
| — | [ARCHITECTURE_DECISIONS.md](./02-architecture/ARCHITECTURE_DECISIONS.md) | FROZEN (V1) |
| DOC-0010 | [Communication_Hub.md](./02-architecture/Communication_Hub.md) | Draft |
| DOC-0020 | [atlas-communication-platform.md](./02-architecture/atlas-communication-platform.md) | Approved |
| — | [WORKFLOW_ENGINE_SPEC.md](./02-architecture/WORKFLOW_ENGINE_SPEC.md) | Spec |
| — | [WORKFLOW_SEQUENCE_DIAGRAMS.md](./02-architecture/WORKFLOW_SEQUENCE_DIAGRAMS.md) | Spec |

### 03-engineering

| Document | Purpose |
|----------|---------|
| [DEVELOPMENT_WORKFLOW.md](./03-engineering/DEVELOPMENT_WORKFLOW.md) | How Atlas evolves |
| [ENGINEERING_STANDARDS.md](./03-engineering/ENGINEERING_STANDARDS.md) | Quality targets |
| [frontend/](./03-engineering/frontend/) | Frontend audits (Design Week) |

### 04-api

| Document | Scope |
|----------|-------|
| [mission-control-workflow-advance.md](./04-api/mission-control-workflow-advance.md) | Human advancement API |
| [workflow-simulator-dev-api.md](./04-api/workflow-simulator-dev-api.md) | Dev simulator endpoints |

### 05-integrations

| ID | Document | Status |
|----|----------|--------|
| DOC-0400 | [meta/README.md](./05-integrations/meta/README.md) | Approved |
| DOC-0002 | [meta/Meta_Approval_Portfolio.md](./05-integrations/meta/Meta_Approval_Portfolio.md) | Approved |
| — | [WHATSAPP_EMBEDDED_SIGNUP.md](./05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md) | Active |

### 06-business

| Document | Purpose |
|----------|---------|
| [BUSINESS_RULES.md](./06-business/BUSINESS_RULES.md) | BR-001+ behavior contract |
| [MILESTONE_DEFINITIONS.md](./06-business/MILESTONE_DEFINITIONS.md) | Workflow milestones |
| [EVENT_CATALOG.md](./06-business/EVENT_CATALOG.md) | Timeline events |
| [ATLAS_GLOSSARY.md](./06-business/ATLAS_GLOSSARY.md) | Terminology |

### 07-security

| ID | Document | Status |
|----|----------|--------|
| DOC-0003 | [Privacy_and_Data_Handling.md](./07-security/Privacy_and_Data_Handling.md) | Draft |
| DOC-0004 | [Meta_Review_QA.md](./07-security/Meta_Review_QA.md) | Draft |

### 08-operations

| ID | Document | Purpose |
|----|----------|---------|
| — | [local-development.md](./08-operations/local-development.md) | Dev troubleshooting |
| DOC-0513 | [sprint-11.4-whatsapp-investigation.md](./08-operations/sprint-11.4-whatsapp-investigation.md) | Strategic pivot |
| DOC-0701 | [deployment/sprint-11.4-meta-production.md](./08-operations/deployment/sprint-11.4-meta-production.md) | Meta production ops |
| DOC-0702 | [deployment/archive/whatsapp-cloud-api-migration-checklist.md](./08-operations/deployment/archive/whatsapp-cloud-api-migration-checklist.md) | Deferred |

### 09-releases

| ID | Document | Purpose |
|----|----------|---------|
| DOC-0600 | [CHANGELOG.md](./09-releases/CHANGELOG.md) | Release log |
| — | [RELEASE_HISTORY.md](./09-releases/RELEASE_HISTORY.md) | V1 release history |
| DOC-0511 | [sprints/Sprint-11.4.md](./09-releases/sprints/Sprint-11.4.md) | Sprint spec |
| — | [sprints/](./09-releases/sprints/) | All sprint specifications |

### 10-rfcs

| Document | Scope |
|----------|-------|
| [RFC-001](./10-rfcs/RFC-001-message-envelope.md) – [RFC-010](./10-rfcs/RFC-010-event-bus-principles.md) | V1 permanent contracts (FROZEN) |

### 11-meta-tech-provider

| ID | Document | Status |
|----|----------|--------|
| MTP-001 | [01_Executive_Summary.md](./11-meta-tech-provider/01_Executive_Summary.md) | Draft for Meta Tech Provider Review |
| MTP-002 | [02_Platform_Overview.md](./11-meta-tech-provider/02_Platform_Overview.md) | Draft for Meta Tech Provider Review |
| MTP-003 | [03_System_Architecture.md](./11-meta-tech-provider/03_System_Architecture.md) | Draft for Meta Tech Provider Review |
| MTP-004 | [04_WhatsApp_Business_Integration.md](./11-meta-tech-provider/04_WhatsApp_Business_Integration.md) | Draft for Meta Tech Provider Review |
| MTP-005 | [05_Data_Flow.md](./11-meta-tech-provider/05_Data_Flow.md) | Draft for Meta Tech Provider Review |
| MTP-006 | [06_Security_and_Privacy.md](./11-meta-tech-provider/06_Security_and_Privacy.md) | Draft for Meta Tech Provider Review |
| MTP-007 | [07_User_Journey.md](./11-meta-tech-provider/07_User_Journey.md) | Draft for Meta Tech Provider Review |
| MTP-008 | [08_Permissions_Justification.md](./11-meta-tech-provider/08_Permissions_Justification.md) | Draft for Meta Tech Provider Review |
| MTP-009 | [09_Demo_Script.md](./11-meta-tech-provider/09_Demo_Script.md) | Draft for Meta Tech Provider Review |
| MTP-010 | [10_Reviewer_FAQ.md](./11-meta-tech-provider/10_Reviewer_FAQ.md) | Draft for Meta Tech Provider Review |

---

## Duplicate report

Documents that existed in two forms were merged or deduplicated:

| Duplicate pair | Resolution |
|----------------|------------|
| `docs/00-executive/Roadmap.md` + `docs/00-executive/Roadmap.md` | **Merged** → [00-executive/Roadmap.md](./00-executive/Roadmap.md) (production + V1 tracks) |
| `docs/00-executive/Product_Vision.md` + `docs/vision/WHY_ATLAS_EXISTS.md` | **Merged** → [01-product/Product_Vision.md](./01-product/Product_Vision.md) + kept WHY_ATLAS as long form |
| `docs/05-integrations/meta/` + scattered Meta refs | **Split** → portfolio in `05-integrations/meta/`; privacy/QA in `07-security/` |
| `docs/06-releases/` + `docs/releases/` | **Unified** → `09-releases/` |
| `docs/rfcs/` + `docs/decisions/` | **Unified** → `10-rfcs/` + `02-architecture/ARCHITECTURE_DECISIONS.md` |
| Root `docs/SPRINT_*` + `docs/05-sprints/` | **Unified** → `09-releases/sprints/` |
| `docs/architecture/` + `docs/02-architecture/` | **Unified** → `02-architecture/` |
| `08-operations/deployment/` + `docs/troubleshooting/` | **Unified** → `08-operations/` |

Legacy root paths (`docs/BUSINESS_RULES.md`, etc.) remain as **redirect stubs** for bookmarks and Cursor rules.

---

## Missing documentation report

| Area | Status | Notes |
|------|--------|-------|
| OpenAPI / full route catalog | ❌ Missing | Only sprint/API specs in `04-api/` |
| Dedicated authentication doc | ❌ Missing | Auth described in Journey archive only |
| Railway / Vercel runbooks (generic) | 🟡 Partial | Meta-specific deployment in `08-operations/deployment/` |
| Centralized env encyclopedia | 🟡 Partial | `.env.example` + scattered tables |
| Disaster recovery | ❌ Missing | Not documented |
| Unified PRD | ❌ Missing | Sprint specs serve as partial PRDs |
| Business model doc | ❌ Missing | Never existed |
| `Product_Vision.md` (pre-merge name) | ✅ Created | Merged from Vision + WHY_ATLAS executive summary |

---

## Archive policy

| Location | Contents |
|----------|----------|
| [01-product/archive/v1-platform/customer-journeys/](./01-product/archive/v1-platform/customer-journeys/) | JOURNEY_1–7 (sprint-7 code reference) |
| [09-releases/archive/v1-platform/](./09-releases/archive/v1-platform/) | RELEASE_1_1–1_4 (V1 platform branch) |
| [08-operations/deployment/archive/](./08-operations/deployment/archive/) | Deferred WhatsApp migration checklist |

---

## Contributing

1. Place new documents in the numbered folder above.
2. Add document control header (ID, status, last updated).
3. Link from this README or the section README.
4. Update [Current_System_State.md](./00-executive/Current_System_State.md) when production behavior changes.
5. Follow [DEVELOPMENT_WORKFLOW.md](./03-engineering/DEVELOPMENT_WORKFLOW.md).

---

## Document revision history

| Version | Date | Changes |
|---------|------|---------|
| 2.0 | 2026-07-23 | Documentation Foundation v1.0 — canonical 11-folder structure; recovered sprint-7 docs; merged duplicates |
| 1.1 | 2026-07-20 | Documentation Foundation complete (sprint-7 branch) |
| 1.0 | 2026-07-20 | Initial taxonomy |
