# RFC-007 — Connector Contract

**Status:** FROZEN  
**Version:** 1.0  
**Related:** Journey #7 · [RFC-006](./RFC-006-organization-model.md)

---

## Purpose

Define the **permanent contract** for production connectors integrating Atlas with external services.

Connectors wrap external APIs. Domain services delegate to connectors — they do not call APIs directly.

---

## Connector Interface

Every connector MUST implement:

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | ConnectorResult | Establish connection |
| `disconnect()` | ConnectorResult | Tear down connection |
| `healthCheck()` | HealthResult | Current health status |
| `getConnectorId()` | string | Unique connector identifier |

Channel connectors additionally implement:

| Method | Description |
|--------|-------------|
| `receive(payload)` | Normalize inbound webhook |
| `send(message)` | Deliver outbound message |

---

## Connector Configuration (Organization Console)

| Field | Type | Description |
|-------|------|-------------|
| `enabled` | boolean | Whether connector is active |
| `credentialsRef` | string | Reference to secret store (never logged) |
| `health` | string | `connected`, `disconnected`, `failed`, `unknown` |
| `defaultOfficeId` | string | Default office assignment |

---

## Connector Events

| Event | When |
|-------|------|
| `connector.connected` | Successful connection |
| `connector.disconnected` | Connection lost |
| `connector.health.changed` | Health status changed |
| `connector.retry` | Retry attempt |
| `connector.failed` | Unrecoverable failure |
| `connector.message.received` | Inbound message via connector |
| `connector.message.sent` | Outbound message delivered |

---

## Health Statuses

| Status | Meaning |
|--------|---------|
| `connected` / `healthy` | Operational |
| `degraded` | Partial functionality |
| `disconnected` | Not connected |
| `failed` | Error state requiring intervention |

---

## Invariants

1. **No secrets in logs** — credentialsRef only; never log tokens.
2. **RetryPolicy on all external calls** — shared retry with backoff.
3. **ConnectorRegistry is singleton** — one registry per process.
4. **Organization Console stores config** — connectors read org assignment at runtime.

---

## Version 1 Connectors

| ID | Service |
|----|---------|
| `messenger` | Facebook Messenger |
| `whatsapp` | WhatsApp Business |
| `instagram` | Instagram DM |
| `google-calendar` | Google Calendar |
| `zoom` | Zoom Meetings |

---

## Reference

`backend/connectors/` — BaseConnector, ConnectorRegistry, RetryPolicy

**Verify:** `node backend/dev/verifyJourney7.js`
