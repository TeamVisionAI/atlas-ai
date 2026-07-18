# Event Catalog

**Sprint:** 8A — Atlas Core Workflow Engine  
**Status:** Specification — pending documentation review  
**Related:** [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md), [MILESTONE_DEFINITIONS.md](./MILESTONE_DEFINITIONS.md)

---

## Purpose

Define **auditable, structured timeline events** for every workflow state transition (principle 19).

Events are **channel-agnostic**. WhatsApp, calendar, and UI write through services; the event engine persists facts only.

### Current vs target

| Today | Target |
|-------|--------|
| `conversation_logs` — inbound/outbound message text | Retain for messages |
| No workflow event types | Append-only **workflow_events** (table or JSON stream) |
| `logService.logConversation()` | Extended or parallel `eventEngine.emit()` |

---

## Event Envelope (Standard)

All events share:

```json
{
  "eventId": "uuid",
  "eventType": "ProspectAdvanced",
  "prospectPhone": "+1...",
  "timestamp": "ISO-8601",
  "actor": "ATLAS | AGENT:{userId} | SYSTEM",
  "milestoneBefore": "QUALIFICATION",
  "milestoneAfter": "INTERVIEW_SCHEDULED",
  "ownershipBefore": "AGENT",
  "ownershipAfter": "ATLAS",
  "payload": { },
  "correlationId": "optional-session-id"
}
```

---

## Event Definitions

### ProspectCreated

| Field | Value |
|-------|-------|
| **When** | New prospect record created |
| **Actor** | SYSTEM |
| **Payload** | `{ source, phone, createdAt }` |
| **Milestone** | → NEW_LEAD |

---

### GreetingSent

| Field | Value |
|-------|-------|
| **When** | First Atlas outbound greeting delivered |
| **Actor** | ATLAS |
| **Payload** | `{ messageId, channel, templateId? }` |
| **Milestone** | NEW_LEAD → GREETING_SENT |

---

### MessageReceived

| Field | Value |
|-------|-------|
| **When** | Inbound prospect message processed |
| **Actor** | SYSTEM |
| **Payload** | `{ messageId, channel, bodyPreview, intent? }` |
| **Notes** | Existing `conversation_logs` row; link via `messageId` |

---

### MessageSent

| Field | Value |
|-------|-------|
| **When** | Outbound message sent (Atlas or agent via action engine) |
| **Actor** | ATLAS or AGENT |
| **Payload** | `{ messageId, channel, bodyPreview, actionId? }` |

---

### AgentNoteAdded

| Field | Value |
|-------|-------|
| **When** | Agent adds a note via Mission Control / workspace composer (Sprint 10.2b) |
| **Actor** | AGENT |
| **Payload** | `{ conversationLogId, noteText, bodyPreview, channel }` |
| **Correlation** | `conversation_log:{conversation_logs.id}` — idempotent dual-write from `logService` |
| **Notes** | Detected by `[Agent note]` prefix on the originating log row |

---

### QualificationUpdated

| Field | Value |
|-------|-------|
| **When** | Prospect field(s) updated during qualification |
| **Actor** | ATLAS or AGENT |
| **Payload** | `{ fields: { name: value }, missingFieldsAfter: [] }` |

---

### ConversationStalled

| Field | Value |
|-------|-------|
| **When** | BR-034 — 24h no prospect reply after Atlas outbound |
| **Actor** | SYSTEM |
| **Payload** | `{ lastAtlasOutboundAt, stallDetectedAt, recommendedAction: "call" }` |
| **Side effects** | ownership → AGENT, needsHumanAttention → true |

---

### WorkflowOwnershipChanged

| Field | Value |
|-------|-------|
| **When** | Any ownership transition |
| **Actor** | SYSTEM or AGENT |
| **Payload** | `{ reason: "BR-034" | "BR-035" | "BR-015" | "interview_scheduled" | "closed", note? }` |

---

### HumanCallStarted

| Field | Value |
|-------|-------|
| **When** | Agent executes `call` action from Mission Control |
| **Actor** | AGENT |
| **Payload** | `{ actionId: "call", startedAt }` |

---

### HumanCallCompleted

| Field | Value |
|-------|-------|
| **When** | Agent completes call workflow (save after call) |
| **Actor** | AGENT |
| **Payload** | `{ duration?, notes?, capturedFields? }` |

---

### ProspectAdvanced

| Field | Value |
|-------|-------|
| **When** | BR-035 or valid automated transition changes milestone |
| **Actor** | AGENT or ATLAS |
| **Payload** | `{ targetMilestone, validationResult, skippedQuestions?: false }` |

---

### InterviewScheduled

| Field | Value |
|-------|-------|
| **When** | Interview datetime first set and confirmed |
| **Actor** | ATLAS or AGENT |
| **Payload** | `{ interviewDateTime, interviewType, email?, calendarEventId? }` |
| **Automated follow-up** | Confirmation, details, reminders (principle 16) |

---

### InterviewRescheduled

| Field | Value |
|-------|-------|
| **When** | Existing interview moved to new slot |
| **Actor** | ATLAS or AGENT |
| **Payload** | `{ previousDateTime, newDateTime, reason? }` |

---

### InterviewCompleted

| Field | Value |
|-------|-------|
| **When** | Interview end time passed (system detection) |
| **Actor** | SYSTEM |
| **Payload** | `{ interviewDateTime, detectedAt }` |

---

### InterviewResultRecorded

| Field | Value |
|-------|-------|
| **When** | Workflow Gate or BR-035 saves outcome |
| **Actor** | AGENT |
| **Payload** | `{ outcome: "recruited" | "no_show" | "not_interested" | ..., followUpDate? }` |

---

### FollowUpScheduled

| Field | Value |
|-------|-------|
| **When** | Follow-up date set |
| **Actor** | AGENT or ATLAS |
| **Payload** | `{ followUpDate, reason }` |

---

### ReminderScheduled

| Field | Value |
|-------|-------|
| **When** | Reminder job registered |
| **Actor** | ATLAS |
| **Payload** | `{ reminderType, fireAt, interviewDateTime? }` |

---

### ReminderSent

| Field | Value |
|-------|-------|
| **When** | Reminder message delivered |
| **Actor** | ATLAS |
| **Payload** | `{ reminderType, messageId }` |

---

### WorkflowResumed

| Field | Value |
|-------|-------|
| **When** | Automated progression restarts after pause |
| **Actor** | SYSTEM |
| **Payload** | `{ resumeFromMilestone, trigger: "BR-035" | "prospect_reply" | "follow_up_due" }` |

---

### WorkflowPaused

| Field | Value |
|-------|-------|
| **When** | Automated progression stopped |
| **Actor** | SYSTEM |
| **Payload** | `{ reason: "BR-034" | "AGENT" | "awaiting_interview" }` |

---

### ProspectClosed

| Field | Value |
|-------|-------|
| **When** | Terminal close applied |
| **Actor** | AGENT or ATLAS |
| **Payload** | `{ closeReason, previousMilestone }` |
| **Side effects** | ownership → CLOSED |

---

### DoNotContactApplied

| Field | Value |
|-------|-------|
| **When** | DNC flag set |
| **Actor** | AGENT |
| **Payload** | `{ reason, requestedAt }` |
| **Side effects** | ownership → CLOSED, milestone → DO_NOT_CONTACT |

---

## Event × Milestone Matrix

| Event | Typical milestones |
|-------|-------------------|
| ProspectCreated | NEW_LEAD |
| GreetingSent | NEW_LEAD, GREETING_SENT |
| QualificationUpdated | QUALIFICATION |
| ConversationStalled | GREETING_SENT, QUALIFICATION, INTERVIEW_READY |
| InterviewScheduled | INTERVIEW_READY → INTERVIEW_SCHEDULED |
| InterviewCompleted | INTERVIEW_DUE → INTERVIEW_COMPLETED |
| InterviewResultRecorded | INTERVIEW_RESULT_PENDING |
| ProspectAdvanced | Any transition |
| ProspectClosed | CLOSED |
| DoNotContactApplied | DO_NOT_CONTACT |

---

## Implementation Notes

1. **Idempotency:** `ConversationStalled` should not duplicate for the same stall episode (key: `prospectPhone + lastAtlasOutboundAt`).
2. **Migration:** Backfill not required for 8A; new events forward-only.
3. **UI timeline:** Mission Control timeline tab can merge message logs + workflow events by timestamp.
4. **Separation:** Event engine has no UI imports; no WhatsApp templates (principle 20).

---

## Storage Proposal (Phase 8A.1)

Option A — extend Supabase:

```sql
workflow_events (
  id uuid PK,
  prospect_phone text,
  event_type text,
  payload jsonb,
  created_at timestamptz,
  actor text
)
```

Option B — JSON append log per prospect in existing store (interim).

**Recommendation:** Option A for queryability (Mission Control priority, audit).
