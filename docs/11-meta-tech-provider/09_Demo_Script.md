# Atlas Platform

## Demo Script

**Document ID:** MTP-009  
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

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document provides a **step-by-step demo script** for Meta Tech Provider and App Review evaluators.

It walks through **currently implemented** Atlas capabilities relevant to WhatsApp Business integration: authenticated application access, Embedded Signup connection, inbound and outbound messaging, and prospect workflow visibility in the current review environment.

This script does not demonstrate planned or placeholder features.

---

# Audience and Duration

| Item | Detail |
|------|--------|
| **Audience** | Meta reviewers, Tech Provider evaluators |
| **Estimated duration** | 15–20 minutes |
| **Prerequisites** | Demo organization account; test WhatsApp Business number authorized for review |

---

# Before the Demo

Confirm the following before starting:

1. Atlas web application is accessible over HTTPS.
2. Bootstrap authentication is configured in the review environment (`ATLAS_BOOTSTRAP_TOKEN` on the backend, `VITE_ATLAS_BOOTSTRAP_TOKEN` on the frontend). There is no separate username/password login form.
3. A WhatsApp Business Account (WABA) and phone number are available for Embedded Signup — owned by the demo organization, not Atlas.
4. Meta webhook endpoint is configured and reachable on the Atlas API host.
5. A second device or WhatsApp client is available to send a **user-initiated** test message to the connected business number.

**Current review scope (production on `main`):** Executive Dashboard, Mission Control, Prospect Center, Prospect Workspace, Quick Capture, WhatsApp Connect (Embedded Signup), and the live WhatsApp inbound/outbound pipeline.

Reference documents: [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md), [MTP-008 Permissions Justification](./08_Permissions_Justification.md), [Current_System_State.md](../00-executive/Current_System_State.md) (DOC-0001).

---

# Demo Flow

## Step 1 — Platform login

**Show:** Organization staff access is authenticated and scoped.

1. Open the Atlas web application route (`/app`).
2. Confirm the review environment establishes an authenticated session (bootstrap token pre-configured on backend and frontend — there is no separate username/password sign-in form in the current release).
3. Confirm the user lands in the authenticated workspace — **Executive Dashboard** (`/app`) or navigate to **Mission Control** (`/app/mission-control`).

**Explain:** Atlas is a private operational platform. Only authenticated organization users access the application. Public visitors do not access this workspace without authorization.

**Maps to:** [MTP-007 User Journey](./07_User_Journey.md) — Staff Access and Daily Operations.

---

## Step 2 — Current application modules (optional, 2 minutes)

**Show:** Operational modules available in the current review environment.

1. Navigate to **Mission Control** (`/app/mission-control`) — the live agent queue for active prospect workflows.
2. Navigate to **Prospect Center** (`/app/prospect-center`) — the live searchable prospect pipeline.
3. Optionally open **Executive Dashboard** (`/app`) — live leadership metrics and focus areas.

**Explain:** Atlas is an operational business platform. WhatsApp messaging integrates into these live workflows — it is not a standalone public messaging application.

**Note:** A standalone **Communications Hub** page (`/app/conversations`) exists as a UI shell only and is **not** part of this demo. Conversation history for WhatsApp appears in **Prospect Workspace** and workflow views.

**Maps to:** [MTP-002 Platform Overview](./02_Platform_Overview.md) · [Current_System_State.md](../00-executive/Current_System_State.md).

---

## Step 3 — Connect WhatsApp Business (Embedded Signup)

**Show:** Customer-owned authorization through Meta's official flow.

1. Open **WhatsApp Connect** at `/app/settings/whatsapp`.
2. Launch Embedded Signup (Facebook Login for Business).
3. Sign in with the demo organization's Meta Business Account.
4. Review the permissions presented by Meta (reference [MTP-008 Appendix A](./08_Permissions_Justification.md#appendix-a--meta-permission-reference)).
5. Grant authorization and complete onboarding.
6. Confirm Atlas displays a successful connection status for the organization's WABA and phone number.

**Explain:**

- The **customer organization** owns the WABA and phone number.
- Atlas receives authorization only after explicit customer approval.
- Atlas does not bypass Meta's authorization UI.

**Maps to:** [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) — Embedded Signup.

---

## Step 4 — User-initiated inbound message

**Show:** Inbound message path from customer to organization.

1. From a separate WhatsApp client, send a message **to** the connected business number (user-initiated contact).
2. Return to Atlas and open **Mission Control** and/or locate the prospect in **Prospect Center**.
3. Open **Prospect Workspace** (`/app/prospect-workspace/:phone`) for the messaging phone number.
4. Confirm the inbound message appears in the prospect **Activity Feed** as an inbound message entry (Atlas persists `MessageReceived` workflow events behind this view).

**Explain:**

- Meta delivers the message via webhook to Atlas.
- Atlas creates or links a prospect record and logs the message.
- Atlas routes the event to the correct organization tenant only.
- Contact began with a **user-initiated** message — not unsolicited outreach from Atlas.

**Maps to:** [MTP-005 Data Flow](./05_Data_Flow.md) — Inbound WhatsApp Message Flow.

---

## Step 5 — Outbound reply within conversation

**Show:** Policy-compliant outbound delivery within an active thread after user-initiated contact.

1. Remain in **Prospect Workspace** for the test prospect (or refresh the **Activity Feed**).
2. Wait for Atlas to deliver an automated reply through the live outbound pipeline (Sprint 11.4 Phase A: inbound webhook → Communication Hub → Conversation Engine → outbound send). Replies typically appear within ~30 seconds of inbound processing.
3. Confirm the reply is delivered to the customer's WhatsApp client.
4. Confirm an outbound message entry appears in the **Activity Feed** (Atlas persists `MessageSent` workflow events; actor shows as Atlas).

**Explain:**

- Outbound messages use the organization's authorized WhatsApp credentials.
- Replies occur within an established conversation context initiated by the customer.
- Atlas does not send bulk or unsolicited first-contact messages.

**Partial implementation (important for reviewers):**

- **Prospect Workspace does not include a free-form WhatsApp compose box.** Staff cannot type arbitrary replies in the UI today.
- **Structured staff outbound** is available when workflow state allows it: from **Next Actions** in Prospect Workspace or Mission Control, actions such as **Send Zoom link** or **Send office location** send predefined WhatsApp messages via the agent action API. These require matching workflow milestone, organization settings (e.g. Zoom URL configured), and are optional extensions of this step — not required for the core walkthrough.

**Maps to:** [MTP-007 User Journey](./07_User_Journey.md) — Message Handling and Response.

---

## Step 6 — Prospect workflow context (optional)

**Show:** WhatsApp messages within the live recruiting workflow.

1. From **Prospect Workspace**, review identity, journey progress, and the unified **Activity Feed** for the test prospect.
2. Optionally open the same prospect from **Prospect Center** to show pipeline visibility.

**Explain:** WhatsApp messages are recorded as part of the organization's operational workflow — not as isolated chat outside business context.

**Not demonstrated in this step:**

- **Calendar integration** — Engine support exists when Google credentials are configured on the backend, but automated calendar booking is not part of this Meta walkthrough.
- **Reminder engine** and **standalone Communications Hub UI** (`/app/conversations`) — Not implemented in the current release.
- **Appointments page** (`/app/appointments`) — UI shell only; not part of the current review environment.

**Maps to:** [MTP-007 User Journey](./07_User_Journey.md) — Operational Workflow (live portions only).

---

## Step 7 — Permissions and disconnect (closing)

**Show:** Customer control and least privilege.

1. Return to **WhatsApp Connect** (`/app/settings/whatsapp`).
2. Confirm connected WABA and phone number details are displayed when authorization is active.
3. Verbally reference the three permissions documented in [MTP-008 Appendix A](./08_Permissions_Justification.md#appendix-a--meta-permission-reference) (shown during Embedded Signup in Step 3, not repeated as a list on this screen).
4. Explain that the organization may **revoke authorization through Meta's account and Business Manager controls**.

**Explain:** Atlas requests only the permissions required for WhatsApp Business integration. Customer ownership and revocation are supported at all times.

**Partial implementation:** WhatsApp Connect displays connection status but **does not currently provide an in-app disconnect button**. Revocation is performed in Meta; Atlas stops using revoked credentials on subsequent API calls.

**Note:** General **Settings** pages outside WhatsApp Connect are UI shells in the current release and are not part of this demo.

---

# What This Demo Does Not Show

The demo intentionally does **not** demonstrate:

- Unsolicited bulk or broadcast messaging
- Messaging without user-initiated or established business context
- Access to unrelated Meta products or cross-organization data
- Features outside the authorized WhatsApp Business integration scope

The following are **not part of the current Meta Tech Provider review** (planned or placeholder):

| Item | Current status |
|------|----------------|
| Standalone Communications Hub page (`/app/conversations`) | UI shell only |
| Calendar integration / automated appointment booking | Partial — backend interview booking when Google credentials are configured; not demonstrated in this walkthrough |
| Appointments, Analytics, and general Settings pages | UI shell only |
| Free-form WhatsApp compose in Prospect Workspace | Not implemented — outbound is automated (Phase A) or structured agent actions |
| Reminder engine | Not implemented |
| Instagram Direct / Messenger integration | Not implemented |

---

# Troubleshooting (for reviewers)

| Issue | Check |
|-------|-------|
| Embedded Signup fails | Meta Business Account access; WABA not restricted; correct Configuration ID |
| Inbound message not visible | Webhook subscription active; signature validation; prospect created — check Prospect Workspace by phone |
| Automatic outbound reply not received | Confirm Sprint 11.4 Phase A on `main`; prospect not in human-ownership or workflow-gate state; check Railway logs for `conversation_engine_reply_sent` |
| Structured agent send fails | Organization resource configured (e.g. Zoom URL); action not already sent; WABA still connected |

For technical detail, see [WHATSAPP_EMBEDDED_SIGNUP.md](../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md).

---

# Summary

This demo script shows Meta reviewers the **current** WhatsApp Business integration path on Atlas Platform: bootstrap-authenticated staff access, customer-owned Embedded Signup authorization at `/app/settings/whatsapp`, user-initiated inbound messages, automated policy-compliant outbound replies via the live Conversation Engine pipeline (visible in Prospect Workspace Activity Feed), and workflow visibility in Mission Control and Prospect Center.

It aligns with the permission scope in [MTP-008 Permissions Justification](./08_Permissions_Justification.md) and reflects the production state documented in [Current_System_State.md](../00-executive/Current_System_State.md) (DOC-0001).

Planned modules described in [MTP-002 Platform Overview](./02_Platform_Overview.md) — including full Calendar integration and standalone Communications Hub — are intentionally excluded from this walkthrough.
