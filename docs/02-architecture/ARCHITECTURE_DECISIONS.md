# Architecture Decision Records — Atlas Version 1

**Status:** FROZEN  
**Last Updated:** 2026-07-21  
**Audience:** Engineering  

**Related:** [ATLAS_PLATFORM_V1.md](./ATLAS_PLATFORM_V1.md) · [../10-rfcs/README.md](../10-rfcs/README.md) · [../01-product/WHY_ATLAS_EXISTS.md](../01-product/WHY_ATLAS_EXISTS.md)

---

## Purpose

Capture **why** Atlas Version 1 is architected the way it is. Implementation details change; these decisions should not change without Version 2 review.

---

## ADR-001 — Event-Driven Architecture

**Decision:** All domains communicate through a shared Event Bus. No domain polls another.

**Context:** Business activity is asynchronous — messages, calendar changes, workflow steps, connector health, human takeovers. Polling creates coupling, latency, and missed signals.

**Reasoning:**
- Mission Control requires real-time updates without rebuilding state on a timer.
- Package analytics should react to milestones as they happen.
- Daily Brief can consume historical event-derived metrics.
- New subscribers (future dashboards) can be added without modifying publishers.

**Consequences:**
- Event Bus is mandatory infrastructure (`backend/communication/events/EventBus.js`).
- Event naming is standardized (RFC-002).
- Handlers must not crash publishers (RFC-010).
- Core engines remain pure — services emit events, Core does not.

**Alternatives rejected:** Direct service-to-service calls for cross-domain notifications; scheduled batch jobs for operational state.

---

## ADR-002 — Package-Based Extensibility

**Decision:** Industry workflows live in packages (`backend/packages/`), not in Atlas Core.

**Context:** Team Vision recruiting has specific qualification rules, licensing steps, and follow-up sequences. Future customers (insurance, mortgage, real estate) will have different workflows.

**Reasoning:**
- Core stays generic and stable — one codebase serves all industries.
- Organizations install packages through Organization Console without code deployment.
- Package configuration is isolated — Core cannot read package internals.
- Team Vision Recruiting Pack (Release 1.1) validates the model.

**Consequences:**
- Packages register workflows via Workflow Intelligence (RFC-004).
- Packages emit `package.*` events for analytics and Mission Control.
- Organization Console manages install/enable/configure lifecycle.

**Alternatives rejected:** Feature flags in Core for each industry; forked Core per customer.

---

## ADR-003 — Communication Gateway

**Decision:** All channel messages pass through a unified Gateway that normalizes to a Message Envelope (RFC-001).

**Context:** Atlas supports Messenger, WhatsApp, Instagram, and Website Chat. Each platform has different webhook formats, identifiers, and attachment models.

**Reasoning:**
- Agent intelligence should be channel-agnostic — one conversation engine for all channels.
- Adding a channel means adding an adapter, not modifying Agent code.
- Gateway Store provides audit trail for troubleshooting.
- Journey #6 verified identical envelope structure across all channels.

**Consequences:**
- `backend/gateway/` is the intelligence entry point (Journey #6).
- Sprint 12 `backend/communication/` remains for legacy connector platform.
- Outbound routing reverses the path: Agent → OutboundRouter → adapter.

**Alternatives rejected:** Per-channel Agent instances; platform-specific logic in ConversationEngine.

---

## ADR-004 — Agent Isolation

**Decision:** The Atlas Agent is a decision brain — it requests work via tools but never performs side effects directly.

**Context:** Agent must schedule appointments, create meetings, send messages, and update records. Unchecked side effects create untestable, unsafe automation.

**Reasoning:**
- Clear boundary: Agent decides, domain services execute.
- Tool Execution (RFC-003) provides validation, audit, and retry.
- Business Rules Engine applies before tool execution.
- Agent can be tested with mocked tools without external APIs.

**Consequences:**
- `backend/agent/` owns conversation, memory, decisions, responses.
- `backend/agent/tools/` is the only Agent exit path for side effects.
- ToolRegistry defines available capabilities per deployment.

**Alternatives rejected:** Agent calling Supabase/APIs directly; monolithic "do everything" Agent class.

---

## ADR-005 — Tool Execution Layer

**Decision:** Introduce explicit Tool Request → Validate → Execute → Result pipeline (Journey #5 Inc 3).

**Context:** Agent needs to invoke scheduling, calendar, and messaging capabilities with audit trails and validation.

**Reasoning:**
- Separates intent (Agent) from implementation (services).
- Execution history enables debugging and Mission Control visibility.
- Failed tools emit `agent.tool.failed` for alert generation.
- Matches RFC-003 permanent contract.

**Consequences:**
- ToolExecutor delegates to registered handlers.
- Each tool has parameter schema validated by ToolValidator.
- `toolExecutionHistory.json` persists execution audit.

**Alternatives rejected:** Inline service calls from DecisionEngine; LLM native function calling without Atlas validation layer.

---

## ADR-006 — Production Connectors

**Decision:** External integrations (Meta, Google Calendar, Zoom) are isolated connectors with health, retry, and events (Journey #7).

**Context:** Sprint 12 embedded API calls in services. Production requires retry policies, health monitoring, and org-scoped credentials.

**Reasoning:**
- Connectors wrap external APIs behind a uniform contract (RFC-007).
- Organization Console stores `credentialsRef` — never secrets in code or logs.
- ConnectorRegistry enables shared health across Gateway and Mission Control.
- CalendarService and ZoomService delegate to connectors (minimal service change).

**Consequences:**
- `backend/connectors/` with BaseConnector, RetryPolicy, ConnectorHealth.
- Connector events feed Mission Control alerts.
- Meta webhook routes through MetaWebhookConnector.

**Alternatives rejected:** Direct axios calls scattered across services; single monolithic integration module.

---

## ADR-007 — Organization Console

**Decision:** All organization-specific configuration lives in Organization Console (Release 1.2), not in Core or packages.

**Context:** Each agency has different offices, branding, languages, policies, and connector assignments. Hardcoding Team Vision defaults violates multi-tenant readiness.

**Reasoning:**
- "Everything that changes between organizations belongs in configuration."
- ConfigurationValidator prevents invalid states before persistence.
- `buildPackageConfiguration()` returns opaque blob — package isolation preserved.
- Separate store from Journey #1 onboarding avoids auth/config coupling.

**Consequences:**
- `backend/organizations/` with 17 single-responsibility modules.
- `organizationConsole.json` persistence.
- Organization events feed Mission Control and audit history.

**Alternatives rejected:** Environment variables per customer; config files in package source; database schema per org.

---

## ADR-008 — Daily Brief Engine

**Decision:** Separate executive intelligence domain (Release 1.3) that generates one structured briefing per day per organization.

**Context:** Leaders need synthesis, not dashboards to search. Atlas Never Sleeps vision requires a "what happened?" product.

**Reasoning:**
- Snapshot → Metrics → Trends → Insights → Priorities → Recommendations pipeline is testable and modular.
- Insights are observations only; recommendations require human approval.
- Brief is distinct from Mission Control — different time horizon, different update model.
- Implements first Atlas Never Sleeps "Thinking" product.

**Consequences:**
- `backend/intelligence/` domain (not to be confused with workflow intelligence).
- `dailyBrief.json` store with generation history.
- RFC-008 defines permanent brief schema.

**Alternatives rejected:** Client-side morning brief only (existing frontend view model); embedding brief logic in Executive Dashboard Core read model.

---

## ADR-009 — Mission Control Engine

**Decision:** Live operational state via event-driven incremental updates (Release 1.4), separate from Daily Brief.

**Context:** Operators need "what is happening right now?" — active conversations, waiting queue, connector health, workflow failures. Sprint 12.5 MissionControlService covered conversations only.

**Reasoning:**
- Incremental event processing avoids expensive full-state rebuilds.
- Subscribes to all major event namespaces — single operational heartbeat.
- Alerts and health are first-class, not afterthoughts.
- Complements Daily Brief: Brief = retrospective; Mission Control = live.

**Consequences:**
- `MissionControlEngine` subscribes via `MissionEventProcessor`.
- `missionControl.json` store for state, timeline, alerts.
- RFC-009 defines state schema.
- Sprint 12.5 `MissionControlService` preserved for backward compatibility.

**Alternatives rejected:** Polling JSON stores on interval; embedding live state in Daily Brief generation; full state rebuild on each event.

---

## ADR-010 — JSON File Persistence (Version 1)

**Decision:** Domain stores use JSON files in `backend/data/` for Version 1 MVP.

**Context:** Rapid iteration across 7 journeys and 4 releases required persistence without database migration overhead.

**Reasoning:**
- Consistent pattern: `readStore()` / `writeStore()` / `clearStore()` / `updatedAt`.
- Verification scripts reset stores cleanly.
- Supabase remains for production auth and some legacy tables.
- Version 2 can migrate stores incrementally.

**Consequences:**
- 17 JSON store files documented in 02-architecture/ATLAS_PLATFORM_V1.md.
- Not suitable for high-concurrency production — documented as MVP limitation.
- Each domain owns its store file — no shared database schema for new domains.

**Alternatives rejected:** Immediate Supabase migration for all new domains; single monolithic state file.

---

## Decision Summary Table

| ADR | Decision | RFC | Release/Journey |
|-----|----------|-----|-----------------|
| ADR-001 | Event-driven architecture | RFC-010 | All |
| ADR-002 | Package-based extensibility | RFC-005 | 1.1 |
| ADR-003 | Communication Gateway | RFC-001 | Journey #6 |
| ADR-004 | Agent isolation | RFC-003 | Journey #5 |
| ADR-005 | Tool execution layer | RFC-003 | Journey #5 Inc 3 |
| ADR-006 | Production connectors | RFC-007 | Journey #7 |
| ADR-007 | Organization Console | RFC-006 | 1.2 |
| ADR-008 | Daily Brief engine | RFC-008 | 1.3 |
| ADR-009 | Mission Control engine | RFC-009 | 1.4 |
| ADR-010 | JSON persistence (MVP) | — | All |

---

## Document Maintenance

New decisions require ADR addition and architecture review. Existing ADRs are frozen with Version 1.

**Remember: Documentation should not become legacy.**
