# Prospect Model

## AI Summary

The Prospect entity is Atlas's canonical person record: identity, contacts, lead source, channel links, lifecycle status, agent assignment, appointments, activities, timeline reference, AI insights, tags, and custom fields. Channel IDs are attributes on the Prospect, not separate records. This model is platform-independent and designed before any Sprint 14 implementation.

## Purpose

Define the **Prospect entity** — data sections, semantics, and relationships — so all Atlas services share one domain vocabulary.

## Status

Approved — Architecture only (Sprint 14.0)

---

## Entity overview

```
Prospect
├── Identity
├── Contact Information
├── Lead Source
├── Communication Channels
├── Current Status
├── Assigned Agent
├── Appointments
├── Activities
├── Timeline (reference)
├── AI Insights
├── Tags
├── Custom Fields
└── Business Relationships
```

Each Prospect has a stable internal `prospectId` (UUID). External systems map via `Communication Channels`.

---

## Identity

**What it is:** The immutable core identifiers for this person in Atlas.

| Field (conceptual) | Description |
|--------------------|-------------|
| `prospectId` | Primary key (UUID) |
| `displayName` | Preferred name for UI |
| `legalName` | Optional full legal name |
| `createdAt` | When Prospect entered Atlas |
| `updatedAt` | Last structural update |
| `organizationId` | Team Vision org scope |
| `mergedIntoId` | If merged, points to surviving Prospect |

**Why it matters:** Deduplication, merge, and cross-channel correlation all anchor here. Identity survives channel changes.

---

## Contact Information

**What it is:** Reachable contact methods — not tied to a single platform.

| Field (conceptual) | Description |
|--------------------|-------------|
| `primaryPhone` | E.164 preferred |
| `secondaryPhone` | Optional |
| `email` | Primary email |
| `secondaryEmail` | Optional |
| `preferredLanguage` | e.g. `es`, `en` |
| `timezone` | IANA timezone |
| `address` | Optional structured address |

**Why it matters:** Scheduling (BR-001 – BR-007), outreach, and compliance. Phone is common but **not required** for Prospect existence (manual/CSV leads may be email-only).

---

## Lead Source

**What it is:** Attribution for how the Prospect entered Atlas.

| Field (conceptual) | Description |
|--------------------|-------------|
| `sourceType` | `referral`, `website`, `social`, `event`, `csv_import`, `manual`, `api`, `unknown` |
| `sourceDetail` | Campaign name, referrer name, URL, import batch ID |
| `sourceConnectorId` | Which connector first created the lead (if any) |
| `acquiredAt` | Timestamp of acquisition |

**Why it matters:** Reporting, funnel analytics, and routing rules (future).

---

## Communication Channels

**What it is:** Links between this Prospect and external platform identities. **Not** the message store.

| Field (conceptual) | Description |
|--------------------|-------------|
| `channelType` | `whatsapp`, `messenger`, `instagram`, `email`, `sms`, `phone`, `web_chat`, … |
| `channelUserId` | Platform-specific ID (PSID, wa_id, email hash, etc.) |
| `channelMetadata` | Opt-in status, thread IDs (opaque to engine) |
| `isPrimary` | Preferred channel for outbound |
| `lastSeenAt` | Last activity on this channel |

**Why it matters:** Connectors resolve inbound events → `prospectId`. Multiple channels can map to one Prospect. Removing WhatsApp does not remove the Prospect.

---

## Current Status

**What it is:** Position in the [lifecycle state machine](./PROSPECT_LIFECYCLE.md).

| Field (conceptual) | Description |
|--------------------|-------------|
| `lifecycleState` | e.g. `qualified`, `interview_scheduled` |
| `milestone` | Workflow milestone alignment (optional) |
| `ownership` | `ATLAS`, `AGENT`, `SYSTEM` |
| `stateEnteredAt` | When current state began |
| `previousState` | For audit / rollback context |

**Why it matters:** Mission Control queues, Prospect Center filters, and business rules all key off status.

---

## Assigned Agent

**What it is:** Human ownership for judgment and handoff (BR-015 – BR-017).

| Field (conceptual) | Description |
|--------------------|-------------|
| `assignedAgentId` | Atlas user ID |
| `assignedAt` | Assignment timestamp |
| `assignedBy` | `SYSTEM`, `ATLAS`, `AGENT:{id}` |
| `assignmentReason` | Optional note |

**Why it matters:** Recruiter presence (BR-008 – BR-010), handoff, and accountability.

---

## Appointments

**What it is:** Scheduled interactions linked to the Prospect (not the calendar provider).

| Field (conceptual) | Description |
|--------------------|-------------|
| `appointmentId` | Internal ID |
| `type` | `interview`, `follow_up`, `orientation`, … |
| `scheduledStart` / `scheduledEnd` | ISO-8601 |
| `status` | `scheduled`, `confirmed`, `completed`, `no_show`, `cancelled` |
| `location` | Office, video link reference, phone |
| `calendarEventRef` | Opaque connector reference (Google Calendar ID) |

**Why it matters:** Capacity engine (BR-006, BR-007), executive dashboard, timeline events.

---

## Activities

**What it is:** Structured work items and outcomes — distinct from raw timeline events.

| Field (conceptual) | Description |
|--------------------|-------------|
| `activityId` | Internal ID |
| `activityType` | `call`, `task`, `note`, `follow_up`, `outcome` |
| `summary` | Short description |
| `dueAt` | Optional |
| `completedAt` | Optional |
| `createdBy` | Actor |

**Why it matters:** Prospect Workspace, follow-up queues, agent task lists.

---

## Timeline

**What it is:** Reference to the append-only event stream for this Prospect.

| Field (conceptual) | Description |
|--------------------|-------------|
| `timelineId` | Same as `prospectId` or separate stream ID |
| `eventCount` | Denormalized count (optional) |
| `lastEventAt` | Latest activity timestamp |

**Why it matters:** Single query surface for full history. See [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md).

---

## AI Insights

**What it is:** Machine-generated context attached to the Prospect — not a substitute for timeline facts.

| Field (conceptual) | Description |
|--------------------|-------------|
| `insightId` | Internal ID |
| `insightType` | `qualification_score`, `next_best_action`, `risk_flag`, … |
| `content` | Structured JSON or summary text |
| `confidence` | 0–1 optional |
| `generatedAt` | Timestamp |
| `supersedesId` | Prior insight replaced |

**Why it matters:** Atlas Copilot and semantic conversation engine read insights; humans approve actions.

---

## Tags

**What it is:** Flexible labels for filtering and automation.

Examples: `hot-lead`, `bilingual`, `referral-vip`, `needs-callback`.

| Field (conceptual) | Description |
|--------------------|-------------|
| `tag` | String label |
| `addedAt` | Timestamp |
| `addedBy` | Actor |

---

## Custom Fields

**What it is:** Organization-defined schema extensions without core schema churn.

| Field (conceptual) | Description |
|--------------------|-------------|
| `fieldKey` | Stable key |
| `fieldValue` | String / number / boolean / JSON |
| `fieldType` | Type hint |

**Why it matters:** Team Vision-specific data without forking the engine.

---

## Business Relationships

**What it is:** Links to other domain objects and people.

| Relationship | Description |
|--------------|-------------|
| `referrerProspectId` | Who referred this lead |
| `sponsorAgentId` | Licensing sponsor (future) |
| `officeId` | Team Vision office |
| `relatedProspects` | Household / team links (future) |

**Why it matters:** Recruiting tree, office coverage (BR-001), reporting.

---

## Related Documents

- [PROSPECT_ENGINE.md](./PROSPECT_ENGINE.md)
- [PROSPECT_LIFECYCLE.md](./PROSPECT_LIFECYCLE.md)
- [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md)
- [RFC-006-organization-model.md](../../10-rfcs/RFC-006-organization-model.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Prospect model v1.0 — platform-independent sections defined |
