# RFC-009 — Mission Control State

**Status:** FROZEN  
**Version:** 1.0  
**Related:** Release 1.4 · [RFC-002](./RFC-002-event-naming.md)

---

## Purpose

Define the **permanent live operational state schema** for Mission Control.

Mission Control answers: *"What is happening right now?"*

---

## Mission State

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | string | Organization |
| `updatedAt` | ISO-8601 | Last state mutation |
| `activeConversations` | object | Map of conversationId → conversation state |
| `waitingCustomers` | string[] | Conversation IDs waiting for human |
| `runningWorkflows` | object | Map of workflowId → workflow state |
| `appointmentsToday` | number | Appointments scheduled today |
| `meetingsToday` | object | `{ scheduled, running, completed }` |
| `pendingFollowUps` | number | Pending follow-up count |
| `licensingPipeline` | object | `{ started, completed }` |
| `orientationPipeline` | object | `{ completed }` |
| `fastStartProgress` | object | `{ completed }` |
| `packageActivity` | object | Per-package event counters |
| `connectorStatus` | object | Per-connector health |
| `agentStatus` | object | `{ available, lastActivityAt }` |
| `organizationActivity` | object | `{ lastEventAt, lastEventType }` |
| `packages` | array | Installed packages |
| `activeUsers` | array | Active organization users |
| `pendingTasks` | number | Pending task count |
| `workflowFailures` | number | Workflow failure count |
| `responseSamples` | number[] | Recent response latencies (ms) |
| `eventTimestamps` | string[] | Recent event timestamps (for events/minute) |

---

## Mission Snapshot (Lightweight)

| Field | Type | Description |
|-------|------|-------------|
| `organizationId` | string | Organization |
| `organization` | string | Display name |
| `timestamp` | ISO-8601 | Snapshot time |
| `conversationSummary` | object | `{ active, waiting }` |
| `workflowSummary` | object | `{ running, failures }` |
| `connectorSummary` | object | Connector status map |
| `healthSummary` | object | Component health (see below) |
| `alerts` | array | Active alerts |
| `currentMetrics` | object | Operational metrics |
| `activeUsers` | array | Active users |
| `packages` | array | Package status |
| `timeline` | array | Recent timeline entries (max 50) |

---

## Health Statuses

Components: `atlas`, `agent`, `gateway`, `packages`, `connectors`, `organization`, `businessServices`, `workflowEngine`

Values: `healthy`, `warning`, `critical`, `unavailable`

---

## Alert Object

| Field | Type | Description |
|-------|------|-------------|
| `id` | string (UUID) | Alert identifier |
| `severity` | string | `critical`, `high`, `medium`, `warning` |
| `reason` | string | Why alert was raised |
| `affectedComponent` | string | Component identifier |
| `suggestedAction` | string | Recommended human action |
| `timestamp` | ISO-8601 | Alert creation time |
| `organizationId` | string | Organization |
| `resolved` | boolean | Resolution status |

---

## Mission Events

| Event | When |
|-------|------|
| `mission.updated` | State mutated from any source event |
| `mission.snapshot.created` | Snapshot generated |
| `mission.alert.created` | New alert raised |
| `mission.alert.resolved` | Alert resolved |
| `mission.timeline.updated` | Timeline entry added |
| `mission.health.changed` | Health status changed |
| `mission.metrics.updated` | Metrics recalculated |

---

## Invariants

1. **Incremental updates only** — never rebuild entire state from scratch on each event.
2. **No polling** — all updates originate from Event Bus subscriptions.
3. **Alerts never auto-execute** — human action required.
4. **Filters are engine-only in V1** — no UI implementation.

---

## Filter Dimensions

organization, office, package, workflow, conversation, connector, severity, time, user

---

## Reference

`backend/mission-control/` — MissionControlEngine, MissionState, MissionEventProcessor

**Verify:** `node backend/dev/verifyRelease1_4.js`
