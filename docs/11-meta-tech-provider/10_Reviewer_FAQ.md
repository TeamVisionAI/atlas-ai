# Atlas Platform

## Reviewer FAQ

**Document ID:** MTP-010  
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
- [MTP-007 User Journey](./07_User_Journey.md)
- [MTP-008 Permissions Justification](./08_Permissions_Justification.md)
- [MTP-009 Demo Script](./09_Demo_Script.md)

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document provides **concise, reviewer-facing answers** to common Meta Tech Provider and App Review questions about Atlas Platform.

Every answer reflects the **current production and review environment** documented in [Current_System_State.md](../00-executive/Current_System_State.md) (DOC-0001). It does not describe planned or placeholder features as if they were available today.

For a step-by-step walkthrough, see [MTP-009 Demo Script](./09_Demo_Script.md).

---

# Implementation status key

Answers in this FAQ use the following labels where relevant:

| Label | Meaning |
|-------|---------|
| **Implemented** | Available in the current production/review environment on `main` |
| **Partial** | Some capability exists but is limited, optional, or not part of the core Meta review walkthrough |
| **Not implemented** | Not available today (UI shell, excluded channel, or not built) |

---

# General platform

## Q1. What does Atlas Platform do?

**Answer:** Atlas is a **private operational SaaS platform** for organization staff — recruiting workflows, prospect management, and WhatsApp Business messaging integrated into daily operations. It is not a public consumer messaging app.

**Current review scope (Implemented):** Executive Dashboard, Mission Control, Prospect Center, Prospect Workspace, Quick Capture, WhatsApp Connect (Embedded Signup), and the live WhatsApp inbound/outbound pipeline (Sprint 11.4 Phase A).

**See:** [MTP-003 System Architecture](./03_System_Architecture.md) · [MTP-009 Demo Script](./09_Demo_Script.md) · [Current_System_State.md](../00-executive/Current_System_State.md)

---

## Q2. Who owns the WhatsApp Business Account and related Meta assets?

**Answer:** The **customer organization** always owns its Meta Business Account, WhatsApp Business Account (WABA), phone numbers, and business conversations. Atlas acts only as authorized software after explicit customer approval through Embedded Signup. Atlas does not provision, transfer, or assume ownership of customer Meta assets.

**See:** [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) — Customer Ownership

---

# Meta permissions

## Q3. Why does Atlas request each Meta permission?

Atlas requests **only** the permissions listed in [MTP-008 Appendix A](./08_Permissions_Justification.md#appendix-a--meta-permission-reference). Each maps to a specific operational capability in the current review environment:

| Permission | Why it is required |
|------------|-------------------|
| `whatsapp_business_management` | Connect and manage **customer-authorized** WhatsApp Business Accounts through Meta's official Embedded Signup process; subscribe the customer's WABA to Atlas webhooks; maintain integration health for that organization only. |
| `whatsapp_business_messaging` | Send and receive WhatsApp Business messages on behalf of organizations that have **explicitly authorized** Atlas — inbound webhook processing and outbound replies within authorized conversation contexts. |
| `public_profile` | Basic user identity information during Facebook Login for Business in Embedded Signup. Atlas requests only the standard profile information exposed by this permission. |

Atlas follows least privilege. These three permissions are the **complete set** currently requested for WhatsApp Business integration. No additional Meta permissions are requested for unrelated functionality.

**See:** [MTP-008 Permissions Justification](./08_Permissions_Justification.md) · [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md)

---

# Messaging policy and behavior

## Q4. Does Atlas send unsolicited messages?

**Answer:** **No.** Atlas does not send bulk, broadcast, or unsolicited first-contact messages. Outbound WhatsApp messages occur only:

- After **user-initiated contact** (customer messages the business first), or
- Within an **established conversation context** (e.g. automated reply to inbound, or structured staff action in an active workflow)

Atlas is an operational business platform, not a mass marketing tool.

**See:** [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) · [MTP-008 Permissions Justification](./08_Permissions_Justification.md) — Permissions Not Requested or Used

---

## Q5. How does inbound WhatsApp messaging work today?

**Answer (Implemented):**

1. A customer sends a message to the organization's WhatsApp Business number (user-initiated).
2. Meta delivers the event to Atlas via **HTTPS webhook**.
3. Atlas **validates the webhook signature**, resolves the connected WABA to the correct **organization tenant**, and persists the message.
4. Authorized organization staff view the inbound message in **Prospect Workspace** (Activity Feed) and related workflow views (Mission Control, Prospect Center).

Backend workflow events include `MessageReceived`. The Activity Feed presents these as inbound message entries.

**See:** [MTP-005 Data Flow](./05_Data_Flow.md) — Inbound WhatsApp Message Flow · [MTP-009 Demo Script](./09_Demo_Script.md) — Step 4

---

## Q6. How does outbound WhatsApp messaging work today?

**Answer:** Outbound messaging uses the organization's **authorized WhatsApp credentials** and the WhatsApp Cloud API. Two paths exist in the current release:

| Path | Status | Description |
|------|--------|-------------|
| **Automated Conversation Engine reply** | **Implemented** (Sprint 11.4 Phase A) | After inbound processing, Atlas may deliver an automated reply: inbound webhook → Communication Hub → Conversation Engine → outbound send. Replies typically appear within ~30 seconds when business rules allow delivery. |
| **Structured staff agent actions** | **Partial** | From **Next Actions** in Prospect Workspace or Mission Control, predefined actions (e.g. Send Zoom link, Send office location, Send missed appointment message) send WhatsApp via the agent action API when workflow state and organization settings support them. Not free-form text. |

Delivery and status events return via Meta webhooks and are recorded in the organization's conversation history (`MessageSent` / outbound Activity Feed entries).

**See:** [MTP-005 Data Flow](./05_Data_Flow.md) — Outbound WhatsApp Message Flow · [MTP-009 Demo Script](./09_Demo_Script.md) — Step 5

---

## Q7. Can organization staff manually compose free-form WhatsApp messages in the Atlas UI?

**Answer:** **Not implemented.** Prospect Workspace and Mission Control do **not** include a free-form WhatsApp compose box today. Staff outbound WhatsApp is either:

- **Automated** — Conversation Engine reply after inbound (Implemented), or
- **Structured** — predefined agent actions when workflow and settings allow (Partial)

**See:** [MTP-009 Demo Script](./09_Demo_Script.md) — Step 5 (Partial implementation)

---

## Q8. Does Atlas use AI or automated replies?

**Answer:** **Yes — Implemented** for the current Meta review scope. Sprint 11.4 Phase A connects live inbound WhatsApp messages to the **Conversation Engine**, which may generate and deliver an **automated outbound reply** within established conversation context and business-rule gates (e.g. workflow gate, human ownership). This is the primary outbound path demonstrated after a user-initiated inbound message.

Structured staff agent actions (Partial) are rule-based predefined messages, not open-ended AI compose in the UI.

**See:** [MTP-003 System Architecture](./03_System_Architecture.md) — Communication Layer · [MTP-009 Demo Script](./09_Demo_Script.md) — Step 5 · [Current_System_State.md](../00-executive/Current_System_State.md)

---

# Authorization and revocation

## Q9. How can a customer revoke Meta authorization?

**Answer:** The organization revokes authorization through **Meta's account and Business Manager controls**. During review, evaluators may also reference permissions shown during **Embedded Signup** (Step 3 in [MTP-009 Demo Script](./09_Demo_Script.md)).

**Partial implementation:** WhatsApp Connect (`/app/settings/whatsapp`) displays connection status (WABA, phone number, health) but **does not currently provide an in-app disconnect button**. Revocation is performed in Meta.

**See:** [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) — Customer Ownership · [MTP-009 Demo Script](./09_Demo_Script.md) — Step 7

---

## Q10. What happens after authorization is revoked?

**Answer (Implemented):**

1. Atlas **stops using revoked credentials** for outbound WhatsApp messaging.
2. New webhook events for disconnected assets are **not processed for send operations**.
3. **Historical records** already stored in the organization's workspace may remain subject to organization retention and privacy policy.

Atlas detects invalid or revoked authorization through integration health checks and credential lifecycle handling.

**See:** [MTP-005 Data Flow](./05_Data_Flow.md) — Disconnect and Data Flow Cessation · [MTP-006 Security and Privacy](./06_Security_and_Privacy.md) — Meta Integration Security

---

# Security, privacy, and data

## Q11. How is tenant data isolated?

**Answer (Implemented):** Each customer organization is a logically isolated tenant. Isolation is enforced at:

| Layer | Control |
|-------|---------|
| Authentication | Staff sessions scoped to organization context |
| API | Organization ID required on tenant-scoped operations |
| Webhook routing | Events mapped to a single organization by connected WABA |
| Credentials | WhatsApp tokens and connection metadata stored **per organization only** |
| UI | Staff see only their organization's workspace |

There is no data path that exposes one organization's records or credentials to another organization.

**See:** [MTP-005 Data Flow](./05_Data_Flow.md) — Organization Data Boundaries · Cross-Organization Isolation · [MTP-003 System Architecture](./03_System_Architecture.md)

---

## Q12. How are access tokens and webhook traffic protected?

**Answer (Implemented):**

| Control | Practice |
|---------|----------|
| Transport | **HTTPS** for web application, API, and Meta webhook traffic |
| Webhook validation | Meta **signature verification** before processing; invalid or unsigned requests are rejected |
| Token storage | Integration tokens stored **server-side**; Meta app secrets and access tokens are **not exposed to client browsers** |
| Scoped use | Outbound sends use only that organization's authorized credentials |
| Encryption at rest | Applied where configured for sensitive integration credentials |

**See:** [MTP-006 Security and Privacy](./06_Security_and_Privacy.md) — Encryption and Transport Security · Meta Integration Security · [MTP-005 Data Flow](./05_Data_Flow.md) — Webhook Event Flow

---

## Q13. What data does Atlas store?

**Answer (Implemented):** Organization-scoped data persisted in Atlas managed cloud storage (Supabase) includes:

| Category | Examples |
|----------|----------|
| Organization profile and settings | Workspace configuration, integration connection metadata |
| Prospect / customer records | Contact information, workflow state, milestones |
| Conversation history | Inbound and outbound WhatsApp message content and metadata |
| Integration credentials | Server-side tokens and WABA connection data after Embedded Signup |
| Activity and audit events | Workflow events, agent actions, Activity Feed entries |

Data collection is limited to legitimate business operations authorized by the customer organization. Public privacy detail: [Privacy and Data Handling](../07-security/Privacy_and_Data_Handling.md) (DOC-0003).

**See:** [MTP-005 Data Flow](./05_Data_Flow.md) — Data Storage Flow · [MTP-006 Security and Privacy](./06_Security_and_Privacy.md)

---

# Scope of the current Meta review

## Q14. Are Calendar, Communications Hub, Instagram, or Messenger part of this review?

**Answer:**

| Capability | Current status | Part of Meta review walkthrough? |
|------------|----------------|----------------------------------|
| **Google Calendar / automated appointment booking** | **Partial** — backend interview booking when Google credentials are configured on Railway; not demonstrated in the walkthrough | **No** |
| **Communications Hub** (`/app/conversations`) | **Not implemented** — UI shell only | **No** |
| **Appointments, Analytics, general Settings** (outside WhatsApp Connect) | **Not implemented** — UI shell only | **No** |
| **Instagram Direct** | **Not implemented** | **No** |
| **Messenger** | **Not implemented** | **No** |
| **WhatsApp Business integration** | **Implemented** | **Yes** — core review scope |

**See:** [MTP-009 Demo Script](./09_Demo_Script.md) — What This Demo Does Not Show · [Current_System_State.md](../00-executive/Current_System_State.md)

---

# Testing for reviewers

## Q15. How can a Meta reviewer test the application?

**Answer:** Follow [MTP-009 Demo Script](./09_Demo_Script.md) step by step. Summary:

| Step | Action |
|------|--------|
| **Access** | Open `/app` over HTTPS. Session is established via pre-configured **bootstrap authentication** (`ATLAS_BOOTSTRAP_TOKEN` / `VITE_ATLAS_BOOTSTRAP_TOKEN`). There is no separate username/password login form in the current release. |
| **Connect** | Complete Embedded Signup at `/app/settings/whatsapp`. |
| **Inbound** | Send a **user-initiated** test message from a separate WhatsApp client to the connected business number. |
| **Verify inbound** | Open Prospect Workspace for that phone number; confirm inbound message in Activity Feed. |
| **Verify outbound** | Wait for automated Conversation Engine reply (~30 seconds typical); confirm on customer WhatsApp and in Activity Feed. |
| **Optional** | Mission Control, Prospect Center, structured agent actions when workflow allows. |
| **Close** | Review connection status and permission scope on WhatsApp Connect; explain Meta-side revocation. |

**Prerequisites:** Demo organization with bootstrap tokens configured; WABA and phone number for Embedded Signup; Meta webhook endpoint reachable on the Atlas API host; second WhatsApp client for inbound test.

Technical Embedded Signup detail: [WHATSAPP_EMBEDDED_SIGNUP.md](../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md).

**See:** [MTP-009 Demo Script](./09_Demo_Script.md) — full walkthrough and troubleshooting

---

# Quick reference — permission names

Exact Meta permissions requested by the Atlas Meta App (current review environment):

- `whatsapp_business_management`
- `whatsapp_business_messaging`
- `public_profile`

Authoritative definitions: [MTP-008 Appendix A](./08_Permissions_Justification.md#appendix-a--meta-permission-reference).

---

# Related portfolio documents

| Topic | Document |
|-------|----------|
| System structure and components | [MTP-003 System Architecture](./03_System_Architecture.md) |
| WhatsApp integration model | [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) |
| Message and data paths | [MTP-005 Data Flow](./05_Data_Flow.md) |
| Security and privacy controls | [MTP-006 Security and Privacy](./06_Security_and_Privacy.md) |
| Permission scope and least privilege | [MTP-008 Permissions Justification](./08_Permissions_Justification.md) |
| Step-by-step reviewer walkthrough | [MTP-009 Demo Script](./09_Demo_Script.md) |
| Production state baseline | [Current_System_State.md](../00-executive/Current_System_State.md) (DOC-0001) |

---

# Summary

Atlas Platform is a tenant-isolated operational SaaS application. Customer organizations own their Meta business assets and authorize Atlas through Embedded Signup using `whatsapp_business_management`, `whatsapp_business_messaging`, and `public_profile`.

In the current review environment, WhatsApp messaging is **user-initiated inbound** followed by **automated Conversation Engine outbound replies** and optional **structured staff actions** — not free-form compose or unsolicited outreach. Authorization may be revoked in Meta; Atlas stops using revoked credentials immediately. Calendar, Communications Hub, Instagram, and Messenger are **not** part of the current Meta Tech Provider walkthrough.

For hands-on verification, use [MTP-009 Demo Script](./09_Demo_Script.md).
