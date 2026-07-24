# Atlas Platform
## System Architecture

**Document ID:** MTP-003  
**Version:** 1.0  
**Status:** Draft for Meta Tech Provider Review  
**Owner:** Atlas Platform Team  

**Related Documents:**
- [MTP-001 Executive Summary](./01_Executive_Summary.md)
- [MTP-002 Platform Overview](./02_Platform_Overview.md)
- [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md)
- [MTP-005 Data Flow](./05_Data_Flow.md)

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document describes the **high-level system architecture** of Atlas Platform for Meta Tech Provider review.

It explains how Atlas is structured as a cloud SaaS application, how customer organizations are isolated, how Meta's WhatsApp Business Platform integrates with the platform, and how data and messages flow through the system.

This document is written for reviewers and stakeholders. Detailed engineering specifications are maintained separately in the Atlas architecture documentation.

---

# Architecture Overview

Atlas Platform follows a **modular, cloud-native architecture** consisting of four primary layers:

| Layer | Role |
|-------|------|
| **Presentation** | Web application used by organization staff |
| **Application** | Business logic, workflows, and API services |
| **Communication** | Channel integrations including WhatsApp Business |
| **Data** | Secure persistence and organization-scoped storage |

Each customer organization operates in a logically isolated environment. Organization data, integrations, and communications remain scoped to that customer.

---

# Core Components

## Web Application

The Atlas web application provides the primary user interface for organization staff.

Capabilities include:

- Operations Center and daily workflow views
- Prospect and customer management
- Conversation management
- Appointment and calendar coordination
- Organization administration and settings

The application is accessed through secure authentication. Public marketing pages and the private application workspace are logically separated.

## Application Platform (API)

The Atlas API platform hosts business logic and orchestration services, including:

- User authentication and authorization
- Organization and role management
- Workflow and milestone processing
- Business rules evaluation
- Event logging and audit trails

API services enforce organization boundaries on every request.

## Communication Layer

The Communication Layer manages inbound and outbound customer conversations.

For WhatsApp Business, this layer includes:

- Webhook ingestion from Meta
- Message routing to the correct organization and conversation
- Outbound message delivery through the WhatsApp Cloud API
- Template and policy-aware sending
- Conversation history linked to customer records

Atlas treats communication channels as **integrations** — not as the core product. The Communication Layer connects Meta's platform to Atlas business workflows.

## Data Layer

Atlas persists organization data in a managed cloud database.

Stored data includes:

- Organization profiles and settings
- User accounts and roles
- Customer and prospect records
- Conversation history
- Workflow state and activity logs
- Integration connection metadata (encrypted tokens scoped per organization)

---

# Deployment Architecture

Atlas Platform is deployed as a **multi-service cloud application**:

| Component | Hosting | Purpose |
|-----------|---------|---------|
| Web application | Cloud frontend (Vercel) | User interface and static assets |
| API platform | Cloud backend (Railway) | Business logic, webhooks, Meta API calls |
| Database | Managed PostgreSQL (Supabase) | Persistent organization data |
| Email (transactional) | Resend | System and notification email where configured |

All production traffic uses **HTTPS**. Environment-specific configuration separates development, staging, and production.

---

# Multi-Tenant Organization Model

Atlas is a **multi-tenant SaaS platform**. Each customer organization is a separate tenant.

| Principle | Implementation |
|-----------|----------------|
| Data isolation | Organization ID scopes queries and API access |
| Integration isolation | Each organization connects its own Meta Business assets |
| User isolation | Staff accounts belong to one organization (unless explicitly provisioned) |
| Configuration isolation | WhatsApp and other integrations are per-organization settings |

Atlas does not commingle customer data across organizations.

---

# Product Terminology

Atlas Platform uses customer-friendly product names throughout the application.

Some internal engineering documents may reference historical or development names.

| Product Interface | Internal Reference |
|-------------------|--------------------|
| Operations Center | Mission Control |
| Communications Hub | Communication Hub |
| Activity Timeline | Timeline |
| Executive Dashboard | Executive Dashboard |
| Prospect Center | Prospect Center |

These names refer to the same platform capabilities and do not represent separate products or services.

---

# Meta WhatsApp Integration Architecture

Atlas integrates with Meta's WhatsApp Business Platform using **Embedded Signup** and the **WhatsApp Cloud API**.

## Customer authorization

1. An organization administrator initiates Embedded Signup from Atlas settings.
2. Meta's authorization flow runs in Meta's UI — the customer selects or connects their WhatsApp Business Account.
3. Atlas receives an authorization result and stores connection credentials **for that organization only**.
4. The organization retains ownership of all Meta business assets.

## Runtime message flow

```
Customer (WhatsApp) → Meta WhatsApp Cloud API → Atlas webhook → Communication Layer
  → Organization context → Business workflows → Staff UI
```

Outbound messages follow the reverse path: staff action or automated workflow → Communication Layer → WhatsApp Cloud API → customer device.

## Webhook security

Meta webhook requests are validated using Meta's signature verification before processing. Invalid or unsigned requests are rejected.

## Token and credential handling

- Meta app credentials and organization access tokens are stored server-side only.
- Tokens are encrypted at rest where configured.
- Frontend code never receives Meta app secrets or long-lived access tokens.

---

# Security Architecture

Security is embedded at each layer of the architecture:

| Control | Description |
|---------|-------------|
| Transport security | HTTPS for all client and webhook traffic |
| Authentication | Secure login for organization users |
| Authorization | Role-based access within each organization |
| Webhook validation | Meta signature verification on inbound webhooks |
| Least privilege | Meta permissions limited to required WhatsApp Business capabilities |
| Audit logging | Workflow and communication events recorded for traceability |

For privacy and data-handling detail, see [Privacy and Data Handling](../07-security/Privacy_and_Data_Handling.md) (DOC-0003).

---

# Logical Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Organization Users                        │
│              (Browsers — Atlas Web Application)              │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                   Atlas Application Platform                   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │ Auth & RBAC │  │  Workflows   │  │  Organization Mgmt  │ │
│  └─────────────┘  └──────────────┘  └─────────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              Communication Layer                         │ │
│  │     (WhatsApp webhooks · outbound send · routing)        │ │
│  └─────────────────────────────────────────────────────────┘ │
└───────────────┬─────────────────────────────┬───────────────┘
                │                             │
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────┐
│   Data Layer (Supabase)   │   │  Meta WhatsApp Cloud API    │
│   Organization-scoped     │   │  (Customer-owned WABA)      │
└───────────────────────────┘   └─────────────────────────────┘
```

---

# Related Technical Documentation

| Document | Description |
|----------|-------------|
| [Communication_Hub.md](../02-architecture/Communication_Hub.md) | Communication transport layer (DOC-0010) |
| [WHATSAPP_EMBEDDED_SIGNUP.md](../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md) | Embedded Signup implementation guide |
| [Current_System_State.md](../00-executive/Current_System_State.md) | Production deployment state (DOC-0001) |
| [Privacy_and_Data_Handling.md](../07-security/Privacy_and_Data_Handling.md) | Privacy and data handling (DOC-0003) |

---

# Summary

Atlas Platform is a modular, cloud-hosted SaaS application with clear separation between user interface, business logic, communication integrations, and data storage.

Meta's WhatsApp Business Platform connects through a dedicated Communication Layer using Embedded Signup and secure webhooks. Each organization maintains ownership of its Meta business assets while Atlas provides workflow, automation, and operational software on the customer's behalf.

For end-to-end data path detail, see [MTP-005 Data Flow](./05_Data_Flow.md).
