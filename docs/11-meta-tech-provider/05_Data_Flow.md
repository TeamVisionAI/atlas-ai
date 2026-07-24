# Atlas Platform

## Data Flow

**Document ID:** MTP-005  
**Version:** 1.0  
**Status:** Draft for Meta Tech Provider Review  
**Owner:** Atlas Platform Team  

**Related Documents:**
- [MTP-001 Executive Summary](./01_Executive_Summary.md)
- [MTP-002 Platform Overview](./02_Platform_Overview.md)
- [MTP-003 System Architecture](./03_System_Architecture.md)
- [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md)

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document describes how data moves through Atlas Platform for Meta Tech Provider review.

It explains the flow of information between organizations, Atlas services, Meta's WhatsApp Business Platform, and organization users — with emphasis on authorization boundaries, tenant isolation, and secure processing.

---

# Scope

This document covers high-level data flows for:

- Organization and user access
- WhatsApp Business authorization (Embedded Signup)
- Inbound and outbound WhatsApp messages
- Meta webhook events
- Organization-scoped data storage

It does not define internal database schemas or engineering implementation detail. See [MTP-003 System Architecture](./03_System_Architecture.md) and related technical documentation.

---

# Organization Data Boundaries

Each customer organization operates as an isolated tenant within Atlas Platform.

| Boundary | Description |
|----------|-------------|
| Organization scope | Users, settings, records, and integrations belong to one organization |
| Integration scope | WhatsApp credentials and WABA connections are per organization |
| Conversation scope | Messages and customer records remain within the owning organization |
| Access scope | Authenticated users access only data for their organization |

Atlas does not commingle organization data across tenants.

---

# User Access Flow

```
Organization User → HTTPS → Atlas Web Application → Authentication
  → Authorization (role check) → Organization-scoped API → Data / UI response
```

1. A user signs in through Atlas secure authentication.
2. Atlas resolves the user's organization membership and role.
3. Every subsequent API request is scoped to that organization.
4. Data returned to the user includes only records belonging to their organization.

---

# Embedded Signup Authorization Flow

```
Organization Admin → Atlas Settings → Meta Embedded Signup UI
  → Customer grants permissions → Meta authorization result
  → Atlas server-side token exchange → Organization-scoped credential storage
```

1. An authorized administrator initiates WhatsApp connection from Atlas.
2. Meta's Embedded Signup UI collects customer authorization.
3. Atlas receives authorization results through Meta's official process.
4. Atlas stores connection credentials **for that organization only**.
5. No credentials are shared with other organizations.

See [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) for integration policy detail.

---

# Inbound WhatsApp Message Flow

```
Customer (WhatsApp) → Meta Cloud API → Meta Webhook → Atlas API
  → Signature validation → Organization resolution → Communications Hub
  → Conversation record → Organization staff UI
```

1. A customer sends a message to the organization's WhatsApp Business number.
2. Meta delivers the event to Atlas via webhook.
3. Atlas validates the webhook request.
4. Atlas maps the event to the correct organization and connected WABA.
5. The message is recorded in that organization's conversation history.
6. Authorized organization staff may view and respond through Atlas.

---

# Outbound WhatsApp Message Flow

```
Organization User or Workflow → Atlas API → Communications Hub
  → Organization credential lookup → WhatsApp Cloud API → Customer device
  → Delivery status webhook → Organization conversation record
```

1. An authorized user or approved workflow initiates an outbound message.
2. Atlas verifies organization context and messaging permissions.
3. Atlas sends the message through the Cloud API using **that organization's** authorized credentials.
4. Meta returns delivery and status events via webhook.
5. Status updates are recorded in the organization's conversation history.

---

# Webhook Event Flow

```
Meta → HTTPS webhook → Atlas API → Signature validation
  → Event type routing → Organization context → Processing / storage
```

Typical webhook events include incoming messages, delivery confirmations, read receipts, and message status updates.

Invalid or unsigned webhook requests are rejected and not processed.

Only events associated with connected customer organizations are accepted.

---

# Data Storage Flow

Organization data is persisted in Atlas managed cloud storage.

| Data category | Flow |
|---------------|------|
| Organization profile | Created at onboarding; updated by organization admins |
| User accounts | Provisioned per organization; linked to roles |
| Customer / prospect records | Created through workflows, staff entry, or authorized channels |
| Conversation history | Written on inbound/outbound WhatsApp events |
| Integration credentials | Stored server-side after Embedded Signup; scoped per organization |
| Activity and audit events | Appended as workflow and communication events occur |

Data at rest is protected according to Atlas security practices. See [Privacy and Data Handling](../07-security/Privacy_and_Data_Handling.md) (DOC-0003).

---

# Cross-Organization Isolation

Atlas enforces isolation at multiple points in the data path:

- **Authentication** — users belong to one organization context per session
- **API layer** — organization ID required on tenant-scoped operations
- **Webhook routing** — events mapped to a single organization by connected WABA
- **Credential storage** — tokens and connection metadata never shared across tenants
- **UI layer** — staff see only their organization's workspace

There is no data flow path that exposes one organization's records to another organization.

---

# Disconnect and Data Flow Cessation

When an organization disconnects WhatsApp integration or revokes Meta authorization:

1. Atlas stops using revoked credentials for outbound messaging.
2. New webhook events for disconnected assets are not processed for send operations.
3. Historical records already stored in the organization's workspace remain subject to organization retention and privacy policy.

Customers may revoke authorization through Meta's controls at any time.

---

# Summary

Atlas Platform routes data through clearly defined paths: user access, Meta authorization, webhook ingestion, message delivery, and organization-scoped storage.

Every flow respects tenant boundaries. WhatsApp-related data enters and leaves Atlas only through official Meta APIs and validated webhooks, using credentials authorized by each customer organization.

Meta business assets remain customer-owned throughout the lifecycle of the integration.
