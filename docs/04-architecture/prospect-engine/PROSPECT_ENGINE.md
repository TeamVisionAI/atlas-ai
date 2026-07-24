# Prospect Engine

## AI Summary

The Prospect Engine is Atlas's platform-independent core business object. One Prospect equals one truth: every interaction, appointment, and lifecycle transition belongs to exactly one Prospect record regardless of channel. The engine owns identity, status, timeline, and business rules; communication platforms are connectors that translate external events into Atlas standard events. Atlas must never depend on WhatsApp, Facebook, Instagram, Email, SMS, or any single channel.

## Purpose

Define the architectural center of Atlas: the **Prospect Engine** — the system responsible for representing, evolving, and recording everything known about a person or lead across their entire relationship with Team Vision.

The Prospect Engine is the **core business object** of Atlas. All product surfaces (Prospect Center, Mission Control, Knowledge Hub operations, AI agents) read and write through this engine—not through channel APIs.

## Responsibilities

| Area | Responsibility |
|------|----------------|
| **Identity** | Canonical Prospect record; deduplication and merge rules |
| **Lifecycle** | State machine: New Lead → … → Client / Recruit / Lost |
| **Timeline** | Append-only chronological history per Prospect |
| **Relationships** | Agent assignment, office, sponsor, upline (future) |
| **Events** | Accept normalized Atlas events from connectors and internal services |
| **Business rules** | Enforce BR-XXX at transitions (via Business Rules Engine) |
| **AI context** | Attach insights and recommendations to Prospect, not to channel threads |

## Boundaries

### Inside the Prospect Engine

- Prospect CRUD (create, read, update — no silent delete)
- Lifecycle transitions and validation
- Timeline append and query
- Assignment and ownership
- Tags, custom fields, lead source attribution
- Correlation of multi-channel identities to one Prospect

### Outside the Prospect Engine (connectors & services)

- WhatsApp / Messenger / Instagram API calls
- Email SMTP / provider APIs
- SMS gateways
- Calendar provider OAuth (Google, etc.)
- Zoom / Meet / Teams meeting APIs
- Webhook signature verification
- Message transport and delivery retries

**Rule:** The Prospect Engine **never** communicates directly with third-party APIs. Connectors translate; the engine persists.

## Goals

1. **One Prospect = One Truth** — single canonical record per person in Atlas
2. **Platform independence** — swap or add channels without redesigning core domain
3. **Complete history** — every interaction appears on the Prospect timeline
4. **Business rule alignment** — lifecycle respects [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md)
5. **AI-ready context** — agents read Prospect + timeline, not raw channel payloads
6. **Auditability** — who changed what, when, and why

## Non-Goals

- Replacing the Workflow Engine (prospect lifecycle complements workflow milestones)
- Storing raw channel credentials (Organization / connector config)
- Building a CRM replacement for non-recruiting use cases (Team Vision scope only)
- Real-time bi-directional sync with external CRMs (Phase 1 architecture only)
- Implementation in Sprint 14.0 (documentation and design only)

## Core Principles

### 1. One Prospect = One Truth

There is exactly one authoritative Prospect record per person in Atlas. Duplicate leads merge into one Prospect. Channel-specific IDs (WhatsApp number, Messenger PSID, email) are **attributes**, not separate business objects.

### 2. Every interaction belongs to one Prospect

Messages, calls, appointments, notes, AI recommendations, and system events all attach to a single `prospectId`. No orphan events. No channel-only threads without a Prospect.

### 3. The Prospect exists independently of communication channels

A Prospect can exist before any message is sent (CSV import, manual entry, website form). Removing or disabling a connector does not delete the Prospect or their history.

### 4. Connectors are adapters, not owners

Connectors receive webhooks, normalize payloads, and emit Atlas standard events. See [COMMUNICATION_CONNECTORS.md](./COMMUNICATION_CONNECTORS.md).

### 5. Timeline is immutable history

Corrections append new events; history is not rewritten. See [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md).

### 6. Lifecycle is explicit

Status changes follow [PROSPECT_LIFECYCLE.md](./PROSPECT_LIFECYCLE.md). Automatic and manual transitions are documented and rule-governed.

## Related Documents

| Document | Purpose |
|----------|---------|
| [PROSPECT_MODEL.md](./PROSPECT_MODEL.md) | Entity schema and sections |
| [PROSPECT_LIFECYCLE.md](./PROSPECT_LIFECYCLE.md) | State machine |
| [COMMUNICATION_CONNECTORS.md](./COMMUNICATION_CONNECTORS.md) | Channel adapter philosophy |
| [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md) | Chronological record |
| [BUSINESS_EVENTS.md](./BUSINESS_EVENTS.md) | Official event language |
| [PROSPECT_PERMISSIONS.md](./PROSPECT_PERMISSIONS.md) | Roles, ownership, audit |
| [RFC-007-connector-contract.md](../../10-rfcs/RFC-007-connector-contract.md) | Connector interface |
| [EVENT_CATALOG.md](../../06-business/EVENT_CATALOG.md) | Standard event types |
| [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md) | Operational rules |

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Sprint 14.0 — Prospect Engine defined as platform-independent core |
| 2026-07-24 | Connectors translate; engine never calls third-party APIs directly |

## Status

Approved — Architecture only (Sprint 14.0)

## Version

1.0

## Owner

Atlas Engineering
