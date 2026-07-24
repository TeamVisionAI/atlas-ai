# Atlas Business Events

## AI Summary

Business Events are the official language of Atlas: every meaningful business action produces exactly one standardized event with a fixed schema. Events drive the Prospect timeline, AI, dashboards, notifications, automations, reporting, and Mission Control. Connectors and services are producers; timeline and downstream engines are consumers. Architecture only — no implementation in Sprint 14.0.1.

## Purpose

Business Events are the **official language of Atlas**.

Every meaningful business action produces **exactly one** standardized event. Events are channel-agnostic, Prospect-scoped, and append-only.

Business events drive:

- **Timeline** — chronological Prospect history
- **AI** — context, recommendations, risk/opportunity detection
- **Dashboard** — Executive and operational metrics
- **Notifications** — agent and manager alerts
- **Automations** — lifecycle transitions, reminders, workflows
- **Reporting** — funnel, conversion, activity analytics
- **Mission Control** — queues and work routing

**Rule:** If an action matters to the business, it must emit a Business Event. Undocumented side effects are not approved behavior.

## Status

Approved — Architecture only (Sprint 14.0.1)

---

## Event schema

Every Business Event conforms to this envelope:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `eventId` | UUID | Yes | Unique event identifier |
| `eventType` | string | Yes | Canonical type (snake_case), e.g. `prospect_created` |
| `timestamp` | ISO-8601 | Yes | When the action occurred (UTC) |
| `prospectId` | UUID | Yes* | Target Prospect (*system events may use null + batch ref) |
| `actor` | string | Yes | `SYSTEM`, `ATLAS`, `AGENT:{userId}`, `CONNECTOR:{id}`, `API:{clientId}` |
| `channel` | string | No | `whatsapp`, `messenger`, `email`, `manual`, `api`, … |
| `payload` | object | Yes | Event-specific data (typed per eventType) |
| `version` | string | Yes | Schema version, e.g. `1.0` |
| `correlationId` | string | No | Session, campaign, or import batch ID |
| `organizationId` | UUID | Yes | Team Vision org scope |

### Optional envelope fields

| Field | Description |
|-------|-------------|
| `lifecycleStateAtEvent` | Prospect lifecycle state when event recorded |
| `summary` | One-line human text for feeds |
| `parentEventId` | Links correction or follow-up to prior event |
| `permissionContext` | Role / actor permissions at time of action |

### Versioning

- Breaking payload changes increment major version
- Consumers must tolerate unknown `eventType` values (log + skip display)
- Producers must not emit duplicate `eventId`

---

## Event catalog (summary)

| Category | Event types |
|----------|-------------|
| **Lead** | `prospect_created`, `prospect_updated`, `prospect_archived`, `prospect_merged` |
| **Communication** | `message_received`, `message_sent`, `call_started`, `call_completed`, `email_sent`, `email_opened` |
| **Appointment** | `appointment_created`, `appointment_rescheduled`, `reminder_sent`, `interview_completed` |
| **Recruiting** | `license_started`, `license_completed`, `recruit_joined`, `promotion_achieved` |
| **Sales** | `needs_analysis_completed`, `policy_submitted`, `policy_issued`, `policy_delivered`, `policy_cancelled` |
| **AI** | `ai_recommendation_generated`, `ai_summary_updated`, `risk_detected`, `opportunity_detected` |
| **System** | `import_completed`, `export_completed`, `connector_synced`, `error_logged` |

Aligns with [COMMUNICATION_CONNECTORS.md](./COMMUNICATION_CONNECTORS.md) and [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md).

---

## Lead events

### prospect_created

| | |
|--|--|
| **Purpose** | Record that a new Prospect entered Atlas |
| **Producer** | Manual Entry, CSV Import, API, Connectors (first touch) |
| **Consumer** | Timeline, Mission Control (new lead queue), Dashboard, Automations |
| **Required fields** | `prospectId`, `leadSource`, `createdBy` (actor) |
| **Optional fields** | `channel`, `importBatchId`, `referrerProspectId` |
| **Business rules** | Deduplication rules before create; BR alignment for office assignment |
| **Timeline behavior** | First entry; displays as "Lead created" |

### prospect_updated

| | |
|--|--|
| **Purpose** | Structural or contact field change on Prospect |
| **Producer** | Prospect Center, Quick Capture, API, Connectors |
| **Consumer** | Timeline, AI (refresh context), Audit |
| **Required fields** | `changedFields[]`, `previousValues` (redacted PII in logs) |
| **Optional fields** | `reason`, `channel` |
| **Business rules** | Permission check per [PROSPECT_PERMISSIONS.md](./PROSPECT_PERMISSIONS.md) |
| **Timeline behavior** | Summary lists changed field names; full diff in payload |

### prospect_archived

| | |
|--|--|
| **Purpose** | Soft-remove Prospect from active pipelines |
| **Producer** | Agent, Administrator |
| **Consumer** | Timeline, Mission Control (remove from queues), Reporting |
| **Required fields** | `archivedBy`, `archiveReason` |
| **Optional fields** | `scheduledPurgeAt` |
| **Business rules** | Only roles with archive permission; not same as Lost lifecycle |
| **Timeline behavior** | "Prospect archived" — hidden from default views |

### prospect_merged

| | |
|--|--|
| **Purpose** | Combine duplicate Prospects into one truth |
| **Producer** | Administrator, RVP (policy TBD) |
| **Consumer** | Timeline (both records), Audit, Reporting |
| **Required fields** | `survivorProspectId`, `mergedProspectId`, `mergedBy` |
| **Optional fields** | `mergeStrategy`, `fieldResolutions` |
| **Business rules** | Survivor retains history from both; merged ID redirects |
| **Timeline behavior** | Entry on survivor: "Merged with {id}" |

---

## Communication events

### message_received

| | |
|--|--|
| **Purpose** | Inbound message on any channel |
| **Producer** | Communication Connectors |
| **Consumer** | Timeline, Conversation Engine, Lifecycle (auto transitions), AI |
| **Required fields** | `channel`, `channelMessageId`, `contentSummary` |
| **Optional fields** | `mediaType`, `providerPayloadRef` |
| **Business rules** | BR-011 – BR-014 (response via conversation engine, not event store) |
| **Timeline behavior** | Inbound bubble / summary line |

### message_sent

| | |
|--|--|
| **Purpose** | Outbound message delivered or queued |
| **Producer** | Connectors, Conversation Engine |
| **Consumer** | Timeline, Dashboard, Automations |
| **Required fields** | `channel`, `deliveryStatus`, `contentSummary` |
| **Optional fields** | `templateId`, `failureReason` |
| **Business rules** | One event per send attempt (failed sends may emit separate or status update) |
| **Timeline behavior** | Outbound entry |

### call_started / call_completed

| | |
|--|--|
| **Purpose** | Voice interaction boundaries |
| **Producer** | Phone connector, manual log (agent) |
| **Consumer** | Timeline, Activity metrics, Lifecycle |
| **Required fields** | `direction` (inbound/outbound); completed adds `durationSec`, `outcome` |
| **Optional fields** | `recordingRef` (policy-governed) |
| **Business rules** | Manual log requires agent permission |
| **Timeline behavior** | "Call started" / "Call completed (Xm)" |

### email_sent / email_opened

| | |
|--|--|
| **Purpose** | Email delivery and engagement |
| **Producer** | Email connector |
| **Consumer** | Timeline, Automations, Reporting |
| **Required fields** | `subjectSummary`, `recipientHash` or `emailRef` |
| **Optional fields** | `campaignId`, `openCount` |
| **Business rules** | PII minimization in payload |
| **Timeline behavior** | "Email sent" / "Email opened" |

---

## Appointment events

### appointment_created

| | |
|--|--|
| **Purpose** | Interview or meeting scheduled |
| **Producer** | Scheduling Engine, Calendar Connector, Manual |
| **Consumer** | Timeline, Lifecycle, Executive Dashboard, Notifications |
| **Required fields** | `appointmentId`, `scheduledStart`, `scheduledEnd`, `appointmentType` |
| **Optional fields** | `calendarEventRef`, `officeId` |
| **Business rules** | BR-001 – BR-007, BR-006 capacity |
| **Timeline behavior** | "Interview scheduled {datetime}" |

### appointment_rescheduled

| | |
|--|--|
| **Purpose** | Time change on existing appointment |
| **Producer** | Scheduling Engine, Agent, Prospect (via channel) |
| **Consumer** | Timeline, Notifications, Dashboard |
| **Required fields** | `appointmentId`, `previousStart`, `newStart`, `reason` |
| **Optional fields** | `rescheduledBy` |
| **Business rules** | Capacity re-check on new slot |
| **Timeline behavior** | "Appointment rescheduled" |

### reminder_sent

| | |
|--|--|
| **Purpose** | Automated or manual reminder delivered |
| **Producer** | Automation / Conversation Engine |
| **Consumer** | Timeline, Reporting |
| **Required fields** | `appointmentId`, `reminderType`, `channel` |
| **Optional fields** | `templateId` |
| **Business rules** | Rate limits; opt-out respect |
| **Timeline behavior** | "Reminder sent" |

### interview_completed

| | |
|--|--|
| **Purpose** | Interview marked complete |
| **Producer** | Agent, Calendar Connector, Automation |
| **Consumer** | Timeline, Lifecycle, Mission Control |
| **Required fields** | `appointmentId`, `completedAt`, `outcome` (pending/success/no_show) |
| **Optional fields** | `notesRef` |
| **Business rules** | Drives lifecycle → Interview Completed |
| **Timeline behavior** | "Interview completed" |

---

## Recruiting events

### license_started / license_completed

| | |
|--|--|
| **Purpose** | Licensing milestone tracking |
| **Producer** | Manual (agent/admin), future LMS connector |
| **Consumer** | Timeline, Reporting, Recruiting dashboard |
| **Required fields** | `licenseType`, `status` |
| **Optional fields** | `licenseNumberRef`, `completedAt` |
| **Business rules** | Role-gated updates |
| **Timeline behavior** | Milestone entries |

### recruit_joined

| | |
|--|--|
| **Purpose** | Prospect converted to recruit |
| **Producer** | Agent, Administrator |
| **Consumer** | Timeline, Lifecycle, Reporting |
| **Required fields** | `joinedAt`, `officeId`, `sponsorAgentId` |
| **Optional fields** | `contractRef` |
| **Business rules** | Terminal lifecycle path |
| **Timeline behavior** | "Recruit joined" |

### promotion_achieved

| | |
|--|--|
| **Purpose** | Career milestone within Team Vision structure |
| **Producer** | Administrator, RVP |
| **Consumer** | Timeline, Reporting |
| **Required fields** | `promotionType`, `effectiveDate` |
| **Optional fields** | `previousRole`, `newRole` |
| **Business rules** | Admin/RVP only |
| **Timeline behavior** | "Promotion achieved" |

---

## Sales events

### needs_analysis_completed

| | |
|--|--|
| **Purpose** | Discovery / needs analysis finished |
| **Producer** | Agent, Atlas workflow |
| **Consumer** | Timeline, Lifecycle, AI |
| **Required fields** | `completedAt`, `productLines[]` |
| **Optional fields** | `analysisRef` |
| **Business rules** | May gate policy submission |
| **Timeline behavior** | "Needs analysis completed" |

### policy_submitted / policy_issued / policy_delivered

| | |
|--|--|
| **Purpose** | Policy pipeline milestones |
| **Producer** | Agent, Admin, future carrier connector |
| **Consumer** | Timeline, Lifecycle (Client), Dashboard, Reporting |
| **Required fields** | `policyRef`, `productType`, `status` |
| **Optional fields** | `carrierId`, `premiumBand` |
| **Business rules** | Client lifecycle alignment |
| **Timeline behavior** | Sequential policy milestones |

### policy_cancelled

| | |
|--|--|
| **Purpose** | Policy terminated |
| **Producer** | Admin, carrier feed (future) |
| **Consumer** | Timeline, Reporting, Retention automations |
| **Required fields** | `policyRef`, `cancelledAt`, `reason` |
| **Optional fields** | `refundStatus` |
| **Business rules** | Audit required |
| **Timeline behavior** | "Policy cancelled" |

---

## AI events

### ai_recommendation_generated

| | |
|--|--|
| **Purpose** | Atlas AI suggested an action (no automatic execution) |
| **Producer** | Atlas AI / Semantic Engine |
| **Consumer** | Timeline, Prospect Workspace, Mission Control hints |
| **Required fields** | `recommendationType`, `summary`, `confidence` |
| **Optional fields** | `suggestedAction`, `expiresAt` |
| **Business rules** | Does not change lifecycle without rule approval |
| **Timeline behavior** | "AI recommendation: …" |

### ai_summary_updated

| | |
|--|--|
| **Purpose** | Rolling AI summary refreshed for Prospect |
| **Producer** | Atlas AI |
| **Consumer** | Prospect model `AI Insights`, Copilot context |
| **Required fields** | `summaryText`, `generatedAt` |
| **Optional fields** | `supersedesInsightId` |
| **Business rules** | Not a substitute for timeline facts |
| **Timeline behavior** | Optional lightweight entry or insight-only store |

### risk_detected / opportunity_detected

| | |
|--|--|
| **Purpose** | AI flag for attention or upside |
| **Producer** | Atlas AI, Analytics |
| **Consumer** | Notifications, Mission Control priority, Dashboard |
| **Required fields** | `flagType`, `severity`, `summary` |
| **Optional fields** | `recommendedAction` |
| **Business rules** | Human review for high severity |
| **Timeline behavior** | "Risk detected" / "Opportunity detected" |

---

## System events

### import_completed / export_completed

| | |
|--|--|
| **Purpose** | Batch data operations finished |
| **Producer** | Import/Export service |
| **Consumer** | Audit, Admin notifications, Reporting |
| **Required fields** | `batchId`, `recordCount`, `status` |
| **Optional fields** | `errorCount`, `fileRef` |
| **Business rules** | Export permission-gated |
| **Timeline behavior** | Org-level or per-Prospect if row-level |

### connector_synced

| | |
|--|--|
| **Purpose** | Connector health / sync cycle |
| **Producer** | Connectors |
| **Consumer** | Ops dashboard, Audit |
| **Required fields** | `connectorId`, `syncStatus`, `durationMs` |
| **Optional fields** | `recordsProcessed` |
| **Business rules** | No Prospect mutation without standard events |
| **Timeline behavior** | Typically org-level, not Prospect timeline |

### error_logged

| | |
|--|--|
| **Purpose** | Operational failure recorded |
| **Producer** | Any service |
| **Consumer** | Ops, Audit, optional Prospect timeline if Prospect-scoped |
| **Required fields** | `errorCode`, `message`, `service` |
| **Optional fields** | `prospectId`, `stackRef` |
| **Business rules** | Never expose secrets in payload |
| **Timeline behavior** | Prospect-scoped errors appear on timeline |

---

## Producer / consumer matrix

| Consumer | Subscribes to |
|----------|---------------|
| **Prospect Timeline** | All Prospect-scoped events |
| **Lifecycle Engine** | Lead, Communication, Appointment, Recruiting, Sales subset |
| **Conversation Engine** | `message_*`, `ai_recommendation_*` |
| **Mission Control** | Lead, Appointment, AI risk/opportunity |
| **Executive Dashboard** | Aggregates only — no raw store |
| **Notification Service** | Appointments, AI flags, assignments |
| **Reporting** | All categories (denormalized) |

---

## Related Documents

- [PROSPECT_ENGINE.md](./PROSPECT_ENGINE.md)
- [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md)
- [COMMUNICATION_CONNECTORS.md](./COMMUNICATION_CONNECTORS.md)
- [PROSPECT_PERMISSIONS.md](./PROSPECT_PERMISSIONS.md)
- [EVENT_CATALOG.md](../../06-business/EVENT_CATALOG.md)
- [RFC-010-event-bus-principles.md](../../10-rfcs/RFC-010-event-bus-principles.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Business Events are the official language of Atlas (Sprint 14.0.1) |
| 2026-07-24 | One meaningful action = one standardized event |
