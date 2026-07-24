# Atlas Platform

## Permissions Justification

**Document ID:** MTP-008  
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

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document explains **why Atlas Platform requests Meta permissions** and how those permissions are used for Meta Tech Provider review.

It maps requested capabilities to platform features, describes the principle of least privilege, and clarifies what Atlas does not use Meta permissions to do.

---

# Permission Philosophy

Atlas follows three rules for Meta permission requests:

| Rule | Description |
|------|-------------|
| **Customer authorization first** | Permissions are granted by the customer organization through Meta's Embedded Signup — not assumed by Atlas |
| **Least privilege** | Atlas requests only permissions required to deliver authorized WhatsApp Business functionality |
| **Purpose limitation** | Permissions are used solely for operational business messaging and integration management — not unrelated social or advertising features |

See [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) and [MTP-006 Security and Privacy](./06_Security_and_Privacy.md).

---

# Meta Products Used

Atlas integrates with the following Meta products to provide WhatsApp Business capabilities:

| Meta product | How Atlas uses it |
|--------------|-------------------|
| **WhatsApp Business Platform — Embedded Signup** | Customer organization authorizes Atlas to access its WhatsApp Business Account |
| **Facebook Login for Business** | Customer administrator authenticates during Embedded Signup |
| **WhatsApp Cloud API** | Send and receive business messages on behalf of the connected organization |
| **Graph API** | Token exchange, WABA subscription, and integration health operations |
| **Webhooks** | Receive inbound messages and delivery or status events |

Customer-owned assets (Meta Business Account, WABA, phone number, Facebook Page where applicable) remain under customer ownership.

---

# Permissions Requested

Atlas requests Meta permissions required to complete the following integration capabilities:

## Embedded Signup and account connection

| Capability | Justification |
|------------|---------------|
| Complete Embedded Signup on behalf of the connecting administrator | Required so each organization can authorize Atlas to access **its own** WhatsApp Business assets through Meta's official UI |
| Identify and connect the customer's WABA and phone number | Required to route messages to the correct organization tenant |
| Subscribe the customer's WABA to Atlas webhooks | Required to receive inbound messages and delivery events |

## Messaging operations

| Capability | Justification |
|------------|---------------|
| Receive inbound WhatsApp messages | Required to deliver customer messages to the organization's Communications Hub |
| Send outbound WhatsApp messages | Required to allow organization staff and approved workflows to reply within authorized conversation contexts |
| Receive message delivery and status events | Required for conversation history, auditability, and workflow continuity |

## Integration maintenance

| Capability | Justification |
|------------|---------------|
| Validate and maintain authorized connection state | Required to detect revoked authorization and stop using invalid credentials |
| Perform Graph API operations scoped to connected assets | Required for subscription management and integration health — not for unrelated Meta features |

---

# Permission-to-Feature Mapping

| Atlas feature | Meta permission use |
|---------------|---------------------|
| Connect WhatsApp Business (organization settings) | Embedded Signup, Facebook Login for Business, Graph API token exchange |
| Inbound customer messages | Webhooks, WhatsApp Cloud API receive path |
| Staff replies and workflow messages | WhatsApp Cloud API send path within authorized context |
| Conversation history | Webhook status events stored in organization-scoped records |
| Disconnect / revocation handling | Graph API and credential lifecycle tied to customer authorization state |

See [MTP-007 User Journey](./07_User_Journey.md) for end-to-end user flows and [MTP-005 Data Flow](./05_Data_Flow.md) for technical data paths.

---

# Permissions Not Requested or Used

Atlas does **not** request or use Meta permissions for:

| Excluded use | Reason |
|--------------|--------|
| Unsolicited bulk or broadcast messaging | Atlas is an operational platform, not a mass marketing tool |
| Unrelated consumer social features | Atlas does not operate as a public social application |
| Advertising automation unrelated to customer-authorized messaging | Outside Atlas service scope |
| Access to unrelated customer Meta assets | Only assets explicitly authorized through Embedded Signup |
| Cross-organization data access | Tenant isolation — credentials and webhooks scoped per organization |

Atlas does not bypass Meta authorization or use permissions outside the customer's explicit grant.

---

# Customer Authorization Model

1. An organization administrator initiates connection in Atlas.
2. Meta presents the permission review screen during Embedded Signup.
3. The administrator explicitly grants authorization.
4. Atlas stores credentials **for that organization only**.
5. The customer may revoke authorization through Meta's controls at any time.

Atlas never provisions, transfers, or assumes ownership of customer Meta assets.

---

# Data Access Boundaries

| Boundary | Enforcement |
|----------|-------------|
| Organization tenant | Permissions and tokens isolated per organization |
| Webhook routing | Events mapped only to the connected WABA's owning organization |
| API usage | Outbound sends use only that organization's authorized credentials |
| Staff access | Role-based access within the organization workspace |

Meta permission usage does not expose one organization's data or credentials to another organization.

---

# Compliance Alignment

Atlas permission design supports Meta Platform requirements by:

- Using official Embedded Signup and Cloud API paths
- Requesting minimum permissions for described functionality
- Limiting messaging to authorized business contexts
- Validating webhooks before processing
- Respecting customer revocation immediately

---

# Related Technical Documentation

| Document | Description |
|----------|-------------|
| [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) | Integration model and operational boundaries |
| [Meta_Review_QA.md](../07-security/Meta_Review_QA.md) | Meta reviewer Q&A (DOC-0004) |
| [WHATSAPP_EMBEDDED_SIGNUP.md](../05-integrations/WHATSAPP_EMBEDDED_SIGNUP.md) | Embedded Signup implementation guide |

---

# Summary

Atlas Platform requests Meta permissions only to connect customer-owned WhatsApp Business Accounts, receive and send policy-compliant business messages, and maintain authorized integrations.

Every permission maps to a specific operational capability requested by the customer organization. Atlas does not use Meta permissions for spam, unrelated social features, or cross-tenant access.

Customer authorization through Embedded Signup remains the foundation of all Meta permission usage on Atlas Platform.

---

# Appendix A – Meta Permission Reference

This appendix should list the exact Meta permissions currently requested by the Atlas Meta App so the documentation matches the Meta Developer Dashboard exactly.

| Permission | Purpose |
|------------|---------|
| `whatsapp_business_management` | Allows Atlas to connect and manage customer-authorized WhatsApp Business Accounts through Meta's official Embedded Signup process. |
| `whatsapp_business_messaging` | Allows Atlas to send and receive WhatsApp Business messages on behalf of organizations that have explicitly authorized Atlas. |
| `public_profile` | Provides basic user identity information required for secure authentication during Facebook Login. Atlas requests only the standard profile information exposed by this permission. |

> Atlas follows the principle of least privilege. The permissions listed above represent the complete set of Meta permissions currently requested by the Atlas Platform for its WhatsApp Business integration. No additional permissions are requested for unrelated functionality.
