# Atlas Platform

## WhatsApp Business Integration

**Document ID:** MTP-004  
**Version:** 1.0  
**Status:** Draft for Meta Tech Provider Review  
**Owner:** Atlas Platform Team  

**Related Documents:**
- [MTP-001 Executive Summary](./01_Executive_Summary.md)
- [MTP-002 Platform Overview](./02_Platform_Overview.md)
- [MTP-003 System Architecture](./03_System_Architecture.md)
- [MTP-005 Data Flow](./05_Data_Flow.md)

---

This document is part of the official Atlas Platform documentation and the Meta Tech Provider Approval Portfolio.

---

# Purpose

This document describes how Atlas Platform integrates with Meta's WhatsApp Business Platform using official Meta APIs and the Embedded Signup process.

The objective is to explain the integration model, customer authorization process, permission usage, and operational boundaries while demonstrating compliance with Meta Platform requirements.

---

# Integration Overview

Atlas connects organizations to their own WhatsApp Business Accounts through Meta's official Embedded Signup experience.

Each organization independently authorizes Atlas to access only the business assets that belong to that organization.

Atlas never provisions, transfers, or assumes ownership of customer Meta assets.

---

# Embedded Signup

Atlas uses Meta's Embedded Signup flow to onboard organizations.

During this process:

1. The organization signs in with its Meta Business Account.
2. The organization reviews the permissions requested by Atlas.
3. The organization explicitly grants authorization.
4. Meta returns the authorization required for Atlas to access the approved business assets.
5. Atlas stores only the information required to provide the requested services.

Atlas does not bypass or replace Meta's authorization process.

---

# Customer Ownership

Customer ownership is a fundamental design principle.

Organizations always retain ownership of:

- Meta Business Account
- WhatsApp Business Account
- Phone Numbers
- Customer Conversations
- Business Assets

Atlas functions as an authorized software platform operating on behalf of the customer after approval.

Customers may revoke authorization at any time through Meta's controls.

---

# Permission Usage

Atlas requests only the permissions necessary to provide customer-requested functionality.

Permissions are used to support features such as:

- Sending business messages
- Receiving customer messages
- Webhook event processing
- Conversation management
- Operational workflow automation

Atlas follows the principle of least-privilege access and does not request permissions unrelated to its services.

---

# Webhook Integration

Atlas receives WhatsApp events through Meta Webhooks.

Typical events include:

- Incoming messages
- Message status updates
- Delivery confirmations
- Read receipts

Webhook events are validated before processing.

Only authorized events associated with connected customer organizations are accepted.

---

# Token Management

Atlas securely manages access credentials required for authorized integrations.

Security practices include:

- Secure storage
- Encrypted transmission
- Controlled access
- Credential rotation when required

Atlas does not expose customer credentials to other organizations or unauthorized users.

---

# Operational Boundaries

Atlas is an operational platform.

It is not designed for:

- Spam messaging
- Bulk unsolicited messaging
- Circumvention of Meta policies
- Unauthorized account access

All messaging activities occur on behalf of organizations that have completed Meta authorization.

---

# Compliance

Atlas is designed to comply with Meta Platform requirements by:

- Using official Meta APIs
- Respecting customer ownership
- Using Embedded Signup
- Following least-privilege principles
- Validating webhook requests
- Maintaining secure operational boundaries

---

# Summary

Atlas integrates with the WhatsApp Business Platform through Meta's official onboarding and API ecosystem.

The platform is designed to provide organizations with secure operational capabilities while preserving customer ownership, protecting business assets, and respecting Meta Platform policies.
