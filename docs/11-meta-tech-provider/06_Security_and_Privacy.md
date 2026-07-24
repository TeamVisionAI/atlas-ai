# Atlas Platform

## Security and Privacy

**Document ID:** MTP-006  
**Version:** 1.0  
**Status:** Draft for Meta Tech Provider Review  
**Owner:** Atlas Platform Team  

**Related Documents:**
- [MTP-001 Executive Summary](./01_Executive_Summary.md)
- [MTP-002 Platform Overview](./02_Platform_Overview.md)
- [MTP-003 System Architecture](./03_System_Architecture.md)
- [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md)
- [MTP-005 Data Flow](./05_Data_Flow.md)

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document describes Atlas Platform security and privacy practices for Meta Tech Provider review.

It explains how Atlas protects organization data, secures integrations with Meta's WhatsApp Business Platform, and handles customer information in a policy-compliant manner.

---

# Security Principles

Atlas applies security by design across the platform:

| Principle | Description |
|-----------|-------------|
| Customer ownership | Organizations retain control of their data and Meta business assets |
| Least privilege | Access and permissions limited to what is required |
| Defense in depth | Security controls at transport, application, and data layers |
| Tenant isolation | Organization data is logically separated |
| Auditability | Operational and communication events are logged |

These principles align with [MTP-001 Executive Summary](./01_Executive_Summary.md) Platform Philosophy.

---

# Authentication and Authorization

| Control | Description |
|---------|-------------|
| User authentication | Secure login for organization staff |
| Session management | Authenticated sessions for application access |
| Role-based access | Permissions scoped by organization role |
| Organization context | Every authorized action is tied to an organization tenant |

Atlas application access is restricted to authenticated organization users. Public visitors do not access the private operational workspace without authorization.

---

# Data Protection

Atlas protects organization and customer data through:

- Organization-scoped data access on all tenant operations
- Server-side storage of sensitive integration credentials
- No exposure of one organization's data to another organization
- Controlled API access with authorization checks

Data collection and use are limited to legitimate business operations authorized by the customer organization. See [MTP-005 Data Flow](./05_Data_Flow.md) for how data moves through the platform.

---

# Encryption and Transport Security

| Layer | Practice |
|-------|----------|
| Transport | HTTPS for web application and webhook traffic |
| Credentials | Integration tokens stored server-side; encrypted at rest where configured |
| Secrets | Meta app secrets and access tokens never exposed to client browsers |
| Transmission | Encrypted communication between Atlas services and Meta APIs |

---

# Meta Integration Security

WhatsApp and Meta-related security controls include:

| Control | Description |
|---------|-------------|
| Embedded Signup | Customer authorization through Meta's official onboarding UI |
| Webhook validation | Meta webhook signatures verified before processing |
| Scoped credentials | WABA tokens isolated per organization |
| Permission minimization | Meta permissions limited to required WhatsApp Business capabilities |
| Revocation support | Customers may revoke authorization through Meta controls |

See [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) for integration boundaries and compliance.

---

# Privacy Practices

Atlas respects customer and end-user privacy:

- Data is collected only as needed to provide authorized platform services
- Organizations control their customer records and conversation history within their workspace
- Meta business messaging data is handled in accordance with Meta Platform policies
- Privacy practices are documented for compliance review

For operational privacy and data-handling detail, see [Privacy and Data Handling](../07-security/Privacy_and_Data_Handling.md) (DOC-0003).

Public policy pages (where published by the platform operator):

| Policy | URL |
|--------|-----|
| Privacy Policy | `https://teamvisionfinancial.com/privacy` |
| Terms of Service | `https://teamvisionfinancial.com/terms` |
| Legal | `https://teamvisionfinancial.com/legal` |

---

# Access Control and Monitoring

| Practice | Description |
|----------|-------------|
| Role-based permissions | Staff access aligned to organization roles |
| Audit logging | Workflow and communication events recorded for accountability |
| Webhook rejection | Invalid or unsigned Meta webhook requests are not processed |
| Credential rotation | Tokens rotated or replaced when required by policy or revocation |

---

# Data Retention

Retention of organization data follows:

- Organization operational needs and configured workspace policies
- Applicable legal and contractual requirements
- Meta Platform requirements for messaging-related data

When an organization disconnects a Meta integration, Atlas stops using revoked credentials. Historical records may remain in the organization's workspace subject to retention policy.

---

# Compliance Alignment

Atlas security and privacy design supports compliance with Meta Platform requirements by:

- Using official Meta APIs and Embedded Signup
- Validating webhook requests
- Maintaining customer ownership of Meta business assets
- Applying least-privilege permission requests
- Protecting cross-tenant isolation

---

# Related Technical Documentation

| Document | Description |
|----------|-------------|
| [Privacy_and_Data_Handling.md](../07-security/Privacy_and_Data_Handling.md) | Detailed privacy and data handling (DOC-0003) |
| [Meta_Review_QA.md](../07-security/Meta_Review_QA.md) | Meta reviewer Q&A (DOC-0004) |
| [MTP-005 Data Flow](./05_Data_Flow.md) | Data flow and tenant isolation |
| [MTP-004 WhatsApp Business Integration](./04_WhatsApp_Business_Integration.md) | WhatsApp integration security boundaries |

---

# Summary

Atlas Platform protects organization data through authentication, authorization, encryption, tenant isolation, and validated Meta integrations.

Security and privacy are foundational to the product — not add-on features. Organizations retain ownership of their business assets and customer relationships while Atlas provides secure operational software on their behalf.
