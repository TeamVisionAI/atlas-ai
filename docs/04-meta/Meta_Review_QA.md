# Meta Review Q&A

## Document control

| Field | Value |
|-------|-------|
| **Document ID** | DOC-0004 |
| **Title** | Meta Review Q&A |
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
| DOC-0001 | [Current_System_State.md](../00-executive/Current_System_State.md) | Production state reference |
| DOC-0002 | [Meta_Approval_Portfolio.md](./Meta_Approval_Portfolio.md) | Primary Meta submission portfolio |
| DOC-0003 | [Privacy_and_Data_Handling.md](./Privacy_and_Data_Handling.md) | Privacy and data handling detail |

---

## Purpose

This document provides **concise answers** to common questions from **Meta Business Verification** and **WhatsApp Business Platform** reviewers. Answers are consistent with [Meta_Approval_Portfolio.md](./Meta_Approval_Portfolio.md) (DOC-0002) and [Current_System_State.md](../00-executive/Current_System_State.md) (DOC-0001).

**Recommended reading order:** DOC-0002 (portfolio) → DOC-0003 (privacy) → this document (quick reference).

---

## General

### What does Atlas AI do?

Atlas AI is an **internal operational platform** for financial services organizations. It helps agency teams capture prospects, organize recruiting workflows, schedule interviews, track activity, and manage user-initiated WhatsApp business conversations. It is **not** a consumer messaging application or mass marketing platform.

### Who uses Atlas?

| User type | Access |
|-----------|--------|
| **Licensed agents and internal staff** | Authenticated access to Atlas at `/app/*` |
| **Website visitors / prospects** | Public marketing website only — contact form, no Atlas login |
| **Meta reviewers** | This documentation package; no production system access required |

The general public does **not** use Atlas as a messaging app. Atlas is used by authorized agency staff to manage business operations.

### Why is WhatsApp needed?

WhatsApp Business enables Team Vision Financial and partner agencies to:

- Respond to prospects who **voluntarily message** the business
- Coordinate interview scheduling and reminders within established conversations
- Provide recruiting follow-up related to employment inquiries

WhatsApp is used for **legitimate business messaging** in user-initiated contexts — not for bulk marketing or unsolicited outreach.

---

## Messaging and opt-in

### How do conversations begin?

Conversations begin when the user **voluntarily initiates contact** through an approved channel:

| Channel | How contact begins |
|---------|-------------------|
| **Public website contact form** | User submits name, email, and message voluntarily |
| **WhatsApp** | User sends the **first message** to the business WhatsApp number (e.g. Click-to-WhatsApp) |
| **Referral / existing relationship** | User engages through a prior business relationship; agent may record prospect in Atlas via Quick Capture |

Atlas does **not** send WhatsApp messages as the first touchpoint after a website form submission.

### Does Atlas send unsolicited messages?

**No.** Atlas does **not** send unsolicited messages. Atlas does **not** purchase contact lists. Atlas does **not** send bulk marketing campaigns. All WhatsApp messaging occurs within user-initiated conversations or authorized business workflow contexts tied to voluntary contact.

### How does a user opt in?

Users opt in by **initiating contact**:

- Submitting the public website **contact form** with their information, or
- **Sending a WhatsApp message** to the business number, or
- Continuing an **existing conversation** with the business

There is no opt-in through purchased lists, scraped data, or cold outreach.

### How does a user stop receiving messages?

Users may stop receiving messages through:

| Method | Description |
|--------|-------------|
| **Request to the business** | Contact Team Vision Financial and ask not to be contacted further |
| **WhatsApp controls** | Block the business number using WhatsApp's built-in controls |
| **Do-not-contact workflow** | Atlas supports do-not-contact and closed prospect states per business rules; further outreach is limited when these states apply |

Atlas respects do-not-contact designations and Meta Business Messaging policies.

---

## Data and privacy

### What information is collected?

| Source | Typical data |
|--------|--------------|
| Contact form | Name, email, message |
| WhatsApp webhook | Phone number, message content, timestamps, Meta message IDs |
| Atlas application | Prospect profile fields entered by authorized agents |
| Authentication | Session tokens for authorized users |

See [Privacy_and_Data_Handling.md](./Privacy_and_Data_Handling.md) (DOC-0003) for full detail.

### How is information protected?

- **HTTPS** for production frontend and API
- **Authentication** required for Atlas application access
- **Server-side validation** on forms and API inputs
- **Environment variables** for secrets (not in frontend code)
- **Webhook verification** and signature validation for Meta webhooks
- **Token encryption** for WhatsApp access tokens when configured

Atlas does **not** claim third-party security certifications (e.g. SOC 2, ISO 27001) unless explicitly documented.

### Does Atlas sell user data?

**No.** Personal information is **not sold** to third parties. Data is used to operate services, respond to inquiries, manage recruiting workflows, and comply with legal obligations.

---

## Meta assets and products

### Who owns the WhatsApp Business Account?

The **customer** (financial services agency) owns their:

- WhatsApp Business Account (WABA)
- Registered WhatsApp phone number
- Facebook Page (required during onboarding)
- Instagram account (when linked to Meta business portfolio)

Atlas stores connection metadata and encrypted tokens **only to operate the integration on the customer's behalf**. Atlas does **not** own customer Meta assets.

### How are Meta products used?

| Meta product | Use | Status |
|--------------|-----|--------|
| **WhatsApp Cloud API** | Send and receive business messages | **Production** |
| **Embedded Signup** | Customer connects their own WABA | **Production** |
| **Facebook Login for Business** | OAuth during Embedded Signup | **Production** |
| **Graph API** | Token exchange, WABA subscription | **Production** |
| **Webhooks** | Inbound messages and delivery status | **Production** |
| **Instagram Direct / Messenger** | — | **Not implemented** |

Atlas requests only permissions required for Embedded Signup, webhook delivery, and policy-compliant messaging within user-initiated conversation contexts.

---

## Production vs planned

### What is live today vs planned?

| Category | Examples |
|----------|----------|
| **✅ Production (Release-11.3.1)** | Public website, contact form, Executive Dashboard, Mission Control, Prospect Center, Prospect Workspace, Quick Capture, WhatsApp webhook pipeline, Embedded Signup |
| **🟡 Planned (not production)** | AI Conversation Engine, Communication Hub, Instagram Messaging, Messenger Integration, Google Calendar Automation, automated AI replies |

Planned features are clearly marked in [Meta_Approval_Portfolio.md](./Meta_Approval_Portfolio.md) and must not be interpreted as current capabilities.

---

## Contact and policy references

| Resource | Detail |
|----------|--------|
| **Company** | Team Vision Financial |
| **Website** | [teamvisionfinancial.com](https://teamvisionfinancial.com) |
| **Email** | info@teamvisionfinancial.com |
| **Phone** | (786) 752-8080 |
| **Privacy Policy** | `https://teamvisionfinancial.com/privacy` |
| **Terms of Service** | `https://teamvisionfinancial.com/terms` |

---

## Document revision history

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-20 | Atlas Development Team | Initial Meta Review Q&A for Business Verification package |
