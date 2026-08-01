# Atlas Business Rules

## AI Summary

These rules encode Team Vision recruiting operations as testable BR-XXX statements. They override ad-hoc code behavior: read before implementing features, cite rules in code, and propose new BR entries when behavior changes. Decision logic lives in `businessRulesEngine.js`; user-facing copy lives in `conversationCopy.js`.

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

# Appointments

## BR-039 — Persisted Appointment Identity

**Implements:** Sprint 12.5.6  
**Engine:** `appointmentRepository`, `appointmentListService`, `missionExecutionApplicationService`, `legacyInterviewRepairService`

An interview appears in operational appointment surfaces only when a persisted `atlas_appointments` record exists.

Prospect scheduling fields (`interview_time`, `calendar_event_id`, etc.) are metadata and may support legacy repair, but they are **not** an appointment identity.

Rules:

1. **Scheduling success invariant:** `success === true` implies `appointmentId` is a valid persisted Atlas appointment UUID. Never return success with `appointment: null` or without `appointmentId`.
2. **Operational identity:** Only persisted appointment UUIDs may be used for Appointments, Mission Control appointment actions, Prospect Workspace appointment actions, Communication Preview, interview invitation, reminder, Zoom invitation, office location, reschedule, complete, cancel, outcome synchronization, and follow-up derivation.
3. **Synthetic ids forbidden:** `prospect-derived:` ids and `calendarEventId` must not enter operational APIs as appointment identity.
4. **Atomic scheduling:** Calendar booking, appointment persistence, prospect scheduling metadata update, and journey advancement must succeed together or roll back partial work.
5. **Legacy repair:** One-time backfill may create missing persisted rows from prospect metadata without creating duplicate calendar events, journey advances, or communications.

---

## BR-040 — Persisted Appointment Eligibility

**Implements:** Sprint 12.5.7  
**Engine:** `appointmentListQuery.js`, `appointmentListService`, operational appointment surfaces

A persisted appointment is determined solely by repository persistence and a non-synthetic UUID.

Rules:

1. **Identity-only eligibility:** An appointment is operationally persisted when it has an `id` that is not a `prospect-derived:` synthetic id.
2. **Origin metadata is informational:** The field `metadata.derivedFromProspect` describes appointment origin only and must never determine operational eligibility.
3. **No metadata gate:** Operational filters must not exclude UUID appointments because of `derivedFromProspect` flags on the row or in metadata.

---

# Language & Communication

## BR-041 — Preferred Language vs Conversation Language

**Implements:** Sprint 13.1  
**Engine:** `prospectLanguage.js`, `missionControlReadModel.js`, `communicationOutboundPayloadEngine.js`, Mission Control and Prospect Workspace adapters

Preferred Language and Conversation Language are independent concepts and must never overwrite or substitute for each other.

### Preferred Language

- **Canonical field:** `preferred_language` (`english` | `spanish`)
- Represents the representative's explicit choice (Quick Capture or Prospect Workspace edit).
- Immutable unless explicitly edited by an authorized user.
- Mission Control UI, Communication Preview metadata, invitation templates, reminder templates, and AI starting defaults must use this value (via `resolveProspectPreferredLanguage()`).

### Conversation Language

- **Canonical field:** `brain.language` (`en` | `es`)
- Represents the AI's active conversation language for the current turn.
- May change on every inbound message based on detection and persisted conversation state.
- Remains internal to AI pipelines; must not be displayed as Preferred Language in Mission Control or Prospect Workspace.

---

# Interview Assignment

## BR-042 — Interview Assignment

**Implements:** Sprint 13.2  
**Engine:** `interviewAssignmentEngine.js`, `appointmentReadModel.js`, `representativeProfileEngine.js`, scheduling UI

Recruiter, Prospect Owner, and Interviewer are independent roles.

### Interviewer

- **Canonical fields:** `interviewer_user_id`, `interviewer_name` on `atlas_appointments`
- Represents the representative assigned to conduct the interview.
- Default at schedule time: **authenticated user** (not prospect owner, scheduler rep id, or organization default).
- Single source of truth for interview communications and operational display.

### Consumers

Appointment invitation, Communication Preview, interview reminder, Zoom invitation, office invitation, Mission Control, and Prospect Workspace must resolve the interviewer **only** from the persisted appointment assignment via `resolveInterviewRepresentative()`.

`owner_rep_id` remains prospect ownership metadata and must not substitute for interviewer assignment in communications.

---

## BR-043 — Appointment Card Join Zoom CTA

**Implements:** Sprint 13.3  
**Engine:** `appointmentCardPresentation.js`, `AppointmentCardActions.jsx`

When a persisted appointment includes a valid Zoom meeting URL and is not completed or cancelled:

1. **Primary CTA:** The Appointments card must show **Join Zoom** as the visually emphasized primary action (same button component family as other card actions).
2. **Action order:** Add Note → Open Workspace → Join Zoom → Reschedule → Cancel → Complete.
3. **Visibility:** Hide Join Zoom when the appointment is terminal (completed/cancelled) or no valid Zoom URL exists.
4. **Terminology:** Use **Zoom** consistently in card meta and actions (`Recruiting Interview · Zoom`, `Join Zoom`). Do not mix generic labels such as Join, Meeting, or Video for Zoom interviews on this surface.
5. **Scope:** Presentation only — no changes to appointment lifecycle, scheduling, communications, or interview assignment (BR-042).

---

## BR-044 — Interview Outcome Simplification

**Implements:** Sprint 13.4  
**Engine:** `interviewOutcomeMappings.js`, `interviewOutcomeApplicationService.js`, `WorkflowGatePanel`, `AppointmentCardActions` consumers

Interview outcomes represent **business events** ("What happened?"). Workflow milestones represent **Atlas operational states** ("What happens next?"). They must never appear in the same selector.

### Representative-facing outcomes (selector only)

1. Recruited  
2. Became Client  
3. Rescheduled  
4. No Show  
5. Follow Up Needed  
6. Not Interested  

Operational milestones (`Pending IBA`, `Orientation Scheduled`, `Application Pending`, etc.) remain in the workflow engine but are **not selectable** by representatives.

### Automatic workflow advancement

| Outcome | Atlas behavior |
|---|---|
| **Recruited** | Records business outcome; advances to **Pending IBA** (licensing/onboarding track) automatically |
| **Became Client** | Closes interview outcome gate; does **not** create Application Pending (Primerica Back Office owns applications) |
| **Follow Up Needed** | Continues follow-up workflow |
| **Rescheduled** | Continues appointment scheduling workflow |
| **No Show** | Continues no-show recovery workflow |
| **Not Interested** | Continues objection / nurture workflow |

---

## BR-045 — Mission Control Workflow Polish

**Implements:** Sprint 13.5  
**Engine:** `interviewWorkflowPresentationEngine.js`, `communicationActionCenterPresentation.js`, `MissionActionCenter`, `CommunicationActionsPanel`, `AppointmentCardActions`, `OperationalInterviewPanel`

Presentation-only polish for the interview workflow across Mission Control, Appointments, and Prospect Workspace. **No workflow logic, backend, or database changes.**

### Valid actions by interview state

| UI state | Actions shown |
|---|---|
| **Interview Scheduled** | Join Zoom (primary when URL exists), Open Workspace, Reschedule, Cancel, Complete Interview |
| **Interview Result Pending** | Record Outcome (Mission Control), Open Workspace; hide duplicate interview lifecycle actions |
| **Interview Completed** | View Workspace, Communication History |

Terminal states (Cancelled, No Show) follow Completed presentation rules.

### Communication cards

Hide cards that cannot be used (do not render disabled placeholders):

- No interview scheduled → hide Zoom Invitation, Reminder, Office Address
- Interview Result Pending → hide Zoom Invitation, Reminder, and Office Address; keep Call, WhatsApp, Add Note, and Resend Interview Details when valid (see BR-046)

### CTA hierarchy

1. **Primary** — next operational step (e.g. Join Zoom, Record Outcome)
2. **Secondary** — supporting navigation (Open/View Workspace, Reschedule, Complete Interview)
3. **Danger** — destructive actions (Cancel Interview)

Every CTA subtitle must answer **why it is available now** (contextual hint, not generic label).

### Standardized terminology

Use these labels consistently (no mixed wording):

- Interview Scheduled
- Interview In Progress
- Interview Result Pending
- Interview Completed
- Rescheduled
- Cancelled
- No Show

---

## BR-046 — Mission Control Focus Mode

**Implements:** Sprint 13.6, 13.6.1  
**Surface:** `Dashboard.jsx` (Mission Control page), `MissionControl.css`, `communicationActionStateEngine.js`, `communicationActionCenterPresentation.js`, `interviewWorkflowPresentationEngine.js`

Mission Control is an **execution interface**, not a reporting dashboard. Operational statistics belong to **Executive Dashboard** and **Analytics**. Mission Control displays only information that directly supports the user's next workflow action.

### Presentation rules

1. **No KPI summary row** on Mission Control — do not show aggregate widgets for Appointments, Follow-ups, Tasks, or Prospects Requiring Action.
2. **Preserve metrics elsewhere** — backend calculations, APIs, and Executive Dashboard / Analytics surfaces continue to use these metrics unchanged.
3. **Vertical priority** — after the prospect header, the first content is **Mission Actions**, followed immediately by **Communication** cards.
4. **No workflow changes** — routing, backend, appointment logic, and business rules remain unchanged.
5. **Communication during outcome gate** — Mission Control hides only workflow actions that are no longer applicable. Communication actions that help the representative complete the current workflow remain available.

### Communication availability by interview state

| UI state | Mission Actions | Communication shown | Communication hidden |
|---|---|---|---|
| **Interview Scheduled** | Schedule/reschedule lifecycle actions | Call, WhatsApp, Add Note, Zoom Invitation, Reminder, Office Address (when valid) | — |
| **Interview Result Pending** | Record Outcome (primary) | Call, WhatsApp, Add Note, Resend Interview Details (when valid) | Zoom Invitation, Reminder, Office Address |
| **Interview Completed** | None | Call, WhatsApp, Add Note | Pre-interview invitation cards |

Recruiter Brief and Communication History reference sections remain visible when data is available.

---

## BR-047 — Interview Assignment UX (Stable Modal Layout)

**Implements:** Sprint 13.7 (Part 1)  
**Surface:** `InterviewAssignmentSection.jsx`, `SchedulingForm.jsx`, `ScheduleInterviewDialog.css`

Interview assignment UI in the scheduling modal is **presentation only** — no backend, API, or assignment logic changes.

### Stable scheduling modal

1. The Schedule Interview dialog keeps a **fixed height**; selecting another representative must not resize the modal.
2. **Quick selections remain:** Me, up to two colleagues, Another Representative…
3. **Another Representative** shows a **single-line** representative selector inside the assignment area — it replaces inactive space instead of pushing scheduling controls downward.
4. The selector row uses a **reserved slot** (hidden when not active) so toggling assignment mode does not change modal height.
5. **Scheduling controls stay visible:** Choose another day, time slots, notes, and Confirm Interview remain reachable without extra scrolling caused by assignment expansion.

---

## BR-048 — Personnel Directory

**Implements:** Sprint 13.8  
**Engine:** `personnelDirectoryEngine.js`, `atlasUserService.listOrganizationUsers`, Interview Assignment route

Atlas uses one canonical Personnel Directory for all assignable representatives. Interview Assignment, Round Robin, Prospect Assignment, Ownership Transfer, Human Assist, and future assignment features must consume `listAssignableRepresentatives()` — not ad hoc `atlas_users` queries with duplicated filters.

### Inclusion rules

Return only users who:

- belong to the current organization
- have `status = active` (not disabled, deleted, or archived)
- are interview-eligible human representatives (recruiter, agent, division leader, RVP, administrator)

### Exclusion rules

Never show simulator, demo, system, or service accounts, including:

- email/rep/id prefixes `sim-`, `demo-`
- display names such as Invite Flow, Ops Access, Ops Ops, System, Automation
- operations/support roles and non-active users

### Display rules

1. Sort alphabetically by display name.
2. When two or more users share the exact same base display name, append ` • {Role}` (e.g. `Niovel Perez • Administrator`).
3. Unique names remain unsuffixed (`Ana Perez`, `Jessica Caballero`).

### API shape (future-ready)

Each directory entry includes:

`id`, `displayName`, `role`, `avatarUrl`, `isAvailable`, `workload`, `interviewEligible`

Only `displayName` is required by current Interview Assignment UI; other fields are placeholders for Round Robin, workload balancing, availability, Human Assist, and smart assignment.

---

## BR-049 — Conversation Engine Delegation

**Implements:** Architecture hardening — Conversation Engine as highest-priority subsystem  
**Engines:** `conversationEngine.js`, `semanticConversationEngine.js`, `communicationHub.js`  
**Delegates to:** `businessRulesEngine.js`, `informationModel.js`, `schedulingEngine.js`, `appointmentApplicationService.js`, `missionExecutionApplicationService.js`, `humanAdvancementEngine.js`, `communicationHub.js` (outbound adapters)

The **AI Conversation Engine** is Atlas’s primary inbound interface. It **understands**, **remembers**, **decides**, and **delegates**. Production business engines **execute**. The conversation layer must never become a second implementation of qualification, scheduling, appointments, workflow, or communications logic.

### Conversation Engine owns

1. **Understanding** — intent detection, information extraction, language detection, FAQ routing
2. **Memory** — conversation profile, qualification capture state, turn context (via `informationModel`, `qualificationCaptureState`, `memoryEngine`)
3. **Decision** — which business action to invoke next (via `businessRulesEngine`, `conversationRouter`)
4. **Delegation** — call the canonical application service / engine for the action; never reimplement it
5. **Copy** — user-facing wording only (`conversationCopy.js`, `teamVisionWorkflowCopy.js`, `responseBuilder.js`, `personalityEngine.js`)

### Conversation Engine must NOT own

- Slot capacity rules (→ `capacityEngine.js`, BR-006/BR-007)
- Coverage / interview-type decisions (→ `businessRulesEngine.js`)
- Calendar booking or event lifecycle (→ `schedulingService`, `googleCalendarIntegrationService`)
- Persisted appointment identity or lifecycle (→ `appointmentApplicationService.js`, `appointmentDomainService.js`, BR-039/BR-040)
- Workflow milestone advancement (→ `humanAdvancementEngine.js`, BR-035/BR-037)
- Outbound message transport (→ `communicationHub.js`, channel adapters)
- Mission Control / Appointments operational actions (→ `agentActionApplicationService.js`, `missionExecutionApplicationService.js`)

### Delegation contract

| Intent | Delegate to | Do not |
|--------|-------------|--------|
| Qualify prospect | `informationModel`, `businessRulesApplicator`, `businessRulesEngine` | Re-encode BR decisions in conversation conditionals |
| Offer schedule options | `schedulingEngine` / `appointmentSchedulingEngine` | Hard-code slot lists or capacity |
| Confirm interview | `missionExecutionApplicationService.executeScheduleInterview` or `appointmentApplicationService.createAppointment` | Call `createInterview` + manual `updateProspect` alone |
| Reschedule / cancel / complete | `appointmentApplicationService` | Mutate `appointment_date` / `calendar_event_id` directly |
| Advance recruiting workflow | `humanAdvancementEngine` / `advanceProspectWorkflow` | Set `current_step` without workflow engine |
| Send WhatsApp / email | `communicationHub` + outbound pipelines | Embed transport logic in semantic engine |
| Human assist / escalation | `appointmentHumanAssistBridge`, BR-034 stall rules | Ad hoc flags in conversation-only state |

### Persistence rules

1. **Appointment truth** — persisted `atlas_appointments` UUID + lifecycle metadata (BR-039). Prospect scheduling fields are a **cache** updated only through the same orchestrators used by Mission Control and Appointments.
2. **Atomic scheduling** — conversation-initiated booking must use the same rollback-safe path as agent scheduling (calendar + appointment row + prospect cache + workflow, or full rollback).
3. **Read models** — conversation handoff/readiness signals must resolve appointment state through canonical lifecycle resolution, not raw `current_step === "CONFIRMED"` alone.

### Implementation gate

Before merging any Conversation Engine change, verify:

- [ ] No new business rule encoded only in `semanticConversationEngine.js`
- [ ] Scheduling confirmation delegates to production appointment/scheduling application services
- [ ] Workflow side effects go through `humanAdvancementEngine` / recruiting orchestrator
- [ ] Copy changes stay in conversation copy modules, not in engines that decide behavior

**Known refactor target:** ~~`semanticConversationEngine.completeInterview()` currently calls `createInterview()` and updates prospect rows directly~~ **Resolved (MVP Freeze Milestone 1)** — conversation confirmation delegates to `executeScheduleInterview` via `conversationScheduleDelegation.js`.

---

## BR-050 — Canonical Appointment Lifecycle (Read Model)

**Implements:** Architecture hardening — appointment state consistency (Sprint 13.x follow-up)  
**Engine target:** `appointmentLifecycleEngine.js` (proposed), `appointmentListQuery.js`, `appointmentDomainService.js`

Atlas must expose **one canonical appointment lifecycle** to every surface (Appointments tabs, Mission Control, Prospect Workspace, Conversation handoff). All read-side status, tab membership, and action visibility must derive from a single resolver — not independent interpretation of `appointment.status`, `prospect.appointment_date`, or `current_step`.

See engineering audit: consolidate `resolveLifecycleState()` (writes) and `resolveAppointmentListStatus()` (reads); enrich API DTOs with `canonicalLifecycleState`; sync prospect scheduling cache on every transition (Schedule, Confirm, Reschedule, Complete, Cancel, No Show).

### Recruiter handoff (MVP Freeze Milestone 2)

**Read model:** `appointmentHandoffReadModel.js` · **Resolver:** `appointmentListService.resolveRecruiterHandoffForProspect()` · **Orchestration:** `conversationEngine.buildHandoff()` / `buildHandoffForProspect()`

Rules:

1. **Handoff readiness** (`handoffReady`) derives from the **active persisted appointment** lifecycle via `resolveAppointmentListStatus()` — never from `prospect.current_step === "CONFIRMED"`.
2. **Appointment selection:** `findPersistedAppointmentForProspect()` (active) with `findLatestPersistedAppointmentForProspect()` fallback for terminal-only history. Rescheduled flows use the newest active appointment.
3. **Separate fields:** expose `appointmentLifecycle`, `handoffPhase`, and `prospectWorkflowStep` independently — do not collapse lifecycle, conversation outcome, workflow state, or mission state into one flag.
4. **Terminal lifecycles** (cancelled, completed, no_show) → `handoffPhase: terminal`, `handoffReady: false`. A cancelled appointment must never produce appointment-ready handoff.
5. **Active lifecycles** (scheduled, confirmed, rescheduled, pending_confirmation, in_progress) with active persisted row → `handoffPhase: active`. `handoffReady: true` only when also qualified (`work_authorized`), calendar linked on the **appointment** (`calendarEventId`), and email captured or in-person interview type.
6. **No appointment** → `handoffPhase: none`, `handoffReady: false`. Stale prospect cache (`current_step`, `calendar_event_id`) does not override missing or terminal persisted appointments.
7. **Scope:** organization and prospect phone filters apply in `appointmentListService` before handoff projection — UI and routes must not duplicate selection logic.

---

# Prospect Workspace

## BR-038 — Prospect Workspace Editing Permissions

Any authenticated recruiting user with access to a prospect may update that prospect's information in Prospect Workspace.

Applies to: Representative, Field Trainer, Regional Leader, Division Leader, RVP, and Administrator.

Rules:

1. **Update Prospect** requires `prospect:write` and existing organization/visibility access — not administrator privileges.
2. Prospect Workspace is the primary location for maintaining prospect information as conversations evolve.
3. Visibility and ownership rules from the authorization service still apply; write permission does not bypass prospect access checks.

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
| Conversation | `conversationEngine.js`, `semanticConversationEngine.js` | Understand → remember → decide → **delegate** (BR-049); copy in separate modules |
| Appointments | `appointmentApplicationService.js`, `appointmentDomainService.js` | Persisted appointment lifecycle (BR-039, BR-050) |
| Mission execution | `missionExecutionApplicationService.js` | Atomic schedule-interview orchestration |
| Copy | `conversationCopy.js` | User-facing wording from rule decisions |
| Scheduling | `schedulingEngine.js` | Available times and slot logic |
| Capacity | `capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Agent Actions | `agentActionEngine.js` | Next Actions visibility and execution (BR-025 – BR-032) |
| Workflow | `milestoneMapper.js`, `workflowReadModel.js`, `workflowStateStore.js`, `stallDetectionEngine.js`, `workflowOwnershipEngine.js`, `milestoneValidationEngine.js`, `humanAdvancementEngine.js` | Milestones, ownership, stall detection, human advancement (BR-034 – BR-037) |
| Events | `eventEngine.js`, `workflowEventService.js` | Structured auditable workflow events |
