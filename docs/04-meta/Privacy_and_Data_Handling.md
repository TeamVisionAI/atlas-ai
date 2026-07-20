# Privacy and Data Handling

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0003 |
| **Title** | Privacy and Data Handling |
| **Version** | 1.0 |
| **Status** | Draft |
| **Owner** | Atlas Development Team |
| **Last Updated** | 2026-07-20 |
| **Related Sprint** | 11.4 |
| **Related Release** | Release-11.3.1 |

> **Status values:** Draft · Review · Approved

---

## Related documents

| Document ID | Document | Description |
|-------------|----------|-------------|
| DOC-0001 | [Current_System_State.md](../00-executive/Current_System_State.md) | Authoritative production state reference |
| DOC-0002 | [Meta_Approval_Portfolio.md](./Meta_Approval_Portfolio.md) | Primary Meta submission portfolio |
| DOC-0004 | [Meta_Review_QA.md](./Meta_Review_QA.md) | Question-and-answer guide for Meta reviewers |
| — | Privacy Policy (public) | `https://teamvisionfinancial.com/privacy` |
| — | Terms of Service (public) | `https://teamvisionfinancial.com/terms` |
| — | Legal (public) | `https://teamvisionfinancial.com/legal` |

---

## Purpose

This document explains how **Atlas AI** collects, uses, stores, and protects user information for **Meta Business Verification** and **WhatsApp Business Platform** review.

It supplements the public Privacy Policy published at [teamvisionfinancial.com/privacy](https://teamvisionfinancial.com/privacy). For legally binding policy language, refer to the live website. This document describes **operational data handling** as implemented in production (Release-11.3.1).

**Audience:** Meta reviewers, compliance reviewers, and internal stakeholders.

---

## 1. What user information Atlas collects

Atlas collects information only in the context of legitimate business operations — voluntary website inquiries, user-initiated WhatsApp conversations, and prospect records entered by authorized agency staff.

### 1.1 Data by source

| Source | Data types collected | Production status |
|--------|----------------------|-------------------|
| **Public contact form** | Name, email address, message content | **Live** |
| **WhatsApp webhook (Meta Cloud API)** | Phone number (WhatsApp ID), message content, timestamps, Meta message IDs, delivery status | **Live** |
| **Atlas application (agent entry)** | Prospect profile fields (e.g. name, phone, recruiting milestone, interview details, notes) | **Live** |
| **Quick Capture** | Prospect contact information entered by authenticated agents | **Live** |
| **Authentication** | Session tokens, user identifiers for authorized Atlas users | **Live** |
| **Workflow events** | Audit records linked to prospect activity (e.g. message received, prospect created) | **Live** |

### 1.2 Data Atlas does not collect for messaging outreach

| Data type | Atlas policy |
|-----------|--------------|
| Purchased contact lists | **Not collected or used** |
| Bulk imported phone numbers for cold outreach | **Not collected or used** |
| Anonymous public messaging profiles | **Not applicable** — Atlas is not a public messaging app |

---

## 2. Why information is collected

| Purpose | Description |
|---------|-------------|
| **Respond to voluntary inquiries** | Contact form submissions are used to respond to users who request information about Team Vision Financial services or careers |
| **Manage recruiting workflows** | Prospect records support interview scheduling, milestone tracking, and team coordination |
| **Operate WhatsApp Business messaging** | Inbound and outbound messages are logged to enable agents to respond within user-initiated conversations |
| **Audit and accountability** | Workflow events provide an auditable record of prospect activity and messaging |
| **Secure platform access** | Session data restricts Atlas application access to authenticated internal users |
| **Abuse prevention** | Rate limiting and validation protect the contact form from spam |

Atlas collects information **only as necessary** to operate financial services recruiting workflows and respond to users who have voluntarily engaged with the business.

---

## 3. How information is stored

### 3.1 Storage architecture

| Component | Role | Data stored |
|-----------|------|-------------|
| **Supabase (PostgreSQL)** | Primary database | Prospects, conversation logs, workflow events, session records |
| **Railway (Atlas API)** | Application server | Processes requests; does not persist user data outside configured database and logs |
| **Vercel (frontend)** | Web application host | Serves UI; does not store prospect or message data locally |
| **Resend** | Email delivery | Processes contact form email in transit; Atlas sends name, email, and message for notification delivery |

### 3.2 Meta and WhatsApp credential storage

| Data type | Storage location | Notes |
|-----------|------------------|-------|
| Meta app credentials | Railway environment variables (server-side) | Never exposed in frontend bundles |
| WhatsApp access tokens | Supabase (encrypted when `META_TOKEN_ENCRYPTION_KEY` is configured) | AES-256-GCM at rest |
| Webhook payloads | Processed and persisted as conversation logs and workflow events | Linked to prospect records |

> Meta credentials and API keys are stored **server-side only**. Public frontend variables (`VITE_*`) contain only non-secret configuration required for Embedded Signup UI.

---

## 4. Who has access

| Actor | Access level | Scope |
|-------|--------------|-------|
| **Authorized Atlas users** | Authenticated access to `/app/*` | Prospect records, conversation logs, workflow data, Mission Control, Prospect Center, Prospect Workspace |
| **Public website visitors** | No Atlas login | Contact form submission only; no access to internal prospect data |
| **Meta (WhatsApp Cloud API)** | Delivers webhook events to Atlas API | Message content and metadata as part of standard WhatsApp Business Platform operation |
| **Service providers** | Infrastructure processing | Vercel, Railway, Supabase, and Resend process data under their respective platform terms |

### 4.1 Access restrictions

- Prospect data and conversation logs are **not publicly accessible**.
- Atlas application routes require **authentication** (bootstrap token session in current production).
- There is **no public API** for browsing prospect or message data.

> **Planned enhancement:** Formal multi-user login with role-based access control is on the product backlog and is not yet production functionality.

---

## 5. How information is protected

Atlas implements the following **existing** security measures. This document does **not** claim third-party certifications (e.g. SOC 2, ISO 27001) that are not in place.

| Control | Description |
|---------|-------------|
| **HTTPS / TLS** | Production frontend (Vercel) and API (Railway) served over HTTPS |
| **Authentication** | Atlas `/app` routes and protected API endpoints require valid session |
| **Environment variables** | Secrets stored in deployment environment — not in source code |
| **Server-side validation** | Contact form and API inputs validated on the server |
| **Webhook verification** | Meta webhook verify token; `x-hub-signature-256` validation when app secret is configured |
| **Token encryption** | WhatsApp access tokens encrypted at rest when encryption key is configured |
| **Rate limiting** | Contact form limited to 5 submissions per IP per 15 minutes |
| **Honeypot spam field** | Contact form includes hidden field to reduce automated submissions |
| **Deployment separation** | Frontend, API, and database hosted on separate managed services |

---

## 6. How Meta and WhatsApp data are handled

### 6.1 Inbound WhatsApp messages

1. User **initiates** a WhatsApp message to the business number.
2. Meta delivers the message to Atlas via **webhook** (`POST /webhook`).
3. Atlas validates the webhook (verify token and signature when configured).
4. Atlas parses the message, deduplicates by Meta message ID, and creates or links a prospect record.
5. Message content is logged in **conversation logs** and associated **workflow events** are emitted.
6. Authorized agents view the conversation in Mission Control and Prospect Workspace.

### 6.2 Outbound WhatsApp messages

1. An authorized agent or workflow step sends a reply **within an existing conversation context**.
2. Atlas sends the message via **WhatsApp Cloud API** (Graph API).
3. Outbound message is logged and a workflow event is recorded.
4. Outbound messaging follows WhatsApp Business Platform **session and template rules**.

### 6.3 Asset ownership

| Asset | Owner |
|-------|-------|
| WhatsApp Business Account (WABA) | Customer (financial services agency) |
| Facebook Page | Customer |
| Instagram account (if linked) | Customer |
| Atlas platform | Operates integration on customer's behalf after Embedded Signup authorization |

Atlas does **not** claim ownership of customer Meta business assets. Connection metadata and encrypted tokens are stored solely to operate the authorized integration.

### 6.4 Meta products in use (production)

| Meta product | Data interaction |
|--------------|------------------|
| WhatsApp Cloud API | Send/receive messages; receive delivery status |
| Webhooks | Receive inbound messages and status notifications |
| Embedded Signup / Graph API | Token exchange, WABA subscription during customer onboarding |
| Facebook Login for Business | OAuth during Embedded Signup (business administrator) |

Atlas does **not** use Meta products for unrelated advertising automation, consumer social features, or messaging outside described business purposes.

---

## 7. Data retention philosophy

Atlas follows these **operational retention principles**:

| Principle | Description |
|-----------|-------------|
| **Business necessity** | Data is retained while needed to operate recruiting workflows, respond to inquiries, and maintain conversation history |
| **Audit trail** | Workflow events and conversation logs support accountability and workflow continuity |
| **Do-not-contact respect** | Prospects marked as do-not-contact or closed follow business rules that limit further outreach |
| **No data sales** | Personal information is **not sold** to third parties |
| **Legal compliance** | Data may be retained or disclosed when required by applicable law |

> **Note:** Specific retention periods and deletion procedures are governed by the public Privacy Policy and applicable legal requirements. This document describes operational philosophy, not a legal retention schedule.

---

## 8. User privacy principles

Team Vision Financial and Atlas AI apply the following privacy principles:

| Principle | Commitment |
|-----------|------------|
| **Voluntary contact** | Users initiate contact through the website contact form or by messaging the business on WhatsApp |
| **Purpose limitation** | Data is used to respond to inquiries, manage recruiting workflows, and operate authorized messaging |
| **Transparency** | Privacy Policy, Legal, and Terms of Service are published on the public website |
| **Access restriction** | Internal prospect data is accessible only to authenticated Atlas users |
| **No unsolicited messaging** | Atlas does not message users who have not initiated contact |
| **No purchased lists** | Atlas does not purchase or use third-party contact lists for outreach |
| **Human oversight** | Recruiters review prospects and conversations; Atlas automates administrative tasks, not business decisions |

---

## 9. Security overview

This section summarizes security controls relevant to privacy and data handling. For the full security table, see [Meta_Approval_Portfolio.md — Section 13](./Meta_Approval_Portfolio.md#13-security-overview) (DOC-0002).

| Area | Summary |
|------|---------|
| **Transport security** | HTTPS for all production frontend and API traffic |
| **Secret management** | API keys and Meta credentials in server-side environment variables |
| **Application access** | Authentication required for Atlas internal application |
| **Input validation** | Server-side validation on contact form and API endpoints |
| **Webhook integrity** | Meta webhook verification and signature validation |
| **Token protection** | WhatsApp tokens encrypted at rest when configured |

Atlas does **not** represent that it holds specific third-party security certifications unless explicitly documented elsewhere.

---

## 10. Public policy references

For legally binding privacy language, refer to the live documents:

| Document | URL |
|----------|-----|
| Privacy Policy | `https://teamvisionfinancial.com/privacy` |
| Legal | `https://teamvisionfinancial.com/legal` |
| Terms of Service | `https://teamvisionfinancial.com/terms` |

---

## Document revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-20 | Atlas Development Team | Initial privacy and data handling document for Meta review package |
