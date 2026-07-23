# Workflow Sequence Diagrams

**Sprint:** 8A.4 planning — developer documentation  
**Status:** Specification only — no implementation in this document  
**Related:** [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md), [MILESTONE_DEFINITIONS.md](../06-business/MILESTONE_DEFINITIONS.md), [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md), [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md), [ATLAS_GLOSSARY.md](../06-business/ATLAS_GLOSSARY.md)

---

## Legend

| Symbol | Meaning |
|--------|---------|
| **Owner** | Workflow ownership: `ATLAS`, `AGENT`, `WAITING_EVENT`, `CLOSED` |
| **Actor** | Who initiates the step: Atlas, Prospect, Agent, System |
| Events | Structured entries in `workflow_events` (see [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md)) |
| Message logs | `conversation_logs` rows (parallel to workflow events) |

### Ownership during sequences

```
ATLAS          → Atlas may send automated messages and advance workflow
AGENT          → Automated progression paused; human action required
WAITING_EVENT  → Paused until external trigger (reply, interview time, follow-up date)
CLOSED         → Terminal; no automated outreach
```

---

## 1. New Lead

**Milestone:** `NEW_LEAD`  
**Owner:** `ATLAS`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Prospect record created (webhook, recruit API, simulator, manual insert) |
| **Workflow owner** | `ATLAS` |
| **Events emitted** | `ProspectCreated` |
| **Business rule(s)** | BR-001 (schedule within 48h when ready), capacity rules BR-006/BR-007 |
| **Next milestone** | `GREETING_SENT` (after first Atlas outbound) or `QUALIFICATION` (if prospect replies first) |

```mermaid
sequenceDiagram
  autonumber
  participant Source as Lead Source
  participant Atlas as Atlas (ATLAS)
  participant DB as prospects
  participant Ev as eventEngine

  Source->>DB: Create prospect (phone, name)
  DB->>Ev: ProspectCreated
  Note over Atlas: Owner = ATLAS
  Atlas->>Atlas: Evaluate capacity / greeting eligibility
  alt Atlas sends greeting
    Atlas->>DB: conversation_logs (outgoing)
    Atlas->>Ev: GreetingSent, MessageSent
    Note over Atlas: Next → GREETING_SENT
  else Awaiting capacity / batch
    Note over Atlas: Remains NEW_LEAD
  end
```

---

## 2. Qualification

**Milestone:** `QUALIFICATION`  
**Owner:** `ATLAS`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Prospect inbound message after greeting, or human advancement to `QUALIFICATION` |
| **Workflow owner** | `ATLAS` |
| **Events emitted** | `MessageReceived`, `MessageSent`, `QualificationUpdated` (on field capture) |
| **Business rule(s)** | BR-014 (no repeat questions), BR-018–BR-022 (coverage / interview type), BR-019–BR-021 (local vs Zoom) |
| **Next milestone** | `INTERVIEW_READY` when `getMissingFields()` is empty |

```mermaid
sequenceDiagram
  autonumber
  participant Prospect
  participant Atlas as Atlas (ATLAS)
  participant Eng as semanticConversationEngine
  participant DB as prospects
  participant Ev as eventEngine

  Prospect->>Eng: Inbound message
  Eng->>Ev: MessageReceived
  Eng->>Eng: extract + validate field (city, auth, occupation, type)
  Eng->>DB: Update prospect fields
  Eng->>Ev: QualificationUpdated
  Eng->>Prospect: Ask next missing field only (BR-014)
  Eng->>Ev: MessageSent
  alt All qualification complete
    Note over Atlas: Next → INTERVIEW_READY
  else Fields remain
    Note over Atlas: Remains QUALIFICATION
  end
```

---

## 3. Interview Ready

**Milestone:** `INTERVIEW_READY`  
**Owner:** `ATLAS`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | All qualification fields complete; no confirmed interview slot |
| **Workflow owner** | `ATLAS` |
| **Events emitted** | `QualificationUpdated`, `MessageSent` (slot offer) |
| **Business rule(s)** | BR-001–BR-004 (scheduling window), BR-006/BR-007 (capacity), BR-005 (working hours preference) |
| **Next milestone** | `INTERVIEW_SCHEDULED` |

```mermaid
sequenceDiagram
  autonumber
  participant Atlas as Atlas (ATLAS)
  participant Cap as capacityEngine
  participant Sched as schedulingEngine
  participant Prospect
  participant Ev as eventEngine

  Atlas->>Atlas: getMissingFields() = []
  Note over Atlas: Milestone = INTERVIEW_READY
  Atlas->>Cap: Check slot availability
  Atlas->>Sched: Build offered times
  Atlas->>Prospect: Propose interview slots
  Atlas->>Ev: MessageSent
  alt Prospect selects slot
    Note over Atlas: Next → INTERVIEW_SCHEDULED
  else Human schedules via Mission Control
    Note over Atlas: See Human Advancement (#6)
  end
```

---

## 4. Interview Scheduled

**Milestone:** `INTERVIEW_SCHEDULED` → `INTERVIEW_DUE`  
**Owner:** `WAITING_EVENT`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Slot confirmed (automated or human); `current_step = CONFIRMED` |
| **Workflow owner** | `WAITING_EVENT` |
| **Events emitted** | `InterviewScheduled`, `MessageSent`, `ReminderScheduled`, `ReminderSent` |
| **Business rule(s)** | BR-035 §16 (confirmation + details when human schedules — 8A.4), BR-028/BR-029 (resource sends), BR-016 |
| **Next milestone** | `INTERVIEW_DUE` (within 2h) → `INTERVIEW_COMPLETED` (time passed) |

```mermaid
sequenceDiagram
  autonumber
  participant Atlas as Atlas (WAITING_EVENT)
  participant DB as prospects
  participant Cal as calendarService
  participant Prospect
  participant Ev as eventEngine
  participant MC as Mission Control

  alt Automated confirmation
    Atlas->>DB: interview_time, current_step=CONFIRMED
    Atlas->>Cal: Create calendar event (if configured)
    Atlas->>Ev: InterviewScheduled
    Atlas->>Prospect: Confirmation + meeting details
    Atlas->>Ev: MessageSent, ReminderScheduled
  else Human advancement (BR-035)
    MC->>DB: POST /workflow/advance
    Note over MC: See Human Advancement (#6)
  end
  Note over Atlas: Owner = WAITING_EVENT
  Note over Atlas: Stall clock paused (BR-034 #3)
  alt Interview within 2 hours
    Note over Atlas: Next → INTERVIEW_DUE (priority rank 3)
  else Interview time passed
    Note over Atlas: Next → INTERVIEW_COMPLETED
  end
```

---

## 5. Conversation Stalled

**Milestone:** unchanged (e.g. `QUALIFICATION`, `GREETING_SENT`)  
**Owner:** `ATLAS` → `AGENT`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | 24h since last Atlas **outbound** with no prospect **inbound** after it; workflow incomplete; not `WAITING_EVENT` exempt |
| **Workflow owner** | `AGENT` |
| **Events emitted** | `ConversationStalled`, `WorkflowOwnershipChanged`, `WorkflowPaused` |
| **Business rule(s)** | BR-034, BR-036, BR-025 (recommended action: `call`) |
| **Next milestone** | Unchanged until human advancement or prospect reply |

```mermaid
sequenceDiagram
  autonumber
  participant Sys as System (read path)
  participant Stall as stallDetectionEngine
  participant Own as workflowOwnershipEngine
  participant Store as workflowStateStore
  participant Ev as eventEngine
  participant MC as Mission Control

  Sys->>Sys: GET mission-control or dashboard queue
  Sys->>Stall: detectConversationStall(messageHints, milestone)
  alt 24h silence + not exempt
    Stall->>Own: applyStallTransition()
    Own->>Store: ownership=AGENT, needsHumanAttention=true, stalledAt
    Own->>Ev: ConversationStalled
    Own->>Ev: WorkflowOwnershipChanged (ATLAS→AGENT)
    Own->>Ev: WorkflowPaused
    MC->>MC: Priority rank 2 (after Pending Interview Results)
    Note over MC: recommendedHumanAction = call
  else Within SLA or exempt
    Note over Sys: No transition
  end
```

---

## 6. Human Advancement

**Milestone:** any valid target (e.g. `QUALIFICATION` → `INTERVIEW_SCHEDULED`)  
**Owner:** `AGENT` → `ATLAS` or `WAITING_EVENT`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Agent `POST /api/mission-control/:phone/workflow/advance` after call or interaction |
| **Workflow owner** | `AGENT` during stall; transitions to derived ownership on save |
| **Events emitted** | `HumanCallCompleted`, `QualificationUpdated`, `InterviewScheduled`, `ProspectAdvanced`, `WorkflowOwnershipChanged`, `WorkflowResumed` |
| **Business rule(s)** | BR-035, BR-037, BR-036, BR-014 |
| **Next milestone** | `targetMilestone` from request (validated) |

```mermaid
sequenceDiagram
  autonumber
  participant Agent
  participant API as POST /workflow/advance
  participant Val as milestoneValidationEngine
  participant Adv as humanAdvancementEngine
  participant DB as prospects + agentActionState
  participant Store as workflowStateStore
  participant Ev as eventEngine

  Agent->>API: targetMilestone + capturedFields + interactionNotes
  API->>Val: validateMilestoneAdvancement() (BR-037)
  alt Validation failed
    API-->>Agent: 400 VALIDATION_FAILED / INVALID_TRANSITION
  else Valid
    Adv->>DB: Persist prospect + agent state
    Adv->>Store: canonicalMilestone, ownership, clear stall flags
    Adv->>Ev: ProspectAdvanced
    opt Qual fields changed
      Adv->>Ev: QualificationUpdated
    end
    opt Interview scheduled
      Adv->>Ev: InterviewScheduled
    end
    Adv->>Ev: WorkflowOwnershipChanged, WorkflowResumed
    API-->>Agent: 200 + workflow read model
    Note over Agent: Next = targetMilestone<br/>Resume from milestone, not last message (BR-035 §6)
  end
```

---

## 7. Workflow Resume

**Milestone:** prior milestone unchanged or advanced  
**Owner:** `AGENT` → `ATLAS` or `WAITING_EVENT`

### Summary

| Field | Value |
|-------|-------|
| **Trigger A** | Successful human advancement (BR-035) |
| **Trigger B** | Prospect inbound message after stall (8A.2 — auto-clear) |
| **Trigger C** | Follow-up date reached (future — reminder engine) |
| **Workflow owner** | Restored to `ATLAS` or `WAITING_EVENT` per milestone |
| **Events emitted** | `WorkflowResumed`, `WorkflowOwnershipChanged`, optionally `MessageReceived` |
| **Business rule(s)** | BR-035 §5–§8, BR-036, BR-014 |
| **Next milestone** | Continue from current/highest valid milestone — no “Resume Atlas” button |

```mermaid
sequenceDiagram
  autonumber
  participant Trigger as Trigger (Agent / Prospect / System)
  participant Eng as workflow engine
  participant Store as workflowStateStore
  participant Atlas as Atlas
  participant Ev as eventEngine

  alt Human advancement saved
    Trigger->>Eng: POST /workflow/advance success
    Eng->>Store: manualAgentOwnership=false, needsHumanAttention=false
    Eng->>Ev: WorkflowOwnershipChanged, WorkflowResumed
  else Prospect replies after stall
    Trigger->>Eng: Inbound message (timestamp > last outbound)
    Eng->>Store: Clear stall episode, restore ownership
    Eng->>Ev: WorkflowOwnershipChanged, WorkflowResumed
  else Follow-up due (future)
    Trigger->>Eng: followUpDate reached
    Eng->>Atlas: Resume automated nurture
    Eng->>Ev: WorkflowResumed
  end
  Eng->>Eng: deriveDefaultOwnership(milestone)
  Note over Atlas: Owner = ATLAS or WAITING_EVENT
  Atlas->>Atlas: Continue from milestone (not unanswered message)
```

---

## 8. Follow-up

**Milestone:** `FOLLOW_UP`  
**Owner:** `WAITING_EVENT` (until date) → `ATLAS`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Interview outcome “Needs More Time” / “No Show”, or human advancement to `FOLLOW_UP` |
| **Workflow owner** | `WAITING_EVENT` until `followUpDate`; then `ATLAS` |
| **Events emitted** | `InterviewResultRecorded`, `FollowUpScheduled`, `ProspectAdvanced`, `MessageSent` (on execute) |
| **Business rule(s)** | BR-035, BR-032 (closure reason variants), BR-037 (`followUpDate` required) |
| **Next milestone** | `QUALIFICATION` or `INTERVIEW_SCHEDULED` on re-engagement |

```mermaid
sequenceDiagram
  autonumber
  participant Agent
  participant API as workflow/advance
  participant Store as workflowStateStore
  participant Sys as System clock
  participant Atlas as Atlas
  participant Ev as eventEngine

  Agent->>API: targetMilestone=FOLLOW_UP, followUpDate
  API->>Ev: ProspectAdvanced, FollowUpScheduled
  API->>Store: ownership=WAITING_EVENT
  Note over Store: Milestone = FOLLOW_UP
  Sys->>Sys: followUpDate reached
  Sys->>Ev: WorkflowResumed
  Atlas->>Atlas: Re-engage prospect (priority rank 4 if due)
  alt Prospect responds
    Note over Atlas: Next → QUALIFICATION or INTERVIEW_SCHEDULED
  else No response 24h after Atlas outbound
    Note over Atlas: See Conversation Stalled (#5)
  end
```

---

## 9. Closed

**Milestone:** `CLOSED`  
**Owner:** `CLOSED`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Outcome “Not Interested”, human advancement to `CLOSED`, or automated terminal path |
| **Workflow owner** | `CLOSED` |
| **Events emitted** | `InterviewResultRecorded`, `ProspectClosed`, `WorkflowOwnershipChanged` |
| **Business rule(s)** | BR-008 (no auto-resume), BR-032 (closure reason variants), BR-035, BR-037 |
| **Next milestone** | None (terminal) — reactivation requires explicit rule (see #11) |

```mermaid
sequenceDiagram
  autonumber
  participant Agent
  participant API as workflow/advance
  participant DB as prospects + agentActionState
  participant Store as workflowStateStore
  participant Ev as eventEngine
  participant Atlas as Atlas

  Agent->>API: targetMilestone=CLOSED, closureReason
  API->>DB: outcome=Not Interested
  API->>Store: ownership=CLOSED, milestone=CLOSED
  API->>Ev: ProspectClosed, WorkflowOwnershipChanged
  Atlas-xAtlas: No automated outreach (BR-008)
  Note over Store: Mission Control rank 6 (monitoring)
```

---

## 10. Do Not Contact

**Milestone:** `DO_NOT_CONTACT`  
**Owner:** `CLOSED`

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Explicit DNC request, compliance flag, or human advancement |
| **Workflow owner** | `CLOSED` |
| **Events emitted** | `DoNotContactApplied`, `WorkflowOwnershipChanged`, `ProspectClosed` |
| **Business rule(s)** | BR-008, BR-035, BR-037; compliance suppression (proposed BR-038) |
| **Next milestone** | None (terminal) |

```mermaid
sequenceDiagram
  autonumber
  participant Agent
  participant API as workflow/advance
  participant Store as workflowStateStore
  participant Ev as eventEngine
  participant Atlas as Atlas

  Agent->>API: targetMilestone=DO_NOT_CONTACT, doNotContactReason
  API->>Store: doNotContact=true, ownership=CLOSED
  API->>Ev: DoNotContactApplied, WorkflowOwnershipChanged
  Atlas-xAtlas: All automated channels blocked
  Note over Store: Excluded from active Mission Control queue
```

---

## 11. Reactivation

**Milestone:** `CLOSED` / `DO_NOT_CONTACT` → active milestone  
**Owner:** `CLOSED` → `AGENT` → `ATLAS`  
**Status:** **Proposed for Sprint 8A.4+** — not implemented; documented for planning

### Summary

| Field | Value |
|-------|-------|
| **Trigger** | Explicit agent reopen after cooling period; inbound message on closed prospect (does **not** auto-resume per BR-008) |
| **Workflow owner** | `AGENT` during review → `ATLAS` after validated advancement |
| **Events emitted** | `ProspectAdvanced`, `WorkflowOwnershipChanged`, `WorkflowResumed`, `MessageReceived` (if inbound logged) |
| **Business rule(s)** | BR-008 (no **automatic** resume), BR-035/BR-037 (human must select valid milestone), proposed **BR-038** (Reactivation policy) |
| **Next milestone** | Agent-selected: typically `QUALIFICATION`, `FOLLOW_UP`, or `INTERVIEW_SCHEDULED` |

```mermaid
sequenceDiagram
  autonumber
  participant Prospect
  participant Agent
  participant API as workflow/advance
  participant Val as milestoneValidationEngine
  participant Store as workflowStateStore
  participant Ev as eventEngine
  participant Atlas as Atlas

  opt Inbound on closed prospect
    Prospect->>Agent: Message received
    Note over Atlas: Owner stays CLOSED — no auto-resume (BR-008)
    Agent->>Agent: Mission Control alert (monitoring tier)
  end
  Agent->>API: Explicit reopen — targetMilestone + capturedFields
  API->>Val: Validate (must not be NEW_LEAD reset)
  Val->>Store: Clear CLOSED/DNC flags, set target milestone
  API->>Ev: ProspectAdvanced, WorkflowOwnershipChanged, WorkflowResumed
  Note over Atlas: Owner = ATLAS or WAITING_EVENT
  Note over Atlas: Do not repeat completed questions (BR-014)
```

### Reactivation policy (proposed)

1. Only **agent-initiated** — never automatic from inbound alone.
2. **DNC** requires compliance review before reopen.
3. Preserve historical `workflow_events` — append-only audit trail.
4. Recommended target: `FOLLOW_UP` or `QUALIFICATION` based on data freshness.

---

## Cross-Reference: Mission Control Priority During Sequences

| Sequence | Typical priority tier |
|----------|----------------------|
| Interview Result Pending | 1 — Pending Interview Results |
| Conversation Stalled | 2 — Human Escalations |
| Interview Due | 3 — Interview Immediate |
| Follow-up due | 4 — Follow-up Due |
| Qualification / New Lead | 5 — Atlas Active |
| Interview Scheduled (future) | 6 — Monitoring |
| Closed / DNC | 6 — Monitoring (excluded from active queue) |

---

## Document Index

| Document | Purpose |
|----------|---------|
| [WORKFLOW_SIMULATOR_SPEC.md](../03-engineering/WORKFLOW_SIMULATOR_SPEC.md) | Developer simulator for testing these sequences |
| [SPRINT_8A_3.md](../04-api/mission-control-workflow-advance.md) | Human Advancement API |
| [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md) | Event payloads |
