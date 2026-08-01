# Atlas Enterprise Architecture Guide

**Status:** Constitutional — highest architectural authority in Atlas  
**Version:** 1.0  
**Date:** 2026-08-01  
**Audience:** Every engineer, architect, product owner, and package author  
**Supersedes:** Informal role-based UI assumptions; partial workspace models as primary IA  
**Does not replace:** ADRs (they support this guide), Business Rules (they define tenant behavior)

---

> **Read this first.**  
> ADRs explain *decisions*. Business Rules explain *behavior*. This guide explains *what Atlas is* and *how the platform is organized*.

---

## 1. Vision

### What Atlas is

**Atlas is a Business Operating Platform.**

Atlas enables organizations to **configure** how they operate on software (Administration) and **execute** daily work on that software (Business)—recruiting, selling, following up, scheduling, conversing, and leading teams—across industries and verticals.

Atlas is:

- A **multi-tenant SaaS platform** with one identity, one RBAC model, and strict organization boundaries.
- A **composition of capabilities** delivered through modules, powered by shared platform services.
- An **extensible system** where vertical industries plug in as **packages** that extend Business—not fork it.
- An **event-aware, engine-driven** system that evolves incrementally without rewrites.
- An **AI-augmented** platform where intelligence assists execution but does **not** own business policy.

### What Atlas is NOT

Atlas is **not**:

- A CRM with a fixed pipeline and one industry baked in.
- Primerica software, recruiting software, or insurance software—those are **packages on Atlas**.
- A collection of role-specific applications requiring multiple logins for the same person.
- A monolith where UI pages embed business rules, channel logic, and persistence ad hoc.
- A platform where AI improvises policy or bypasses authorization.
- A system that rewrites working subsystems when the product vision expands.

### Why Atlas exists

Real organizations—starting with Team Vision Financial—need software that matches how people actually work:

- **Everyone recruits. Everyone sells. Everyone follows up.**
- Leadership changes **scope and visibility**, not the fundamental operating model.
- Administrators configure integrations, users, and policies **once**.
- Operators execute in a **single Business experience** shaped by permissions—not job-title silos.

Atlas exists to give every organization a **durable operating layer** that survives industry change, channel change, and AI change—without abandoning what already works.

### Long-term mission

Build the platform organizations run on for a decade or more:

1. **Configure** Atlas and the tenant (Administration).
2. **Operate** the organization (Business).
3. **Extend** with vertical packages (Insurance, Mortgage, Solar, Real Estate, Healthcare, Legal, Financial Services, and beyond).
4. **Evolve** capabilities through ADRs, Business Rules, and registries—never through destructive rewrites.

---

## 2. Core Principles

These principles are **constitutional**. Conflicts with a principle require an explicit ADR amendment—not silent code drift.

| # | Principle |
|---|-----------|
| 1 | **Atlas is a platform.** Business behavior is composed from capabilities, modules, engines, and packages—not from one-off features. |
| 2 | **Administration configures. Business operates.** Configuration changes how Atlas behaves; Business is where work happens. |
| 3 | **One identity.** One person, one credential, one audit trail. Duplicate users for the same human are prohibited. |
| 4 | **One RBAC model.** Roles and permissions are the sole authority for mutations and data scope. |
| 5 | **Packages extend Business.** Verticals register into Business modules and Administration config. They never fork core modules. |
| 6 | **Platform services never contain business rules.** Shared infrastructure executes; Business Rules and packages decide policy. |
| 7 | **Business Rules define business behavior.** Workflows and engines delegate to rules— they do not hardcode tenant policy. |
| 8 | **AI assists; it does not own business policy.** Conversation and semantic engines interpret and respond within rules and RBAC. |
| 9 | **Event-driven where appropriate.** State changes that affect multiple read models flow through events and projections. |
| 10 | **Evolution over rewrites.** Working systems are reorganized, extended, and redirected—not replaced in big-bang rewrites. |
| 11 | **UI context never replaces authorization.** Domain, module, and navigation visibility are affordances; RBAC is law. |
| 12 | **Leadership expands visibility.** It does not fragment the operating experience into separate products per org level. |
| 13 | **Backward compatibility and zero downtime.** Public routes, APIs, and bookmarks remain valid through redirects and additive change. |
| 14 | **Documentation first for architecture.** Registries and this guide precede implementation when structure changes. |

---

## 3. Platform Architecture

Atlas is organized in **three layers** visible to architects. Users see **two domains**.

```
Atlas Platform
│
├── Shared Platform Services     (infrastructure — not a user-facing "domain")
│
├── Administration Domain        (user intent: configure Atlas & the tenant)
│
└── Business Domain              (user intent: operate the organization)
```

### Shared Platform Services

**Responsibility:** Cross-cutting infrastructure that powers both domains.

**Owns:** Identity, authentication, RBAC enforcement, tenant isolation, communication gateway, connectors, event bus, projection engine, core engines (scheduling, capacity, response building), persistence, health, production guardrails, AI adapters.

**Must not own:** Industry-specific workflows, tenant recruiting policy, vertical copy, or UI navigation.

**Rule:** If it would exist unchanged when Team Vision is replaced by an Insurance package, it belongs here.

### Administration Domain

**Responsibility:** Configure and operate Atlas **for** the tenant (and, for platform staff, configure Atlas **as** SaaS).

**Owns:** Organization profile, users & invitations, roles (administration views), integrations (Meta, WhatsApp, Google, AI providers), scheduling policy, operations center, production health, audit visibility, future billing and platform console.

**Must not be:** The primary place to work prospects, run conversations, or execute recruiting workflows.

**Rule:** Administration **enables** Business; it does not replace it.

### Business Domain

**Responsibility:** Execute the customer organization's daily operations.

**Owns:** Mission Control, Quick Capture, Prospect Center, Conversations, Appointments, Follow Ups, Dashboards, Recruiting, Sales (future), Analytics, Knowledge—and all package-enriched behavior on those surfaces.

**Must not be:** Split by leadership tier into separate operating products (no Rep Atlas vs RVP Atlas).

**Rule:** Business is **industry-independent**. Primerica/Team Vision is a **package**, not the definition of Business.

### Boundary tests

| Question | Administration | Business | Platform |
|----------|:--------------:|:--------:|:--------:|
| Connect WhatsApp? | ✓ | | infra |
| Send/receive messages? | | ✓ (via gateway) | ✓ gateway |
| Create a prospect? | | ✓ | |
| Invite a user? | ✓ | | |
| Book an interview? | | ✓ | engine |
| Set working hours? | ✓ | | |
| Enforce who sees a prospect? | | | ✓ RBAC |

---

## 4. Capability Model

A **capability** is something Atlas **can do** for an organization. Every future feature **must** map to exactly one primary capability (extensions may touch secondary capabilities).

Capabilities are **stable names**. Modules, routes, and packages change; capabilities endure.

### Platform capabilities

| Capability | Description |
|------------|-------------|
| **Identity Management** | Users, sessions, credentials, invitations, profile |
| **Authorization & RBAC** | Roles, permissions, prospect scope, tenant guards |
| **Organization Management** | Tenant identity, branding, hierarchy metadata |
| **Tenant Isolation** | Organization-scoped data and request context |
| **Communication Management** | Omnichannel ingress/egress via gateway and connectors |
| **Integration Management** | External system connection and credential storage |
| **Event Management** | Business events, publishing, subscriptions |
| **Projection & Read Models** | Derived views for UI and operational surfaces |
| **Health & Observability** | Production readiness, operations visibility |
| **AI Assistance** | Semantic interpretation, reply generation, mission insights |

### Business capabilities

| Capability | Description |
|------------|-------------|
| **Prospect Management** | Intake, portfolio, detail, ownership, assignment |
| **Conversation Management** | Inbound/outbound dialogue, channel context, history |
| **Appointment Management** | Scheduling, confirmation, calendar sync, reminders |
| **Workflow Management** | State machines, milestones, advancement, handoffs |
| **Recruiting** | Qualification, interview path, recruiting-specific workflow |
| **Sales** | Pipeline beyond recruit (future vertical emphasis) |
| **Follow Up Management** | Stalls, tasks, recovery queues |
| **Mission Control** | Operational attention: what needs action now |
| **Analytics & Intelligence** | Dashboards, KPIs, knowledge, briefs |
| **Quick Capture** | Fast prospect/lead intake |
| **Knowledge Management** | Playbooks, FAQ, operational reference |
| **Scheduling (runtime)** | Slot selection and booking during conversations |

### Administration capabilities

| Capability | Description |
|------------|-------------|
| **User & Access Administration** | Admin users, invitations, access lifecycle |
| **Configuration Management** | Org settings, meeting policy, scheduling config |
| **Operations Management** | Operations Center, platform status, diagnostics |
| **Audit & Compliance** | Activity visibility, support tooling (scoped) |
| **SaaS Platform Management** | Tenants, billing, marketplace (future) |

**Constitutional rule:** If a sprint cannot name its capability, the sprint is not ready for implementation.

---

## 5. Module Model

Capabilities are **what** Atlas does. **Modules** are **how** capabilities are delivered in product and code.

```
Capability
    ↓
Module          (product + application boundary)
    ↓
Page            (route / user journey step)
    ↓
Component       (UI and local interaction)
```

### Ownership

| Layer | Owns | Must not own |
|-------|------|--------------|
| **Capability** | Definition, glossary entry, registry row | UI layout |
| **Module** | Routes, primary APIs, application services, module registry entry | Cross-module business rules duplication |
| **Page** | Composition, read model consumption | Authorization logic (delegate to RBAC) |
| **Component** | Presentation, local state | Engine orchestration, persistence |

### Module placement

| Module type | Domain | Example |
|-------------|--------|---------|
| Business module | Business | Mission Control, Prospect Center |
| Administration module | Administration | Admin Users, Integrations Settings |
| Platform module | Shared Platform Services | Communication Gateway, Identity |

### Boundaries

- **Modules communicate** through application services, events, and shared engines—not through duplicated domain logic.
- **Modules do not import** each other's internal domain models; they use published interfaces, read models, or APIs.
- **Packages extend modules** via registration hooks—never by copying module source.

### Example chain

```
Capability: Prospect Management
  → Module: Prospect Center (+ Prospect Detail page)
    → Page: /app/prospect-center
    → Components: ProspectList, Filters, ScopeIndicator
```

---

## 6. Shared Platform Services

Shared Platform Services are **infrastructure**. They are **never Business** and **never Administration UI**—though Administration configures them.

| Service | Responsibility | Examples in Atlas |
|---------|----------------|-------------------|
| **Identity** | Authentication, sessions, user records | `authService`, `atlasUserService`, `identityWriteService` |
| **RBAC** | Permission resolution, authorization | `permissionService`, `authorizationService`, middleware |
| **Organizations** | Tenant context, org metadata | `organizationGuard`, `tenantContextService` |
| **Communication Gateway** | Channel-agnostic messaging | `CommunicationGateway`, connectors (WhatsApp, Messenger) |
| **AI** | Adapters and providers | `SemanticAIAdapter`, semantic/conversation engines |
| **Event Bus** | Publish/subscribe domain events | `business-events` module |
| **Projection Engine** | Build read models from events | `projections` module |
| **Core Engines** | Reusable algorithms without tenant policy | Scheduling, capacity, response builder |
| **Persistence** | Supabase, migrations, repositories | `supabaseService`, module repositories |
| **Health** | Readiness, guardrails, production validation | `productionReadiness`, `/health` |

**Constitutional rules:**

1. Platform services **execute** decisions made elsewhere (Business Rules, RBAC, package config).
2. Platform services **must not** embed Team Vision–specific or industry-specific policy.
3. When policy appears in a platform service, it is a **defect**—extract to Business Rules or package.

---

## 7. Business Domain

### Definition

The **Business Domain** is the operational layer of the customer's organization. It is **industry-independent**. All verticals share the same Business modules and navigation philosophy.

### Canonical Business modules

| Module | Capability | Purpose |
|--------|------------|---------|
| **Dashboards** | Analytics & Intelligence | My / Team / Executive views—**scope differs, module does not** |
| **Mission Control** | Mission Control | What requires attention now |
| **Quick Capture** | Quick Capture | Intake |
| **Prospect Center** | Prospect Management | Portfolio (RBAC-scoped) |
| **Prospect Detail** | Prospect Management | Single-prospect operational workspace (page, not a domain) |
| **Conversations** | Conversation Management | Omnichannel history and context |
| **Appointments** | Appointment Management | Scheduling and calendar lifecycle |
| **Follow Ups** | Follow Up Management | Stalls and recovery |
| **Recruiting** | Recruiting | Qualification and hiring workflow (package-enriched) |
| **Sales** | Sales | Post-recruit pipeline (future, package-enriched) |
| **Analytics** | Analytics & Intelligence | Performance and funnel |
| **Knowledge** | Knowledge Management | Playbooks and reference |

### Leadership in Business

Leadership is expressed through:

- **Data scope** (owned → team → division → organization)
- **Dashboard emphasis** (personal vs team vs executive)
- **Management actions** (assign, approve, reassign)

Leadership is **not** expressed through separate Business products or nav trees per role.

### Industry independence test

*"Would an Insurance agency use this module unchanged (with different package rules)?"*

If yes → core Business module. If no → package extension or new capability ADR.

---

## 8. Administration Domain

### Definition

The **Administration Domain** is where Atlas and the tenant are **configured, integrated, audited, and operated as software**.

### Zones

| Zone | Purpose | Examples |
|------|---------|----------|
| **Organization** | Tenant identity and policy | Branding, office, meeting preferences |
| **Users & Access** | Identity administration | Admin Users, invitations, lifecycle |
| **Permissions** | Role visibility (not authority source) | Role assignment UI; matrix in docs |
| **Integrations** | External systems | Meta, WhatsApp, Google Calendar, AI providers |
| **Scheduling Policy** | Org scheduling configuration | Working hours, capacity, calendar |
| **Operations** | Runtime observability | Operations Center, production health |
| **Audit** | Compliance and support visibility | Audit logs, masked support views |
| **Platform Console** | Atlas SaaS (future) | All tenants, billing, marketplace |
| **Billing** | Subscriptions (future) | Plans, usage, invoices |

### Administration vs Business

| Action | Domain |
|--------|--------|
| Connect Google Calendar | Administration |
| Select interview slot in chat | Business |
| Create user | Administration |
| Capture prospect | Business |
| View production health | Administration |
| Work Mission Control queue | Business |

### Account preferences

User-level preferences (profile, password, language) may be reachable from both domains but are **not** a third domain—they are **Identity** surfaces linked from Administration or global account entry.

---

## 9. Package Architecture

### Definition

A **package** is a vertical implementation that **specializes** Business for an industry or operating model without forking Atlas core.

### Examples

| Package | Industry | Extends |
|---------|----------|---------|
| **Team Vision Recruiting** | Financial services / Primerica | Recruiting, qualification BRs, workflow copy |
| **Insurance** (future) | Insurance | Licensing, policy workflows, compliance hooks |
| **Mortgage** (future) | Mortgage | Application pipeline, document milestones |
| **Solar** (future) | Solar | Lead tiers, site survey stages |
| **Real Estate** (future) | Real estate | Listing ↔ prospect linking |
| **Healthcare** (future) | Healthcare | Compliance on conversations |
| **Legal** (future) | Legal | Matter milestones on prospect detail |

### Package rules (constitutional)

1. **Packages extend. Never fork.** No second Mission Control, no duplicate Prospect Center.
2. **Packages register** into Business Module Registry and Administration config schemas.
3. **Packages own** vertical Business Rules (or BR profiles), workflows, copy, and analytics definitions.
4. **Packages consume** platform engines and gateway—never reimplement channels.
5. **Packages must not** weaken tenant isolation or RBAC.
6. **New verticals** require a package manifest and capability mapping—not new domains.

### Package manifest (conceptual)

```
package:
  id: team-vision-recruiting
  capabilities: [recruiting, workflow, prospect-management]
  businessModuleExtensions: [recruiting, prospect-detail, mission-control]
  administrationConfig: [scheduling-policy, integration-defaults]
  businessRules: docs/06-business/BUSINESS_RULES.md (profile)
  workflows: [recruitingWorkflowRegistry]
```

See ADR-002 (Package-Based Extensibility) and Package Manifest spec (canonical registry).

---

## 10. AI Architecture

Atlas AI is a **platform capability** that **amplifies** Business operations within rules—not a separate product or policy owner.

### Components and responsibilities

| Component | Layer | Responsibility | Must not |
|-----------|-------|----------------|----------|
| **Atlas AI (adapter layer)** | Platform | Bridge channels to conversation engine | Encode BR policy |
| **Conversation Engine** | Platform | Orchestrate inbound message handling | Hardcode step order vs semantic model |
| **Semantic Conversation Engine** | Platform | Understand, remember, decide, delegate (BR-049) | Reimplement scheduling, qualification, appointments |
| **Business Rules Engine** | Platform execution / Business policy | Decisions: coverage, interview type, escalation | Generate user-facing copy |
| **Business Rules Applicator** | Platform | Apply rules to profile and context | Replace RBAC |
| **Response Builder / Copy** | Platform | Wording and tone | Decide eligibility |
| **Mission Engine / Mission Control AI** | Business support | Prioritization, attention scoring | Bypass prospect access |
| **AI Context** | Platform | Prospect history, step, channel, language for prompts | Store authoritative state |
| **Future AI Agents** | Platform + Business | Tool execution within guardrails | Mutate without permission checks |

### AI constitutional rules

1. **AI interprets; rules decide.** Eligibility, interview type, escalation → Business Rules.
2. **AI responds; RBAC protects.** Every outbound action respects tenant and prospect scope.
3. **AI delegates to engines.** Scheduling → Scheduling Engine. Appointments → Appointment Engine. Qualification → Conversation + BR engines.
4. **Adapters are swappable.** Channel and provider adapters do not leak into domain logic.
5. **Human advancement remains authoritative** where BRs require human coordinators.

---

## 11. Business Rules

### Why Business Rules are canonical

Business Rules (`docs/06-business/BUSINESS_RULES.md`, BR-XXX) encode **how organizations operate** in testable statements. They are the **behavior contract** for tenant-facing logic.

- **Workflows orchestrate; rules decide.**
- **Engines compute; rules gate.**
- **AI converses; rules bound behavior.**

When code and Business Rules conflict, **the Business Rule wins** unless an ADR explicitly amends governance (see Development Workflow).

### Relationship to ADRs

| Document | Answers |
|----------|---------|
| **This Guide** | What Atlas is; platform structure |
| **ADR** | Why we chose a structural or technical approach |
| **Business Rule (BR-XXX)** | What the business behavior must be |
| **Registry** | Where routes, modules, and ownership live |

**Flow for new behavior:**

1. Check this Guide for domain and capability placement.
2. Check ADRs for structural constraints.
3. Check Business Rules for existing behavior.
4. If behavior is new → propose new BR-XXX **before** implementation.
5. Implement in engines via delegation—not duplicated in UI or adapters.

### Anti-patterns (prohibited)

- Hardcoding Team Vision policy in React components.
- Duplicating qualification logic outside Business Rules Engine.
- Creating a "special case" in the semantic engine that belongs in BR-XXX.
- Bypassing Business Rules Engine "temporarily" in production paths.

---

## 12. Domain-Driven Design (DDD)

Atlas uses DDD **pragmatically**—where boundaries reduce complexity and support event-driven read models.

### Building blocks

| Concept | Definition in Atlas | Ownership |
|---------|---------------------|-----------|
| **Aggregate** | Consistency boundary for writes (e.g., Prospect, Appointment, User) | Business or Platform module |
| **Repository** | Persistence access for aggregates | Module infrastructure |
| **Application Service** | Use-case orchestration, transaction boundaries | Module application layer |
| **Domain Service** | Stateless domain logic spanning entities | Module domain or shared engine |
| **Domain Event** | Something that happened (past tense) | Published to event bus |
| **Read Model** | Query-optimized projection for UI | Module infrastructure / projections |
| **Projection Model** | Event handler that builds read models | Projection engine subscribers |

### Current modular alignment

| Module | DDD style |
|--------|-----------|
| `backend/modules/prospects` | Aggregate + repository + application service |
| `backend/modules/mission-control` | Read model + projections |
| `backend/modules/timeline` | Read model + projections |
| `backend/modules/business-events` | Event infrastructure |
| `backend/core/semanticConversationEngine` | Application orchestration (delegates) |

### Rules

1. **Write through aggregates** (or explicit application services)—not scattered Supabase updates.
2. **Read through read models** for complex UI—accept eventual consistency where documented.
3. **Cross-module coupling** via events or published APIs—not repository reach-through.
4. **Platform engines** are domain services when stateless; not aggregates.

---

## 13. Navigation Philosophy

Navigation follows **intent and capability**—not job title.

### Constitutional hierarchy

```
Domain          (Administration | Business)
    ↓
Capability      (Prospect Management, Integration Management, …)
    ↓
Module          (Prospect Center, Settings › Integrations, …)
    ↓
Page            (route)
    ↓
Component       (UI)
```

### Explicitly rejected as primary model

```
Role → Navigation
Role → Workspace → Navigation (Sprint 20 legacy as primary IA)
```

Roles inform **default landing** and **data scope**. They do **not** define separate Business products.

### User flow

1. User authenticates (Identity).
2. User selects **Domain** (if more than one eligible): Administration or Business.
3. User navigates **Modules** visible for their **permissions**.
4. **Dashboards** reflect scope (my / team / executive)—not separate domains.

### Deep links

Routes remain stable. Domain context may auto-switch for UX, but **authorization never auto-elevates**.

---

## 14. Security Model

### Identity

- One credential per person; sessions revocable; JWT + session dual-auth supported during transition (see ADR-0001).
- Identity writes through **IdentityWriteService** only.

### Authentication

- Email/password (and future factors) via platform auth routes.
- Bootstrap/dev tokens are non-production only.

### Authorization

- **RBAC** is the only mutation authority.
- **Prospect scope** enforced server-side (`canAccessProspect`, `getProspectListScope`).
- **Frontend gates** are UX only.

### Tenant isolation

- Every business record is organization-scoped.
- `organizationGuard` and tenant context on all tenant APIs.
- Cross-tenant access is platform-operator only (future Platform Console).

### Platform security

- Webhook signature verification where configured.
- Secrets in environment / secure storage—not in packages or repos.
- Operations and support roles: least privilege, masked PII where required.

**Constitutional rule:** No feature ships without identifying its permission requirements and tenant boundary.

---

## 15. Engineering Principles

| Principle | Meaning |
|-----------|---------|
| **No rewrites** | Extend, redirect, registry-first; deprecate with compatibility |
| **Delegate** | Engines and rules over inline logic |
| **Canonical services** | One write path per concern (identity, events, config) |
| **Evolution** | Phased migration (ADR-018 playbook) |
| **Backward compatibility** | Legacy URLs and APIs remain valid via redirects/aliases |
| **Zero downtime** | Additive deployment; feature flags for IA changes |
| **Documentation first** | Guide → ADR → BR → registry → code |
| **Minimal scope** | Smallest change that satisfies capability and rules |
| **Tests where behavior matters** | Especially RBAC, rules, and booking paths |
| **Registries stay honest** | CI validates routes ⊆ registry |

Official process: `docs/03-engineering/DEVELOPMENT_WORKFLOW.md`.

---

## 16. Canonical Documents

Every engineer should know where truth lives.

### Constitutional (highest authority)

| Document | Path | Purpose |
|----------|------|---------|
| **Atlas Enterprise Architecture Guide** | `docs/architecture/ATLAS_ENTERPRISE_ARCHITECTURE_GUIDE.md` | **This document — start here** |

### Structural decisions (supporting)

| Document | Path | Purpose |
|----------|------|---------|
| Architecture Decision Records | `docs/02-architecture/ARCHITECTURE_DECISIONS.md` + `docs/architecture/ADR-*.md` | Decision log |
| ADR-018 Platform Domain Architecture | `docs/architecture/ADR-018-Platform-Domain-Architecture.md` | Domain model (when published) |
| ADR-0001 Identity Source of Truth | `docs/architecture/ADR-0001-Identity-Source-of-Truth.md` | Identity writes |
| ADR-002 Package Extensibility | `docs/02-architecture/ARCHITECTURE_DECISIONS.md` | Packages |

### Behavior contract

| Document | Path | Purpose |
|----------|------|---------|
| **Business Rules** | `docs/06-business/BUSINESS_RULES.md` | BR-XXX behavior |
| RBAC Model | `docs/security/RBAC_MODEL.md` | Permissions matrix |

### Process

| Document | Path | Purpose |
|----------|------|---------|
| Development Workflow | `docs/03-engineering/DEVELOPMENT_WORKFLOW.md` | How to change Atlas |
| Business Rules Workflow | `.cursor/rules/atlas-business-rules-workflow.mdc` | AI/engineering BR discipline |

### Registries (structural truth — target state)

| Registry | Path (target) | Purpose |
|----------|---------------|---------|
| Domain Registry | `docs/architecture/registries/domain-registry.yaml` | Administration vs Business |
| Route Registry | `docs/architecture/registries/route-registry.yaml` | All `/app` and `/api` routes |
| Navigation Registry | `docs/architecture/registries/navigation-registry.yaml` | Nav order and gates |
| Business Module Registry | `docs/architecture/registries/business-module-registry.yaml` | Business modules + package hooks |
| Administration Registry | `docs/architecture/registries/administration-registry.yaml` | Admin zones and entries |
| Service Ownership Registry | `docs/architecture/registries/service-ownership.yaml` | Engine/API ownership |
| Package Manifest Spec | `docs/architecture/package-manifest.md` | Vertical registration |

### Legacy reference (do not extend as primary IA)

| Document | Note |
|----------|------|
| `docs/architecture/Atlas-Architecture-v1.md` | Pillars → map to domains; amend when ADR-018 migration completes |
| Sprint 20 workspace types in code | Legacy; superseded by this guide for navigation philosophy |

### Pre-implementation checklist (every sprint)

1. Read this Guide — capability and domain identified?
2. Read relevant ADRs — structural conflict?
3. Read Business Rules — behavior defined?
4. Update registries if routes/modules change?
5. RBAC permissions documented?
6. Backward compatibility preserved?

---

## 17. Atlas Philosophy

**Atlas is not a CRM.**

Atlas is a **Business Operating Platform**.

- **Administration** configures the platform and the tenant.
- **Business** operates the organization.
- **Capabilities** define what Atlas can do.
- **Modules** deliver those capabilities in product and code.
- **Packages** specialize industries without forking the core.
- **Business Rules** define behavior; when in doubt, read the BRs.
- **Shared Platform Services** power everything—they never own tenant policy.
- **AI** amplifies people; it does not replace rules, roles, or accountability.
- **Leadership** widens the lens; it does not split the business into different apps.
- **One identity. One RBAC. One platform.**

The platform **evolves**.

We **never rewrite** what already works—we **reorganize**, **register**, **redirect**, and **extend**.

Build for the organization that operates today and the industry Atlas serves tomorrow.

---

## Document governance

| Action | Requirement |
|--------|-------------|
| Amend this Guide | Chief Architect + explicit team review; version bump |
| Contradict this Guide | New ADR that cites conflict and proposed amendment |
| Implement features | Must align; registries updated when structure changes |
| Add Business behavior | Business Rule (BR-XXX) or BR amendment first |
| Add vertical | Package manifest; no new domain without ADR |

**Version history**

| Version | Date | Summary |
|---------|------|---------|
| 1.0 | 2026-08-01 | Initial constitutional guide; ADR-018 alignment; capability and module model |

---

*End of Atlas Enterprise Architecture Guide*
