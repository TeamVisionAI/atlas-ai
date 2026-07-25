# Audit Logging

## Required events (target)

| Event | Trigger | Current status |
|-------|---------|----------------|
| Lead Created | Prospect intake (Quick Capture, Facebook, WhatsApp) | Partial — `prospect_created` business event |
| Lead Assigned | Assignment change | Partial — `prospect_assigned` business event |
| Lead Viewed | Recruiter opens prospect/workspace | **Not logged** |
| Lead Updated | Profile/workflow changes | Partial — business events + workflow events |
| Communication Sent | WhatsApp outbound | Partial — `message_sent` business event + conversation_logs |
| Interview Scheduled | Calendar booking | Partial — `appointment_created` business event |
| Interview Completed | Post-interview milestone | Partial — event types exist |
| User Login | Session created | **Not logged** |
| User Logout | Session revoked | **Not implemented** |
| Permission Changes | Role/assignment admin | **Not implemented** |
| Administrative Actions | Ops Center replay/reset | Partial — in-memory ops activity log only |
| Webhook Verification Failure | Invalid signature | Partial — WhatsApp structured logger |
| Agent Action Executed | Mission Control action | Partial — workflow/agent state, not unified audit |

## Storage

| System | Retention | PII risk |
|--------|-----------|----------|
| `atlas_business_events` | Durable | Payloads may contain PII — access controlled |
| `workflow_events` | Durable | Prospect IDs |
| `conversation_logs` | Durable | Full messages |
| Server stdout | Ephemeral | **Risk** — contact form traces, WhatsApp phone logs |
| Operations Center memory | Process lifetime | Activity titles only |

## Recommendations

1. Emit a unified `audit_log` business event for: login, lead viewed, agent action, export (future).
2. Remove PII from `contact.js` trace logs in production.
3. Redact `phone` from `whatsappStructuredLogger` production output.
4. Persist Operations Center administrative actions to durable audit store.
5. Never log raw webhook bodies.

## Query expectations

Auditors must be able to answer:

- Who viewed prospect X?
- Who sent message Y?
- Who changed assignment on date Z?

Today, only partial reconstruction from business events is possible.
