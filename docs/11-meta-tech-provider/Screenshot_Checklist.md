# Atlas Platform

## Meta Review Screenshot Checklist

**Document ID:** MTP-SC-001  
**Version:** 1.0  
**Status:** Draft for Meta Tech Provider Review  
**Owner:** Atlas Platform Team  

**Related Documents:**
- [MTP-009 Demo Script](./09_Demo_Script.md)
- [MTP-010 Reviewer FAQ](./10_Reviewer_FAQ.md)
- [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md)
- [MTP-008 Permissions Justification](./08_Permissions_Justification.md)
- [Current_System_State.md](../00-executive/Current_System_State.md) (DOC-0001)

---

This document lists recommended screenshots for the Meta App Review evidence package. Every item maps to routes and functionality that exist in the current Atlas application on `main`. Follow capture order to align with [MTP-009 Demo Script](./09_Demo_Script.md).

**Conventions**

- Canonical prospect name: **John Smith**.
- Live WhatsApp test phone: `<REVIEW_TEST_PHONE_E164>` — **local only**; never commit to Git (see [evidence/demo-prospect.md](./evidence/demo-prospect.md)).
- Atlas URL phone segment: `<URL_ENCODED_REVIEW_PHONE>` — `encodeURIComponent` of phone as stored after inbound.
- Screenshots **05–12** must be captured with the **real personal WhatsApp number** substituted at capture time.
- Fictional +1 305-555-0101 is reserved sample data only — **not for live testing**.
- Use PNG format unless Meta submission requires otherwise.
- Redact secrets, bootstrap tokens, and personal phone numbers before external submission.

---

# Required screenshots

| # | File name | Route | Purpose | MTP references |
|---|-----------|-------|---------|----------------|
| 1 | `01-authenticated-workspace-executive-dashboard.png` | `/app` | Show private authenticated Atlas workspace (Executive Dashboard inside `MainLayout`). Bootstrap session is active; there is no separate username/password login form. | MTP-009 — Step 1, Before the Demo (scope); MTP-010 — Q1, Q15 |
| 2 | `02-whatsapp-connect-pre-connect.png` | `/app/settings/whatsapp` | Show WhatsApp Connect before authorization — **Connect WhatsApp** button and Atlas entry point for Embedded Signup. | MTP-009 — Step 3; MTP-010 — Q15 |
| 3 | `03-meta-embedded-signup-permissions.png` | External — Meta popup via `FB.login` (triggered from `/app/settings/whatsapp`) | Capture Meta's permission review screen during Embedded Signup showing customer-owned authorization and requested permissions: `whatsapp_business_management`, `whatsapp_business_messaging`, `public_profile`. | MTP-009 — Step 3; MTP-010 — Q3, Q9; MTP-008 — Appendix A |
| 4 | `04-whatsapp-connect-connected.png` | `/app/settings/whatsapp` | Show successful connection — WABA ID, phone number ID, display phone number, connection type, and health status after Embedded Signup completes. | MTP-009 — Steps 3, 7; MTP-010 — Q9, Q15 |
| 5 | `05-customer-whatsapp-inbound-message.png` | External — customer WhatsApp client (mobile or desktop) | Prove **user-initiated** contact: customer sends first message **to** the connected business number. | MTP-009 — Step 4; MTP-010 — Q4, Q5, Q15 |
| 6 | `06-prospect-workspace-activity-feed-inbound.png` | `/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>` | Show inbound WhatsApp message in Prospect Workspace **Activity Feed** (inbound message entry for John Smith). | MTP-009 — Step 4; MTP-010 — Q5, Q13, Q15 |
| 7 | `07-customer-whatsapp-automated-reply.png` | External — customer WhatsApp client | Show Atlas automated outbound reply delivered on the customer device after inbound processing (Sprint 11.4 Phase A Conversation Engine). | MTP-009 — Step 5; MTP-010 — Q6, Q8, Q15 |
| 8 | `08-prospect-workspace-activity-feed-inbound-outbound.png` | `/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>` | Show both inbound and outbound entries in Activity Feed (outbound actor: Atlas; `MessageSent` persisted behind the view). | MTP-009 — Step 5; MTP-010 — Q6, Q8, Q13 |
| 9 | `09-mission-control-prospect-queue.png` | `/app/mission-control?phone=<URL_ENCODED_REVIEW_PHONE>` | Show John Smith visible in Mission Control agent queue after inbound message (workflow visibility). | MTP-009 — Steps 2, 4; MTP-010 — Q5, Q15 |

---

# Recommended screenshots

| # | File name | Route | Purpose | MTP references |
|---|-----------|-------|---------|----------------|
| 10 | `10-prospect-center-pipeline-entry.png` | `/app/prospect-center?q=John` | Show John Smith in searchable prospect pipeline (operational context for WhatsApp-originated leads). | MTP-009 — Steps 2, 6; MTP-010 — Q5, Q15 |
| 11 | `11-prospect-workspace-journey-context.png` | `/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>` | Show identity strip and journey progress alongside Activity Feed — WhatsApp messages within recruiting workflow, not isolated chat. | MTP-009 — Step 6 |
| 12 | `12-mission-control-conversation-panel.png` | `/app/mission-control?phone=<URL_ENCODED_REVIEW_PHONE>` | Show latest conversation snippet in Mission Control (`ConversationPanel`) for John Smith. | MTP-010 — Q5 |
| 13 | `13-whatsapp-connect-connected-closing.png` | `/app/settings/whatsapp` | Closing shot for permission scope and customer control discussion (connected status; revocation explained as Meta-side — no in-app disconnect button). | MTP-009 — Step 7; MTP-010 — Q9, Q10 |

---

# Optional screenshots

Capture only when applicable demo data and workflow state support them.

| # | File name | Route | Purpose | MTP references |
|---|-----------|-------|---------|----------------|
| 14 | `14-next-actions-structured-outbound.png` | `/app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE>` or `/app/mission-control?phone=<URL_ENCODED_REVIEW_PHONE>` | Show **Next Actions** with a structured send action visible (e.g. Send Zoom link). Requires matching workflow milestone and organization settings. Not free-form compose. | MTP-009 — Step 5 (partial, optional); MTP-010 — Q6, Q7 |
| 15 | `15-quick-capture-form.png` | `/app/quick-capture` | Show Quick Capture prospect entry — in current review scope but not required for core WhatsApp walkthrough. | MTP-009 — Before the Demo (scope); MTP-010 — Q1 |
| 16 | `16-meta-business-manager-revocation.png` | External — Meta Business Manager / Meta account controls | Document customer-side authorization revocation (Atlas has no in-app disconnect button on WhatsApp Connect). | MTP-009 — Step 7; MTP-010 — Q9, Q10 |

---

# Do not capture

These surfaces are referenced in MTP-009 or MTP-010 only as **excluded**, **placeholder**, or **not implemented**. Do not submit them as evidence of current WhatsApp functionality.

| Route / surface | Reason | MTP references |
|-----------------|--------|----------------|
| `/app/conversations` | UI shell only — standalone Communications Hub not implemented | MTP-009 — Step 2 note, exclusion table; MTP-010 — Q14 |
| `/app/appointments` | UI shell only | MTP-009 — Step 6, exclusion table; MTP-010 — Q14 |
| `/app/analytics` | UI shell only | MTP-009 — exclusion table; MTP-010 — Q14 |
| `/app/settings` (general) | UI shell only — use `/app/settings/whatsapp` instead | MTP-009 — Step 7 note; MTP-010 — Q14 |
| Free-form WhatsApp compose in Prospect Workspace or Mission Control | Not implemented | MTP-009 — Step 5; MTP-010 — Q7 |
| Google Calendar booking UI | No dedicated Atlas screen (backend partial only) | MTP-009 — Step 6; MTP-010 — Q14 |
| Instagram Direct / Messenger | Not implemented — no routes in application | MTP-009 — exclusion table; MTP-010 — Q14 |

---

# Capture workflow summary

```
01 /app                          → authenticated workspace
02 /app/settings/whatsapp        → pre-connect
03 Meta popup                    → permission grant
04 /app/settings/whatsapp        → connected
05 Customer WhatsApp             → user-initiated inbound
06 /app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE> → Activity Feed inbound
07 Customer WhatsApp (<REVIEW_TEST_PHONE_E164>) → automated Atlas reply
08 /app/prospect-workspace/<URL_ENCODED_REVIEW_PHONE> → Activity Feed inbound + outbound
09 /app/mission-control?phone=<URL_ENCODED_REVIEW_PHONE> → John Smith in queue
10–13                            → recommended context shots
14–16                            → optional if applicable
```

For step-by-step narration during capture, use [MTP-009 Demo Script](./09_Demo_Script.md). For reviewer Q&A paired with evidence, use [MTP-010 Reviewer FAQ](./10_Reviewer_FAQ.md).

**Manual capture:** [evidence/CAPTURE_GUIDE.md](./evidence/CAPTURE_GUIDE.md) · **Output folder:** [evidence/](./evidence/)

---

# Summary

| Category | Count |
|----------|-------|
| Required | 9 |
| Recommended | 4 |
| Optional | 3 |
| Do not capture | 7 excluded surfaces |

All required file names correspond to implemented routes or external evidence surfaces referenced in MTP-009 and MTP-010. No screenshots are listed for placeholder pages or functionality that does not exist in the current implementation.
