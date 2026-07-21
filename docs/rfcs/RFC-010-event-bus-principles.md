# RFC-010 — Event Bus Principles

**Status:** FROZEN  
**Version:** 1.0  
**Related:** [RFC-002](./RFC-002-event-naming.md) · [ARCHITECTURE_DECISIONS.md](../architecture/ARCHITECTURE_DECISIONS.md)

---

## Purpose

Define the **permanent architectural principles** governing the Atlas Event Bus.

The Event Bus is the nervous system of Atlas Version 1.

---

## API Contract

| Method | Signature | Behavior |
|--------|-----------|----------|
| `on` | `(eventName, handler) → unsubscribe` | Subscribe; returns unsubscribe function |
| `emit` | `(eventName, payload?) → void` | Publish to all subscribers synchronously |
| `clear` | `(eventName?) → void` | Remove handlers |

---

## Principles

### 1. Publish Facts, Not Commands

Events describe **what happened**. Subscribers decide how to react.

- ✅ `organization.package.installed` — fact
- ❌ `organization.installPackage` — command (use service method instead)

### 2. Subscribers Must Not Crash Publishers

Event handlers MUST catch errors internally or delegate to async boundaries. A failing Mission Control handler must not break Gateway message processing.

### 3. Optional Injection

Services accept `eventBus` via constructor dependency. Emission uses optional chaining: `this.eventBus?.emit(...)`. Services function without Event Bus in unit tests.

### 4. One Bus Per Process

A single shared Event Bus instance connects Gateway, Agent, Packages, Organization Console, Daily Brief, and Mission Control within one Node.js process.

### 5. Synchronous Delivery (Version 1)

`emit()` calls handlers synchronously in registration order. Async work in handlers should not block upstream processing — use `setImmediate` or queue if needed.

### 6. Unsubscribe on Teardown

Long-lived subscribers (Mission Control, packages) store unsubscribe functions and call them on `unregister()` / `reset()` to prevent memory leaks in tests.

### 7. Namespace Ownership

Each domain owns its namespace. Cross-domain consumption is subscribe-only — domains do not emit events in another domain's namespace.

### 8. Payload Minimalism

Payloads contain identifiers and delta — not full entity graphs. Subscribers load additional context from stores if needed.

### 9. Audit by Default

Significant events should be persistable — Gateway Store, Mission Timeline, Brief history, Organization configuration history.

### 10. No Event Bus in Atlas Core Engines

Core decision engines (`businessRulesEngine`, `schedulingEngine`) remain pure functions. Events are emitted by **services and orchestrators** that call Core — not by Core itself. This preserves Core lock integrity.

---

## Subscriber Map (Version 1)

| Subscriber | Events Consumed |
|------------|-----------------|
| Mission Control | Gateway, Agent, Session, Workflow, Tool, Package, Organization, Brief, Connector, Appointment, Meeting, Prospect |
| Daily Brief | Indirect — generates on schedule/request, emits `brief.*` |
| Team Vision Analytics | All `package.*` events |
| Package workflows | Domain-specific subscriptions |

---

## Non-Goals (Version 1)

- Distributed event bus (Redis, Kafka)
- Event replay infrastructure
- Guaranteed delivery / dead letter queues
- Cross-process event propagation

These are Version 2+ considerations.

---

## Reference

`backend/communication/events/EventBus.js`

**Cross-reference:** [RFC-002 Event Naming](./RFC-002-event-naming.md)
