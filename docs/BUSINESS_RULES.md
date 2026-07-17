# Atlas Business Rules

Atlas is built from real Team Vision recruiting experience.

These business rules represent how Team Vision operates in the real world.

Every future feature should follow these rules whenever possible.

If a future feature violates a business rule, the business rule takes priority.

**Implementation:** Decisions live in `backend/core/businessRulesEngine.js`. Conversation wording lives in `backend/core/conversationCopy.js`. Rule application lives in `backend/core/businessRulesApplicator.js`.

---

# Office & Coverage

## BR-018

Team Vision office location:

- **Name:** Team Vision Office
- **Address:** 2500 NW 79th Ave, Suite 189, Doral, FL 33122

---

## BR-019

Prospects within approximately **25 miles** of the Doral office are **LOCAL**.

Default interview type: **In Person**.

---

## BR-020

Prospects **outside** local coverage default to **Zoom**.

Atlas does not ask Office vs Zoom when only one type applies.

---

## BR-021

If a **LOCAL** prospect requests Zoom, allow Zoom immediately. No approval required.

---

## BR-022

If an **OUTSIDE** prospect requests an in-person interview, set `needsHumanCoordinator = true`.

Reason: Special meeting request. Do not promise another location automatically.

---

# Scheduling

## BR-001

Attempt to schedule interviews within the next 48 hours whenever possible.

---

## BR-002

If the interview is Zoom and there is interview capacity today, Atlas may offer a same-day interview.

---

## BR-003

If the prospect requests another day or time, Atlas should search for the requested availability instead of forcing the default scheduling window.

---

## BR-004

Working prospects should normally be asked:

> "Would before or after 5 PM be more convenient?"

---

## BR-005

Unemployed prospects should normally be asked:

> "Would you prefer a morning or afternoon interview?"

---

## BR-006

Maximum interview capacity per time slot is 2.

---

## BR-007

Atlas manages interview capacity, not appointments.

---

## BR-023

Default scheduling window: **9:00 AM through 8:30 PM**.

Outside that window → human coordinator review. Do not auto-schedule.

---

# Recruiter Presence

## BR-008

Recruiter Presence overrides calendar availability.

---

## BR-009

Recruiter statuses include:

- Available
- Busy
- Do Not Schedule
- Driving
- Training
- Vacation

---

## BR-010

Atlas should never schedule interviews for recruiters marked as Do Not Schedule.

---

# Conversation Style

## BR-011

Atlas should sound like a professional Team Vision recruiting coordinator.

---

## BR-012

Messages should be short, natural, and appropriate for WhatsApp.

---

## BR-013

Avoid robotic acknowledgments and filler transitions such as:

- "I appreciate the information."
- "Thank you for sharing your location."
- "Let's keep going with your interview."

Use short acknowledgments instead.

**Examples:**

- Perfecto.
- Excelente.
- Entendido.
- Gracias.

---

## BR-014

Atlas should never ask for information it already knows.

---

# Human Takeover

## BR-015

A recruiter can take over any conversation at any moment.

---

## BR-016

While in Human Mode, Atlas continues listening and updating memory but never sends messages.

---

## BR-017

When Atlas resumes, it should continue naturally without restarting the conversation.

---

## BR-024

Return `needsHumanCoordinator = true` whenever human judgment is preferred (outside coverage in-person requests, outside scheduling window, ambiguous authorization).

---

# Agent Next Actions

## BR-025

Mission Control Next Actions are computed from prospect milestone, interview type, interview timing phase, workflow state, and completed agent actions. Actions are never shown as a fixed set per screen.

## BR-026

Each valid state exposes exactly one **primary** action representing the highest-value next step for the recruiter.

## BR-027

Send Zoom Link appears only for Zoom interviews. Send Office Location appears only for Office/In Person interviews. Never both simultaneously.

## BR-028

Resource sends follow interview timing:

- **Future (>2h):** resource send is secondary
- **Soon (≤2h):** resource send is primary when not yet completed in workflow state
- **Past + confirmed + no outcome:** all Next Actions are hidden — Workflow Gate owns the UI (see BR-015)

## BR-029

Once an agent send is recorded (`zoom_link_sent`, `office_location_sent`, `missed_appointment_sent`), hide that action until workflow state changes (reschedule, interview type change, or new confirmation). No time-based expiry.

## BR-030

Call and WhatsApp remain available for all non-closed milestones unless Workflow Gate is active. Primary vs secondary priority varies by context.

## BR-031

Notes appear at every milestone except while Workflow Gate is active.

## BR-032

Closed prospects are not a single state. Action visibility depends on closure reason (for example, Not Interested with optional future reminder).

---

# Workflow Engine

## BR-034 — Conversation Stalled / Intelligent Human Escalation

**Implements:** Sprint 8A principles 4, 9, 11, 12, 13  
**Engine:** `workflowReadModel.js`, `stallDetectionEngine.js`, `workflowOwnershipEngine.js`

### Trigger (all required)

1. No **inbound prospect** response for **24 hours** after Atlas's **last outbound** message.
2. Workflow is incomplete (not Closed, not Do Not Contact).
3. Prospect is not awaiting a scheduled event where `WAITING_EVENT` applies.
4. Milestone is not terminal.

### Behavior

- Pause automated progression.
- Set `workflowOwnership = AGENT`.
- Set `needsHumanAttention = true`.
- Create Mission Control priority item **after** Pending Interview Results (rank 2).
- Recommend appropriate human action (early milestones → phone call).
- Preserve current milestone and collected data.
- Resume automatically after agent records interaction and advances milestone (BR-035). No separate "Resume Atlas" button.

### Events

`ConversationStalled`, `WorkflowOwnershipChanged`, `WorkflowPaused`

---

## BR-035 — Human Advancement

**Implements:** Sprint 8A principles 5, 6, 7, 8, 14, 15, 16, 17, 19  
**Engine:** `humanAdvancementEngine.js`, `milestoneValidationEngine.js`, `eventEngine.js`

### Behavior

1. Agent records information from call or human interaction.
2. Agent selects target milestone from valid state machine transitions.
3. Workflow engine validates required data for target milestone.
4. On save: persist fields, set milestone, emit events, trigger automated follow-up when interview scheduled.
5. Return ownership to `ATLAS` when automated path can continue.
6. Resume from **new milestone**, not last unanswered message.
7. Do not repeat completed qualification questions (BR-014).

### Events

`HumanCallStarted`, `HumanCallCompleted`, `ProspectAdvanced`, `QualificationUpdated`, `InterviewScheduled`, `WorkflowOwnershipChanged`, `WorkflowResumed`

---

## BR-036 — Workflow Ownership Transition

**Implements:** Sprint 8A principle 9  
**Engine:** `workflowOwnershipEngine.js`, `workflowConstants.js` (detection in `stallDetectionEngine.js`)

### Ownership values

| Value | Meaning |
|-------|---------|
| `ATLAS` | Atlas may send messages and advance workflow automatically |
| `AGENT` | Automated progression paused; human must act |
| `WAITING_EVENT` | Paused until external trigger (scheduled interview, reminder, prospect reply within SLA) |
| `CLOSED` | Terminal — no automatic resume |

### Transition rules

| From | To | Trigger |
|------|-----|---------|
| `ATLAS` | `AGENT` | BR-034 stall, BR-015 manual takeover, BR-024 coordinator handoff |
| `ATLAS` | `WAITING_EVENT` | Interview scheduled, reminder scheduled, awaiting scheduled event |
| `AGENT` | `ATLAS` | BR-035 human save; prospect inbound after stall (8A.2) |
| `AGENT` | `WAITING_EVENT` | Human schedules interview — automated wait until event |
| `*` | `CLOSED` | Closed or Do Not Contact milestone |
| `CLOSED` | `ATLAS` | **Invalid** without explicit reopen rule |

### Requirements

- Every transition must be auditable (`WorkflowOwnershipChanged` event).
- Persisted ownership overrides computed defaults when stall or manual agent hold is active.
- Legacy `SYSTEM_WAITING` values normalize to `WAITING_EVENT` on read.

### Events

`WorkflowOwnershipChanged`, `WorkflowPaused`, `WorkflowResumed`

---

## BR-037 — Milestone Validation

**Implements:** Sprint 8A.3 validation gate for human advancement  
**Engine:** `milestoneValidationEngine.js`

### Requirements

1. Validation rules belong to the Workflow Engine, not the frontend.
2. Every milestone defines required fields in `MILESTONE_REQUIRED_FIELDS`.
3. Human Advancement (BR-035) must validate before changing milestones.
4. Invalid transitions return structured validation errors (`VALIDATION_FAILED`, `INVALID_TRANSITION`).
5. Valid transitions emit workflow events, update ownership (BR-036), update workflow state, and resume Atlas when appropriate.

### API

`POST /api/mission-control/:phone/workflow/advance`

### Events

Validation failures emit no events. Successful advancement emits the BR-035 event set.

---

# Design Philosophy

Atlas does not replace recruiters.

Atlas removes repetitive work.

Atlas protects recruiter time.

Atlas optimizes interview capacity.

Atlas adapts to real life.

Atlas learns Team Vision's business rules.

People live their lives.

Atlas works around them.

---

# Engine Map

| Layer | Module | Responsibility |
|-------|--------|----------------|
| Rules | `businessRulesEngine.js` | Decisions only — coverage, interview type, scheduling window, escalation |
| Application | `businessRulesApplicator.js` | Apply rule decisions to prospect profile |
| Conversation | `semanticConversationEngine.js` | Message flow, FAQ, handoff orchestration |
| Copy | `conversationCopy.js` | User-facing wording from rule decisions |
| Scheduling | `schedulingEngine.js` | Available times and slot logic |
| Capacity | `capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Agent Actions | `agentActionEngine.js` | Next Actions visibility and execution (BR-025 – BR-032) |
| Workflow | `milestoneMapper.js`, `workflowReadModel.js`, `workflowStateStore.js`, `stallDetectionEngine.js`, `workflowOwnershipEngine.js`, `milestoneValidationEngine.js`, `humanAdvancementEngine.js` | Milestones, ownership, stall detection, human advancement (BR-034 – BR-037) |
| Events | `eventEngine.js`, `workflowEventService.js` | Structured auditable workflow events |
