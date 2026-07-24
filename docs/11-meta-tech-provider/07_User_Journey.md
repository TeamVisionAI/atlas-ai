# Atlas Platform

## User Journey

**Document ID:** MTP-007  
**Version:** 1.0  
**Status:** Draft for Meta Tech Provider Review  
**Owner:** Atlas Platform Team  

**Related Documents:**
- [MTP-001 Executive Summary](./01_Executive_Summary.md)
- [MTP-002 Platform Overview](./02_Platform_Overview.md)
- [MTP-003 System Architecture](./03_System_Architecture.md)
- [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md)
- [MTP-005 Data Flow](./05_Data_Flow.md)
- [MTP-006 Security and Privacy](./06_Security_and_Privacy.md)

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document describes the **complete customer journey** on Atlas Platform for Meta Tech Provider review.

It explains how an organization onboards, connects WhatsApp Business, handles messages, schedules appointments, runs operational workflows, and continues day-to-day platform use — from the perspective of the organization, its staff, and its customers.

---

# Journey Overview

Atlas serves three participant types in every journey:

| Participant | Role |
|-------------|------|
| **Organization** | Customer tenant that owns business assets and data |
| **Organization staff** | Authenticated users who operate the platform |
| **End customer** | Individual who contacts the organization through permitted channels |

The journey proceeds in this general sequence:

```
Organization onboarding → Staff access → WhatsApp connection → Customer contact
  → Message handling → Appointment scheduling → Operational workflow → Ongoing use
```

Atlas is an **operational platform**. Messaging occurs within authorized business contexts — not as unsolicited outreach.

---

# Organization Onboarding

## Initial setup

1. An organization establishes its Atlas workspace.
2. An organization administrator configures business settings.
3. Administrators invite or provision staff users.
4. Roles and permissions are assigned per organization policy.

Each organization operates independently with its own users, settings, and connected services.

## Product terminology

Customer-facing module names map to internal engineering references. See [MTP-002 Platform Overview](./02_Platform_Overview.md) Product Terminology.

---

# Staff Access and Daily Operations

## First login

1. A staff user receives credentials or an invitation from the organization administrator.
2. The user signs in through Atlas secure authentication.
3. Atlas resolves organization membership and role permissions.
4. The user enters the **Operations Center** (internal reference: Mission Control) — the primary daily workspace.

## Daily operational use

Staff use Atlas to:

- Review upcoming activities and priorities
- Manage prospect and customer records in **Prospect Center**
- View and act on conversations in the **Communications Hub**
- Monitor business metrics in the **Executive Dashboard**
- Coordinate appointments through the integrated **Calendar**

The Operations Center provides a real-time view of pending actions, appointments, and priorities for the next 48 hours.

---

# WhatsApp Business Connection

## Administrator journey

This journey is completed by an **authorized organization administrator**, not by Atlas on the customer's behalf.

| Step | What happens |
|------|----------------|
| 1 | Administrator opens organization settings in Atlas |
| 2 | Administrator selects **Connect WhatsApp Business** |
| 3 | Meta Embedded Signup UI opens |
| 4 | Administrator signs in with the organization's Meta Business Account |
| 5 | Administrator reviews and grants requested permissions |
| 6 | Meta returns authorization to Atlas |
| 7 | Atlas stores connection credentials scoped to that organization |
| 8 | Webhook subscription enables inbound and outbound messaging |

The organization retains ownership of its WhatsApp Business Account, phone number, and conversations. See [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md).

---

# Customer Contact and Message Initiation

## How contact begins

End customers engage through voluntary, policy-compliant channels:

| Channel | Typical initiation |
|---------|-------------------|
| WhatsApp | Customer sends a message to the organization's business number |
| Website or form | Customer submits a voluntary inquiry (organization responds through approved channels) |
| Referral or existing relationship | Customer contacts the business in an established context |

Atlas does **not** send WhatsApp messages as unsolicited first contact to unknown recipients.

## User-initiated WhatsApp journey

| Step | What happens |
|------|----------------|
| 1 | Customer discovers the organization through website, referral, advertisement, or existing relationship |
| 2 | Customer **initiates** a WhatsApp message to the organization's business number |
| 3 | Meta delivers the message to Atlas via webhook |
| 4 | Atlas validates the webhook and routes the event to the correct organization |
| 5 | Atlas records the message in the organization's conversation history |
| 6 | A prospect or customer record is created or linked as appropriate |

See [MTP-005 Data Flow](./05_Data_Flow.md) for technical flow detail.

---

# Message Handling and Response

## Inbound message handling

1. Incoming WhatsApp messages arrive through Meta webhooks.
2. Atlas validates and processes the event within the organization's tenant context.
3. Messages appear in the **Communications Hub** conversation view.
4. Authorized staff review message content and conversation history.
5. Staff or approved workflow automation prepare a response within the active thread.

## Outbound message handling

1. Staff user or approved workflow initiates a reply from Atlas.
2. Atlas verifies organization authorization and messaging context.
3. Outbound message is sent through the WhatsApp Cloud API using the organization's credentials.
4. Delivery and read status events are received via webhook and recorded in conversation history.

All replies occur **within an established conversation** or authorized business workflow context.

---

# Appointment Scheduling

## Scheduling workflow

1. Customer expresses interest in scheduling through message or prior voluntary contact.
2. Staff or workflow coordinates available times through the integrated **Calendar**.
3. Appointment details are confirmed with the customer through permitted messaging.
4. Reminders and follow-up messages may be sent where appropriate to the scheduled engagement.
5. Appointment activity is visible in Operations Center and related customer records.

Scheduling supports interview management, client meetings, and other appointment-based workflows configured by the organization.

---

# Operational Workflow

## Prospect lifecycle

Organizations manage customer prospects through defined lifecycle stages, including:

- New Lead
- Contacted
- Qualified
- Appointment Scheduled
- Customer
- Archived

Staff advance prospects through stages based on business rules and real-world interactions.

## Workflow automation

Atlas supports operational automation such as:

- Milestone progression based on completed actions
- Follow-up reminders tied to conversation or appointment context
- Activity logging in the **Activity Timeline** (internal reference: Timeline)
- Executive visibility through dashboards and operational views

Automation operates on behalf of the organization within policy and permission boundaries. Human judgment is applied where required.

---

# Ongoing Platform Use

## Continuous operations

After initial onboarding and WhatsApp connection, organizations use Atlas for ongoing operations:

| Activity | Platform capability |
|----------|---------------------|
| Daily priorities | Operations Center |
| Customer pipeline | Prospect Center |
| Conversations | Communications Hub |
| Scheduling | Calendar |
| Business visibility | Executive Dashboard |
| Team administration | Organization Management |

## Integration maintenance

Administrators may:

- Review connected WhatsApp Business status
- Re-authorize or disconnect Meta integration through Meta controls or Atlas settings
- Manage users, roles, and permissions as the team changes

Customers may revoke Meta authorization at any time. Atlas stops using revoked credentials for that organization.

---

# Policy Alignment

Atlas journeys comply with Meta Platform requirements:

| Requirement | Atlas behavior |
|-------------|----------------|
| Customer ownership | Organizations own Meta business assets and conversations |
| Voluntary contact | Messaging follows user-initiated or established business context |
| No spam | Atlas is not designed for bulk unsolicited messaging |
| Authorized platform | Atlas acts only after customer completion of Embedded Signup |
| Secure processing | Webhooks validated; data scoped per organization |

See [MTP-006 Security and Privacy](./06_Security_and_Privacy.md) for security and privacy controls.

---

# Summary

The Atlas customer journey begins with organization onboarding and staff access, continues through WhatsApp Business connection via Embedded Signup, and supports message handling, appointment scheduling, and operational workflows in daily use.

End customers contact organizations voluntarily. Staff and authorized automation respond within established conversations and business contexts. Organizations retain ownership of their Meta assets and customer relationships throughout.

Atlas provides secure operational software — WhatsApp is a customer-owned channel integrated into that platform.
