# Atlas Documentation

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0999 |
| **Title** | Atlas Documentation Index |
| **Version** | 1.1 |
| **Status** | Approved |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-20 |
| **Related Sprint** | — |
| **Related Release** | Documentation Foundation |

---

## Related documents

| Document ID | Document | Description |
|-------------|----------|-------------|
| DOC-0001 | [00-executive/Current_System_State.md](./00-executive/Current_System_State.md) | Production state reference |
| DOC-0400 | [04-meta/README.md](./04-meta/README.md) | Meta approval package index |
| DOC-0600 | [06-releases/CHANGELOG.md](./06-releases/CHANGELOG.md) | Release and milestone changelog |
| DOC-0512 | [05-sprints/Sprint-11.4-Implementation-Plan.md](./05-sprints/Sprint-11.4-Implementation-Plan.md) | Sprint 11.4 engineering blueprint |

---

Official documentation system for **Atlas AI — Team Vision Financial**.

This index defines where documents live, how they are numbered, and how to navigate the library. Documents follow the **Atlas Documentation Standard** (document control header, purpose, scope, related links).

> **Documentation Foundation:** Complete as of 2026-07-20. Documentation is frozen except for normal sprint updates, release notes, and ADRs.

---

## Documentation map

```
docs/
├── README.md                    ← You are here
│
├── 00-executive/                Strategy & current state (leadership, Meta reviewers)
├── 01-product/                  Product requirements, backlog, UX intent
├── 02-architecture/             System design, engines, data models
├── 03-integrations/             Third-party APIs (WhatsApp, Supabase, email, etc.)
├── 04-meta/                     Meta Business Verification & WhatsApp Platform
├── 05-sprints/                  Sprint specifications & verification
├── 06-releases/                 Release notes & deployment records
├── decisions/                   Architecture Decision Records (ADRs)
├── standards/                   Engineering standards & workflow
└── troubleshooting/             Local development & operational runbooks
```

---

## Quick start by audience

| Audience | Start here |
|----------|------------|
| **Executive / stakeholder** | [00-executive/Current_System_State.md](./00-executive/Current_System_State.md) |
| **Meta reviewer** | [04-meta/README.md](./04-meta/README.md) · [Meta_Approval_Portfolio.md](./04-meta/Meta_Approval_Portfolio.md) |
| **Product owner** | [01-product/README.md](./01-product/README.md) · [BACKLOG.md](./BACKLOG.md) |
| **Engineer (new)** | [standards/README.md](./standards/README.md) · [troubleshooting/local-development.md](./troubleshooting/local-development.md) |
| **Engineer (Sprint 11.4)** | [05-sprints/Sprint-11.4-Implementation-Plan.md](./05-sprints/Sprint-11.4-Implementation-Plan.md) |
| **Engineer (architecture)** | [02-architecture/README.md](./02-architecture/README.md) · [BUSINESS_RULES.md](./BUSINESS_RULES.md) |

---

## Folder guide

| Folder | Index | Purpose |
|--------|-------|---------|
| [00-executive](./00-executive/) | [README](./00-executive/README.md) | Vision, roadmap, current production state |
| [01-product](./01-product/) | [README](./01-product/README.md) | Backlog, personas, product specs |
| [02-architecture](./02-architecture/) | [README](./02-architecture/README.md) | Core architecture, workflow engine, events |
| [03-integrations](./03-integrations/) | [README](./03-integrations/README.md) | WhatsApp, Supabase, Resend, Meta SDK |
| [04-meta](./04-meta/) | [README](./04-meta/README.md) | Meta approval portfolio & compliance |
| [05-sprints](./05-sprints/) | [README](./05-sprints/README.md) | Sprint specs & implementation plans |
| [06-releases](./06-releases/) | [README](./06-releases/README.md) | Release notes & changelog |
| [decisions](./decisions/) | [README](./decisions/README.md) | ADRs |
| [standards](./standards/) | [README](./standards/README.md) | Coding standards, dev workflow, business rules |

---

## Legacy documents (root `docs/`)

The following files predate the folder taxonomy. They remain at the repository root of `docs/` until migrated. Each folder README lists the canonical future location.

| Document | Intended folder |
|----------|-----------------|
| `BUSINESS_RULES.md` | `standards/` |
| `ENGINEERING_STANDARDS.md` | `standards/` |
| `DEVELOPMENT_WORKFLOW.md` | `standards/` |
| `BACKLOG.md` | `01-product/` |
| `ATLAS_CORE_ARCHITECTURE.md` | `02-architecture/` |
| `WORKFLOW_ENGINE_SPEC.md` | `02-architecture/` |
| `EVENT_CATALOG.md` | `02-architecture/` |
| `MILESTONE_DEFINITIONS.md` | `02-architecture/` |
| `WHATSAPP_EMBEDDED_SIGNUP.md` | `03-integrations/` |
| `SPRINT_*.md` | `05-sprints/` |

> **Do not break links:** Cursor rules, code comments, and external bookmarks may reference root paths. Migrate files in dedicated commits with redirect notes.

---

## Document control standard

Every official document includes:

| Field | Example |
|-------|---------|
| Document ID | `DOC-0001` |
| Title | Current System State |
| Version | `1.0` |
| Status | Draft · Review · Approved |
| Owner | Atlas Development Team |
| Last Updated | `YYYY-MM-DD` |
| Related Sprint / Release | When applicable |
| Related Documents | Cross-links |

---

## Status of key documents

| Document | ID | Status | Location |
|----------|-----|--------|----------|
| Current System State | DOC-0001 | Approved | [00-executive/Current_System_State.md](./00-executive/Current_System_State.md) |
| Meta Approval Portfolio | DOC-0002 | Approved | [04-meta/Meta_Approval_Portfolio.md](./04-meta/Meta_Approval_Portfolio.md) |
| Privacy and Data Handling | DOC-0003 | Draft | [04-meta/Privacy_and_Data_Handling.md](./04-meta/Privacy_and_Data_Handling.md) |
| Meta Review Q&A | DOC-0004 | Draft | [04-meta/Meta_Review_QA.md](./04-meta/Meta_Review_QA.md) |
| Roadmap | DOC-0005 | Draft | [00-executive/Roadmap.md](./00-executive/Roadmap.md) |
| Vision | DOC-0006 | Draft | [00-executive/Vision.md](./00-executive/Vision.md) |
| Communication Hub | DOC-0010 | Draft | [02-architecture/Communication_Hub.md](./02-architecture/Communication_Hub.md) |
| Sprint 11.4 Specification | DOC-0511 | Draft | [05-sprints/Sprint-11.4.md](./05-sprints/Sprint-11.4.md) |
| Sprint 11.4 Implementation Plan | DOC-0512 | Draft | [05-sprints/Sprint-11.4-Implementation-Plan.md](./05-sprints/Sprint-11.4-Implementation-Plan.md) |
| Atlas AI Changelog | DOC-0600 | Approved | [06-releases/CHANGELOG.md](./06-releases/CHANGELOG.md) |

---

## Contributing

1. Place new documents in the correct numbered folder.
2. Add a document control header.
3. Link from this README or the folder README.
4. Update [Current System State](./00-executive/Current_System_State.md) when production behavior changes.

See [DEVELOPMENT_WORKFLOW.md](./DEVELOPMENT_WORKFLOW.md) (legacy path) for sprint workflow.

---

## Document revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.1 | 2026-07-20 | Atlas Development Team | Documentation Foundation complete; Sprint 11.4 implementation plan indexed |
| 1.0 | 2026-07-20 | Atlas Development Team | Initial documentation taxonomy |
