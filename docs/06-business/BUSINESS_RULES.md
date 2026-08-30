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
5. **Scope:** Presentation only — no changes to appointment lifecycle, scheduling, communications, or interview assignment (BR-042). Canonical Zoom URL snapshot/hydration is BR-076.

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
| **Not Interested** | Closes interview operational work; advances to **CLOSED**; excluded from default Mission Control / Prospect Center operational queue |

### Mission Control default queue (terminal close)

Default Mission Control / Prospect Center / latest navigation must show unresolved operational work only:

1. **Exclude from default queue:** `CLOSED` / `DO_NOT_CONTACT` milestones and terminal closed outcomes (`Not Interested`, `Not Qualified`, and other closed catalog outcomes). Prefer durable `workflow_state.canonicalMilestone`, recorded agent outcome, then durable appointment `outcome=not_interested` when ephemeral agent state was wiped.
2. **Remain in queue when still actionable:** `No Show`, `Follow Up Needed`, `Rescheduled` / reschedule flows.
3. **Leave interview-result work, keep post-interview tracks:** `Recruited` → licensing/orientation workflow may remain visible; `Became Client` → client workflow may remain visible. They must not linger as pending interview-result work.
4. **Do not invent a new close flag.** Appointment Completed history remains under Appointments Completed.
5. **Meta-safe:** Do not change Meta Review demo visibility rules (BR-136 posture for `META_REVIEW` subjects).
6. **Conversations CLOSED / BR-136 TEST filtering unchanged.**

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

## BR-051 — Policy Intelligence Foundation

**Implements:** Policy Intelligence module foundation  
**Domain:** Business  
**Capability:** Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence` · workspace route `/app/policy-intelligence`

Policy Intelligence is a **Business** module for organizing policy document reviews. Foundation scope establishes navigation, RBAC, persistence aggregates, and a workspace shell.

### Rules

1. **Access** — Viewing the Policy Intelligence workspace and read APIs requires `policy:read`. Mutating reviews/documents/extractions requires `policy:write`. UI visibility does not replace API authorization.
2. **Aggregates** — Canonical persistence entities are **PolicyReview** (`atlas_policy_reviews`), **PolicyDocument** (`atlas_policy_documents`), and (from BR-052) **PolicyExtraction** (`atlas_policy_extractions`). Documents belong to exactly one review within an organization.
3. **No AI/OCR in foundation** — Foundation must not claim AI policy reading or OCR. Structured extraction is governed by **BR-052**.
4. **Tenant boundary** — All reviews, documents, and extractions are organization-scoped (`organization_id`). Cross-org access is forbidden.
5. **Engine boundary** — Policy Intelligence must not reimplement Conversation, Scheduling, Appointment, or Mission Control logic. Cross-module links (e.g. optional `prospect_id`) use published IDs/events, not repository reach-through.

### Role grants (foundation)

| Role | policy:read | policy:write |
|------|-------------|--------------|
| administrator | Yes | Yes |
| rvp / division_leader | Yes | Yes |
| agent / recruiter | Yes | Yes |
| support | Yes | No |
| operations | No | No |

---

## BR-052 — Atlas Extract (Policy Document Ingestion & Canonical Extraction)

**Implements:** Sprint 1 — Atlas Extract  
**Domain:** Business  
**Capability:** Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence`  
**Depends on:** BR-051

Atlas Extract is the **document ingestion and structured PolicyExtraction** pipeline for Policy Intelligence. It uploads and stores policy documents, then persists a **canonical structured model**. It does **not** perform AI reasoning or OCR.

### Rules

1. **Ingestion** — Documents are uploaded via authenticated `policy:write` APIs, stored in the private `policy-documents` bucket, and recorded on `atlas_policy_documents` with checksum, MIME type, size, and `upload_status`.
2. **Canonical model** — Structured results use **PolicyExtraction** (`atlas_policy_extractions`) with zero-knowledge `extracted_data` **schemaVersion `2.0`** (see **BR-054**). Legacy PII fields (`policyNumber`, names, beneficiaries, etc.) must be stripped on write.
3. **Allowed methods (Sprint 1)** — `structured_ingest` (client/API-supplied fields normalized into the canonical model) and `rules` (deterministic non-PII filename/product hints only). Methods `ai` and `ocr` are forbidden until a later BR explicitly enables them.
4. **No invented facts** — Normalization may trim/coerce types and apply deterministic rules hints; it must not fabricate carrier, coverage, or premium values via generative AI.
5. **One extraction per document** — Each `PolicyDocument` has at most one active `PolicyExtraction` row (unique on `policy_document_id`). Re-extract updates the same row.
6. **Review lifecycle** — First successful document store may advance a `draft` review to `uploaded`.
7. **Access** — Downloads use short-lived signed URLs; private bucket objects are not publicly listable.
8. **Capability flags** — Module may report `documentUpload: true` and `extraction: true` while keeping `ai: false` and `ocr: false`.
9. **PII isolation** — Atlas Extract must comply with **BR-054** (zero-knowledge Policy Intelligence).

---

## BR-054 — PII Isolation & Zero-Knowledge Policy Intelligence

**Implements:** Policy Intelligence privacy boundary  
**Domain:** Business (Intelligence) vs CRM identity ownership  
**Capability:** Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence`  
**Depends on:** BR-051, BR-052

The Intelligence Engine analyzes the **policy**, not the **person**.

- The **CRM** owns identity (names, contact data, prospect linkage).
- The **Policy Intelligence** subsystem owns insurance analysis only (mechanics, anonymous risk attributes, product economics).

These are separate bounded contexts. Recruit OS and Mission Control remain unchanged.

### Rules

1. **No PII in canonical extraction** — `PolicyExtraction.extracted_data` (schemaVersion `2.0`) must not store or expose: first/last/full name, address, email, phone, SSN/Tax ID, policy number, exact date of birth, beneficiary names, owner names, or agent names.
2. **Anonymous insured attributes only** — Identity is replaced by insurance attributes such as `insured.gender`, `insured.issueAge`, `insured.underwritingClass`, `insured.tobaccoStatus` (e.g. Male / Age 48 / Preferred Non-Smoker).
3. **Allowed mechanics fields** — Carrier, product/productType, premium, face amount, charges, cash values, COI, indexes, riders, coverages (type/limit/deductible — no person names), and non-PII `mechanics`.
4. **CRM linkage is internal** — `PolicyReview.prospectId` / review IDs may exist for Atlas CRM integration but must **never** be sent to AI prompts, knowledge embeddings, benchmark engines, shared reports, or research exports.
5. **Knowledge Center gate** — Before any Policy Intelligence content is indexed, embedded, benchmarked, or added to Knowledge Center, run PII sanitization (`prepareContentForKnowledgeIndex` / `knowledgeCenterGate`). Masks include `[REDACTED]`, `[POLICY_ID]`, `[ADDRESS]`, `[EMAIL]`.
6. **AI boundary** — No LLM request may include PII. AI receives only canonical insurance data via `buildAiPolicyContext` / `gateExtractionForAi`.
7. **Benchmark boundary** — Benchmark engines operate only on anonymous insurance characteristics (`toBenchmarkFeatures`).
8. **Reports** — Support `internal` (full Atlas RBAC access) and `shared` (automatically strip PII and CRM linkage).
9. **Normalization strips forbidden keys** — Writes through `normalizePolicyExtractionData` must drop denylisted PII keys even if clients send them.

### Acceptance

- Canonical extraction contains no PII.
- AI never receives PII.
- Knowledge Center stores only sanitized data for Policy Intelligence ingress.
- Benchmark engine operates only on anonymous insurance characteristics.
- Existing Atlas Recruit OS / Mission Control architecture remains unchanged.

---

## BR-056 — CRM / Policy Intelligence Boundary

**Implements:** Bounded-context separation between Atlas CRM and Policy Intelligence  
**Domain:** Business  
**Capability:** Analytics & Intelligence (mechanics) vs Prospect Management (identity)  
**Module:** `backend/modules/policy-intelligence`  
**Depends on:** BR-051, BR-052, BR-054

**CRM owns identity. Policy Intelligence owns policy mechanics.**

| CRM owns | Policy Intelligence owns |
|----------|--------------------------|
| Prospect / Client | Review ID |
| Policy Number | Carrier / Product |
| Owner / Insured names | Gender / Issue Age / Risk Classification / Tobacco |
| Appointments / Notes | Premium / Face Amount / Charges / COI / Cash Values |
| Contact PII | Indexes / Loans / Riders / Coverages |
| | Findings / Business Rules / Recommendations |

### Rules

1. **Review identity** — Policy Intelligence identifies every review **only** by `reviewId` in APIs, AI contexts, reports, embeddings, and exports.
2. **prospectId is internal FK only** — May exist on `atlas_policy_reviews.prospect_id` for CRM integration. Must **never** be sent to AI, exported, embedded, benchmarked, or shown in reports (internal or shared).
3. **Policy Number belongs to CRM** — Must never enter the canonical PolicyExtraction model. If reconciliation is required, store only `crm_policy_ref_hash` (org-scoped SHA-256), never plaintext.
4. **No client ownership concepts in PI** — Do not store or expose Owner Name, Insured Name, Beneficiary Name, Agent Name, Client Name, or Policy Holder Name.
5. **Intelligence Engine inputs** — Only anonymous insurance characteristics: gender, issue age, risk classification, tobacco status, carrier, product, face amount, premium, coverage, charges, cash values, indexes, loans, riders, business rules, findings, recommendations.
6. **Shared reports** — Contain no PII and no CRM linkage identifiers; anonymous insurance information only.
7. **Non-goals** — Do not change Recruit OS or Mission Control ownership of prospects, appointments, or CRM policy numbers.

### Acceptance

- Policy Intelligence cannot identify a person from its public model or reports.
- AI receives no client identity and no policy numbers.
- Reviews are addressed by `reviewId` only across PI surfaces.

---

## BR-057 — Facts Before Findings

**Implements:** Sprint 2 — Insurance Language Layer pipeline  
**Domain:** Business / Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence/domain/insurance-language`  
**Depends on:** BR-052, BR-054, BR-056

Pipeline (strict order — frozen):

```
Atlas Extract
      ↓
Insurance Facts
      ↓
Annual Values Engine
      ↓
Business Rules
      ↓
Findings
      ↓
Recommendations
      ↓
AI Narrative
```

Comparison Engine (BR-061) consumes Facts / Annual Values / Findings / Recommendations and does not alter this order.

### Rules

1. **Facts are immutable** — created only by Atlas Extract (see BR-058).
2. **Findings are derived** — produced only by deterministic Business Rules that read Facts.
3. **Recommendations are generated** — produced only from Findings (never directly from AI or free-form extract fields).
4. **AI only explains** — AI Narrative consumes **Facts + Findings only**. AI never creates Facts, never modifies Facts, and does not invent Findings.
5. **Separation** — Findings are not Facts. Recommendations are not Findings.
6. **Vocabulary** — Carrier terminology maps into Atlas canonical Insurance Language before Facts are frozen.

---

## BR-058 — Immutable Insurance Facts

**Implements:** Sprint 2 — Fact immutability  
**Domain:** Business / Analytics & Intelligence  
**Module:** `InsuranceFacts.js`  
**Depends on:** BR-057

### Rules

1. **Create/modify path** — Insurance Facts may be created or replaced **only** by Atlas Extract from the source document extraction path.
2. **Business Rules** — may **READ** Facts; may **NEVER** modify Facts.
3. **AI** — may **READ** Facts (with Findings); may **NEVER** modify Facts or create Facts.
4. **Change control** — Only a new extraction from the original source document may change Facts (new frozen snapshot).
5. **Runtime** — Fact objects are deep-frozen; `assertInsuranceFactsImmutable` guards consumers.

---

## BR-059 — Deterministic Policy Intelligence Rule Engine

**Implements:** Sprint 3 — Policy Intelligence Rule Engine  
**Domain:** Business / Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence/domain/insurance-language/rule-engine`  
**Depends on:** BR-057, BR-058

### Rules

1. **Deterministic only** — Every Finding originates from a coded business rule. No OCR, no AI reasoning, no LLM decisions inside the rule engine.
2. **Facts are read-only** — Rules may READ immutable Insurance Facts and must NEVER modify them (BR-058).
3. **Standard rule object** — Each rule has: unique `id` (PI-XXX), `name`, `category`, `severity`, `inputs`, deterministic `evaluate` logic, Finding text, optional Recommendation, explanation, and evidence references to Facts.
4. **Categories** — Policy Design, Charges, Cash Value, Sustainability, Index Strategy, Complexity, Policy Health.
5. **Evidence required** — Every Finding includes `ruleId`, `severity`, `finding`, optional `recommendation`, `explanation`, and `evidence` (with Fact field references).
6. **Configurable thresholds** — Numeric/list thresholds (e.g. illustration duration gap, rider count) are configurable; defaults live in `ruleThresholds.js`.
7. **Execution metadata** — Engine returns `rulesExecuted`, `rulesPassed`, `rulesTriggered`, and `executionTime` (ms) alongside Findings.
8. **Independently testable** — Each rule can be executed and asserted in isolation.

### Initial library

PI-001 Carrier Identified · PI-002 Product Identified · PI-003 Increasing Death Benefit · PI-004 Level Death Benefit · PI-005 High Illustration Dependency · PI-006 Volatility-Controlled Index · PI-007 Multiple Riders · PI-008 Indexed Crediting Strategy · PI-009 Flexible Premium Structure · PI-010 Required Insurance Facts Missing

---

## BR-060 — Annual Values Engine

**Implements:** Sprint 4A — Annual Values Engine  
**Domain:** Business / Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence/domain/annual-values`  
**Depends on:** BR-051, BR-052, BR-054, BR-056, BR-058

### Rules

1. **Extension only** — Annual Values extend Policy Intelligence. Do not redesign Atlas Extract, Insurance Facts, Rule Engine, Language Layer, or Recommendations.
2. **Canonical row** — Every AnnualValue includes: policyYear, insuredAge, annualPremium, scheduledPremium, premiumLoad, administrativeCharge, costOfInsurance, riderCharges, interestCredited, accountValue, cashValue, cashSurrenderValue, deathBenefit, loanBalance, withdrawals, netCashValue.
3. **Storage** — Canonical AnnualValue entities persist linked to `reviewId` (`atlas_policy_annual_value_sets` + `atlas_policy_annual_values`). Insurance Facts remain immutable and separate.
4. **Missing values** — Missing illustration cells become `null`. Values are never guessed or invented by AI/OCR.
5. **Validation** — Policy years must be sequential; ages must increase correctly; premium / cash / death benefit fields must be numeric or null.
6. **Deterministic calculations** — Total Premiums Paid, Total COI, Total Administrative Charges, Total Rider Charges, Total Internal Charges, Cash Value at ages 65/70/80/90, Break-even Year, Policy Duration.
7. **Output** — Timeline + Summary Metrics + Calculation Metadata + Validation Results.
8. **No OCR / No GPT** — Structured annual tables only (ingest or fixture). AI narrative remains unchanged (Facts + Findings only).

---

## BR-061 — Policy Intelligence Comparison Engine

**Implements:** Sprint 5 — Comparison Engine  
**Domain:** Business / Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence/domain/comparison`  
**Depends on:** BR-057, BR-058, BR-059, BR-060

### Rules

1. **Calculations only** — The Comparison Engine performs deterministic calculations. No AI. No OCR.
2. **Consumes pipeline outputs** — Comparison consumes Insurance Facts, Annual Values, Findings, and Recommendations. It does **not** generate new Facts.
3. **Facts immutable** — Source Insurance Facts remain immutable (BR-058). Stress scenarios use cloned scenario snapshots only.
4. **Scenario model** — Each scenario includes its own Facts snapshot, Annual Values, Findings, and Recommendations. Supported types include Current Policy, Stress Test, Alternative Funding, Alternative Strategy.
5. **Canonical ComparisonResult** — Each metric row includes Metric, Scenario A, Scenario B, Difference, Percentage Difference, and Winner (when direction applies).
6. **Metrics** — Annual Premium, Lifetime Premium, Total COI, Administrative Charges, Premium Loads, Rider Charges, Total Internal Charges, Cash Value, Cash Surrender Value, Death Benefit, Break-even Year, Guaranteed Duration, Illustrated Duration, Policy Duration.
7. **Stress tests** — Deterministic stress kinds include illustrated-rate reduction and minimum funding. Scenario math remains deterministic.
8. **Extensible types** — Comparison types are registered (side_by_side, current_vs_stress, current_vs_alternative_funding, current_iul_vs_alternative) so future comparison modes can be added without redesign.

---

## BR-144 — Policy Cost + Living Benefit Economics

**Implements:** Canonical IUL policy-cost categories, living-benefit/rider economics, provenance/classification, and report-ready DTOs (no UI).  
**Domain:** Business / Analytics & Intelligence  
**Capability:** Analytics & Intelligence  
**Module:** `backend/modules/policy-intelligence/domain/policy-economics`  
**Depends on:** BR-052, BR-054, BR-057, BR-058, BR-060  
**Related:** BR-061 (consumes Facts / Annual Values; does not invent costs)  
**Status:** Implemented (data layer + client-facing report UI consumes DTOs; no new calculations)  
**Persistence:** Existing JSONB (`extracted_data`, annual-value-set `metadata`, annual-value row `metadata`). **No database migration.** Do not alter migrations 024 or 029.

### Rules

1. **Seven cost categories** — Percent of Premium Expense Charge; Cost of Insurance / Monthly COI; Monthly Expense Charge; Monthly Policy Fee; Monthly % of Accumulated Value Charge; Rider Charges; Surrender Charges. Contract-level rates/fees live in extraction JSON/metadata. Annual dollars persist only when explicitly sourced (existing BR-060 columns or overlay metadata). Surrender charge stays separate from CSV.
2. **Null is never zero** — Unavailable costs classify as `NOT_AVAILABLE` with `value: null`. Only an explicit source zero may be stored as `0` (`EXTRACTED_EXACT`). Totals (including total COI, rider charges, admin/load, and “total known policy costs”) must not coerce an all-null series to `$0`.
3. **No inferred COI** — Never derive COI from AV, CSV, premium, or AV−CSV differences. Continuation-of-COI rate endorsements are not annual COI dollars.
4. **Classifications** — `EXTRACTED_EXACT` · `CALCULATED_FROM_EXPLICIT_TERMS` · `NOT_AVAILABLE` · `CARRIER_CALCULATION_REQUIRED`. Provenance (page, section/table, form/version, snippet or hash, adapter/extractor id, classification, null reason) rides with each field when available. `invented` and `interpolated` remain false.
5. **Living-benefit economics** — Canonical rider model includes carrier, issuer, product, form/version, name/type, trigger, eligibility, min/max acceleration, event limits, claim frequency/max claims, admin fees, rider charges, discount methodology, discount factor only if explicitly supplied, discount variables, elected acceleration, actual cash benefit, remaining DB, AV/CSV impact, loan/debt effect, tax/Medicaid caveats, and provenance.
6. **Cash ≠ accelerated DB** — Never assume cash benefit equals death benefit accelerated. If the document lacks a complete calculation chain, classification is `CARRIER_CALCULATION_REQUIRED` and report text is: “Exact accelerated benefit cannot be determined from this policy document alone. A current carrier-specific calculation is required.”
7. **Carrier isolation** — Nationwide IUL Protector II and National Life / LSW FlexLife II use separate adapters. Do not reuse Nationwide column maps, discount factors, or rider assumptions on National Life (or the reverse). National Life sample 6.5% ABR values remain illustrative only; exact payout stays `CARRIER_CALCULATION_REQUIRED`.
8. **Insurance Facts pass-through** — Facts must preserve full safe rider economics (not `{type, amount, notes}` only). Facts remain immutable (BR-058).
9. **Report DTOs and client report** — Policy cost checkpoints use years 1, 10, 20, 30, 40… with 5-year fallback only when an exact year is absent. Living-benefit cards carry qualify / limits / methodology / exact payout or carrier-calculation-required / remaining DB / AV-CSV effect / provenance. The client-facing report UI consumes these DTOs and must not re-parse documents or invent costs, rider payouts, or investment series.
10. **Boundaries** — Do not redesign annual ledger parsing except additive metadata/pass-through. Do not change BR-142, BR-143, Comparison stress fail-closed math, or Recruit OS / Meta / calendar / WhatsApp.

---

## BR-062 — Financial Intelligence Boundary

**Implements:** RC2 architecture / RC3 Phase A runtime  
**Domain:** Financial Intelligence  
**Module:** `backend/modules/financial-intelligence`  
**Depends on:** BR-051–BR-061, BR-066  
**Status:** Approved (RC3 enforceable)

### Rules

1. **Consume, do not mutate** — Financial Intelligence may read Policy Intelligence outputs through an adapter and must never write strategy data into PI Facts, PI Rule Engine results, PI Annual Values, PI Findings, PI Comparison outputs, or shared PI reports.
2. **FI-owned snapshot** — Relevant PI Facts are copied into a Financial Intelligence-owned `CurrentIulSnapshot` for reproducible evaluation.
3. **Fail closed** — Strategy evaluation fails closed when the source product is not IUL-compatible, premium cannot be normalized, or face amount is missing/invalid.
4. **Anonymity intact** — FI must not infer identity or add personally identifying data into Policy Intelligence.
5. **Tenant isolation** — Evaluations are scoped by organization; cross-tenant access is forbidden.

---

## BR-063 — Strategy Catalog Ownership

**Implements:** RC2 architecture / RC3 pending-verification fund config  
**Domain:** Financial Intelligence  
**Module:** `domain/config/fundFamilyConfig.js`  
**Depends on:** BR-062, BR-066  
**Status:** Approved (catalog verification deferred)

### Rules

1. **FI owns strategies** — Organization strategy catalog entries (including fund-family configuration) live only in Financial Intelligence.
2. **PI never references org strategies** — Policy Intelligence engines must not embed Team Vision / Primerica placement logic.
3. **Pending verification** — Unverified symbols and fund metadata must carry `verificationStatus = PENDING_VERIFICATION` and `availabilityStatus = UNKNOWN`.
4. **No client fund recommendations** — RC3 UI must not present unverified symbols as client recommendations; general categories only until an authoritative catalog is verified.

---

## BR-064 — Active Product Presentation Rule

**Implements:** RC2 architecture (deferred product eligibility in RC3)  
**Domain:** Financial Intelligence  
**Depends on:** BR-062, BR-063, BR-066  
**Status:** Approved (automated eligibility deferred)

### Rules

1. **Active products for new presentations** — When a verified product catalog exists, FI may evaluate ACTIVE products only for new strategy presentations.
2. **LEGACY / RETIRED** — LEGACY or RETIRED products must not be newly presented as placements.
3. **RC3 constraint** — Without official Primerica eligibility integration, Atlas must not invent product eligibility or claim longest available term without representative confirmation fields.

---

## BR-065 — Analysis vs Strategy Evaluation Separation

**Implements:** RC2 architecture / RC3 naming  
**Domain:** Policy Intelligence / Financial Intelligence  
**Depends on:** BR-062, BR-066  
**Status:** Approved

### Rules

1. **PI = analysis** — Policy Intelligence answers what the client currently owns (facts, findings, annual values, comparisons).
2. **FI = educational strategy evaluation** — Financial Intelligence produces organization discussion scenarios / planning illustrations, not client recommendations.
3. **Canonical naming** — Runtime capability is **Invest-the-Difference Strategy Evaluation**. Client/report section title is **Possible Discussion Scenarios for the Primerica Representative**.
4. **Forbidden language** — Surfaces must avoid “Atlas recommends,” “best investment,” “best fund,” “replace this policy,” “client should surrender,” “final suitability determination,” or “approved for the client.”

---

## BR-066 — Human Recommendation Boundary

**Implements:** Sprint RC2 — Financial Intelligence Governance  
**Domain:** Platform / Financial Intelligence / Policy Intelligence  
**Module:** Architecture governance (all analysis & strategy surfaces)  
**Depends on:** BR-051–BR-061; Financial Intelligence Architecture (RC2)  
**Status:** Approved

### Definition

Atlas generates **analysis**, **education**, **comparisons**, and **strategy evaluations**.

Atlas **never** replaces the professional judgment of a licensed advisor.

Atlas does **not** determine suitability.

Atlas does **not** recommend purchasing or replacing products.

**Final recommendations** belong to the licensed financial professional.

**Final decisions** belong to the client.

### Rules

1. **Inform, do not decide** — Atlas may analyze policies, compare strategies, calculate projections, explain findings, educate, support advisor discussions, document assumptions, and record outcomes.
2. **Forbidden automated advice** — Atlas shall not recommend purchasing a product, replacing a policy, or surrendering a policy.
3. **No suitability engine** — Atlas shall not determine client suitability for any product or strategy.
4. **No substitution of judgment** — Atlas shall not replace professional judgment or make legal, tax, or regulatory decisions.
5. **Layer clarity** — Policy Intelligence produces facts and evidence-based findings. Financial Intelligence produces organization strategy evaluations. Advisors present. Clients decide. Mission Control records outcomes.
6. **Explainability** — Any strategy evaluation or projection shown to users must remain explainable and must expose material assumptions.
7. **Applies everywhere** — BR-066 governs Recruit OS presentations, Policy Intelligence, Financial Intelligence, Knowledge Center framing, and AI narratives that discuss products or strategies.

### Creed

```
Atlas informs.
Advisors recommend.
Clients decide.
```

See: [FINANCIAL_INTELLIGENCE_ARCHITECTURE.md](../08-financial-intelligence/FINANCIAL_INTELLIGENCE_ARCHITECTURE.md) §§13–18.

---

## BR-067 — Invest-the-Difference Same-Outlay Rule

**Implements:** RC3 Phase A — Invest-the-Difference Strategy Evaluation  
**Domain:** Financial Intelligence  
**Module:** `investTheDifferenceEngine.js`  
**Depends on:** BR-062, BR-065, BR-066  
**Status:** Approved

### Rules

1. **Default outlay** — `totalProposedMonthlyOutlay = currentIulMonthlyPremium` unless a documented representative override exists.
2. **Same death benefit** — Initial term comparison uses `proposedTermDeathBenefit = currentIulDeathBenefit`.
3. **Difference math** — `unboundedPremiumDifference = currentIulMonthlyPremium - proposedTermMonthlyPremium`; `monthlyInvestmentDifference = max(0, unboundedPremiumDifference)`; `proposedMutualFundContribution = monthlyInvestmentDifference`.
4. **Identity check** — `proposedTermMonthlyPremium + proposedMutualFundContribution ≈ totalProposedMonthlyOutlay` within currency tolerance.
5. **No silent increase** — Atlas must not silently raise the client’s monthly outlay.
6. **Negative difference** — Negative unbounded difference yields zero investable contribution and a representative-review warning; unbounded difference is retained for audit.

---

## BR-068 — Representative-Entered Term Quote Source

**Implements:** RC3 Phase A  
**Domain:** Financial Intelligence  
**Module:** `termQuoteModel.js`  
**Depends on:** BR-064, BR-066, BR-067  
**Status:** Approved

### Rules

1. **Identified source required** — Term premiums must come from an identified source: `OFFICIAL_QUOTE`, `REPRESENTATIVE_CONFIRMED`, `PRELIMINARY_ESTIMATE`, or `MISSING`.
2. **No invented rates** — Atlas must not generate term premiums from invented rate tables.
3. **No automatic longest-term claim** — Atlas must not automatically claim the entered duration is the longest eligible Primerica term.
4. **Confirmation fields** — Capture `selectedTermDuration`, `longestAvailableTermConfirmed`, `eligibilitySource`, `eligibilityConfirmedAt`.
5. **Absent confirmation copy** — When confirmation is absent, display: “The representative must confirm the longest available Primerica term and official premium.”

---

## BR-069 — Educational Projection Assumptions

**Implements:** RC3 Phase A  
**Domain:** Financial Intelligence  
**Module:** `projectionAssumptions.js`, `monthlyFutureValue.js`  
**Depends on:** BR-066, BR-067  
**Status:** Approved

### Rules

1. **Canonical scenarios** — Conservative 4%, Moderate Growth 7%, Aggressive Growth 10% live in one configuration module.
2. **Labels required** — Projections must be labeled Hypothetical, Educational, and Non-guaranteed, with fee methodology disclosed.
3. **Methodology** — Future value of an ordinary annuity with monthly contributions and monthly compounding.
4. **Separated outputs** — Return total contributions, illustrative growth, and illustrative ending value separately.
5. **No React math** — Calculation logic must not live inside React components.
6. **Horizon is distinct** — Investment projection horizon is representative-entered and must not silently default to term duration.

---

## BR-070 — Risk Profile Emphasis Gate

**Implements:** RC3 Phase A  
**Domain:** Financial Intelligence  
**Depends on:** BR-066  
**Status:** Approved

### Rules

1. **No automated suitability** — Risk-profile values are representative-entered planning inputs, not Atlas suitability determinations.
2. **Approved values** — `NOT_COMPLETED`, `CONSERVATIVE`, `MODERATE`, `AGGRESSIVE`.
3. **Emphasis gate** — Do not highlight a scenario as aligned unless a representative records a risk-profile classification.
4. **Neutral viewing allowed** — Risk-profile absence may prevent scenario emphasis but should not necessarily prevent viewing an unranked educational illustration.
5. **Absent copy** — Display: “Complete the client risk-profile process before emphasizing an investment scenario.”

---

## BR-071 — Replacement Safeguards

**Implements:** RC3 Phase A  
**Domain:** Financial Intelligence / Compliance  
**Depends on:** BR-066  
**Status:** Approved

### Rules

1. **Prominent display** — Strategy evaluation surfaces must display replacement safeguards covering: do not cancel/surrender before new coverage is in force; underwriting may decline/rate/delay; replacement forms may be required; surrender charges/loans/tax/riders/guarantees/contestability differences; term has no cash value and expires; mutual funds may lose value; returns are not guaranteed.
2. **No surrender instruction** — Atlas must never produce an instruction to cancel the existing policy.
3. **Readiness** — Arithmetic alone does not mark an evaluation ready; replacement acknowledgement participates in status readiness.

---

## BR-072 — Strategy Evaluation Versioning and Overrides

**Implements:** RC3 Phase A  
**Domain:** Financial Intelligence  
**Module:** `StrategyEvaluationService.js`  
**Depends on:** BR-062, BR-067  
**Status:** Approved

### Rules

1. **Immutable revisions** — Material representative input changes preserve the prior evaluation and create a new version (prior marked `SUPERSEDED`).
2. **Override reason required** — Representative overrides of total proposed monthly outlay require a reason and preserve the original generated evaluation.
3. **Persistence** — FI-owned persistence links primarily to `reviewId` with optional CRM `prospect_id` outside PI Facts/shared reports.
4. **Audit** — Create/update/override/revision actions write audit entries.

---

## BR-073 — Missing Inputs Must Be Exposed

**Implements:** RC3 Phase A  
**Domain:** Financial Intelligence  
**Depends on:** BR-062, BR-066, BR-068, BR-069, BR-070  
**Status:** Approved

### Rules

1. **Expose, do not fabricate** — Missing premiums, death benefits, quotes, eligibility confirmations, horizons, and risk profiles must be exposed as warnings — never fabricated.
2. **Status model** — Explicit draft statuses include missing policy data, term quote required, term confirmation required, investment horizon required, risk profile required, and replacement review required.
3. **Ready gate** — Do not mark READY merely because arithmetic works; readiness is defined in the canonical status service.

---

## BR-075 — WhatsApp Outbound Customer-Care Window and Approved-Template Gate

**Implements:** Recruit AI Production Readiness — WhatsApp outbound safety  
**Domain:** Communications / Recruit AI  
**Depends on:** BR-012, BR-041  
**Status:** Approved  
**Engine target:** `whatsappOutboundAuthorizationGate.js`, `whatsappCustomerCareWindow.js`, `whatsappApprovedTemplateRegistry.js`, `whatsappOutboundPipeline.js`

### Rules

1. **Single canonical gate** — Every real WhatsApp Cloud API send must authorize through one outbound gate before Graph delivery. No unguarded category-specific bypasses (reminders, follow-ups, CE replies, agent sends, lead welcome).
2. **Customer-care window source** — The window opens only from the latest valid **inbound** customer WhatsApp message timestamp in durable `conversation_logs` (UTC). Do not use frontend time, process memory, `workflowState.json`, `agentActionState.json`, last outbound timestamp, or appointment creation time as a substitute.
3. **Canonical duration** — Window length is defined once as `CUSTOMER_CARE_WINDOW_MS` (24 hours). Do not hardcode alternate durations in callers.
4. **Inside the window** — Free-form text replies are permitted for immediate Recruit AI / qualification conversation. Delivery must be recorded with status `sent_freeform`.
5. **Outside the window** — Free-form text must never be sent. Atlas must either send an **approved and active** Meta template from the registry whose purpose matches the outbound intent, or fail closed with a durable blocked/retry record (`blocked_window_closed`, `blocked_template_missing`, `blocked_template_unapproved`, or `retry_required` / `provider_failed`).
6. **Approved templates only** — Template names come from the approved registry (optionally activated via operational `WHATSAPP_APPROVED_TEMPLATES_JSON`). Caller-supplied Meta template names are rejected. Placeholder/internal copy templates are not Meta-approved.
7. **Preferred language for templates** — Template locale selection uses canonical `preferred_language`. Mutable conversation-language fields must not override a valid preferred language. If preferred language is missing, use the documented default (`english`). Missing language-specific approved templates fail closed (no silent cross-language fallback).
8. **Reminders and follow-ups** — Appointment reminders, no-response follow-ups, missed-appointment, and reschedule confirmations use the same gate. A blocked reminder must not be marked `sent`. Appointment rows remain valid when confirmation/reminder delivery is blocked.
9. **Workflow integrity** — Blocked or failed outbound must not advance workflow as though contact occurred (no false `MESSAGE_SENT` / reminder-sent completion). Immediate appointment creation is not rolled back solely because an outbound confirmation is blocked; record appointment and communication delivery state separately.
10. **Durable failure** — Blocked/failed attempts persist to `whatsapp_outbound_deliveries` (and sanitized conversation/business-event audit). Do not store critical blocked state only in memory or local JSON.
11. **Idempotency** — Successful sends with an idempotency key must not create duplicate provider template deliveries on retry.
12. **Sanitized results** — Delivery results expose status, intent, mode, template key, retryability, and safe reason — never access tokens, app secrets, or raw provider payloads.
13. **Meta Review boundary** — Meta Review allowlist, language lock, session scoping, and WhatsApp-only reviewer behavior remain unchanged by this rule.

### Operational requirement

Production outside-window messaging requires firm-approved Meta templates configured in `WHATSAPP_APPROVED_TEMPLATES_JSON` (or equivalent ops configuration). Until configured, outside-window sends fail closed by design.

---

## BR-076 — Zoom Meeting URL Snapshot on Canonical Appointments

**Implements:** Zoom URL legacy-repair / incomplete-`existingBooking` fix  
**Domain:** Appointments / Meeting Management  
**Depends on:** BR-039, BR-043, BR-050  
**Status:** Approved  
**Engine target:** `virtualMeetingUrlResolver.js`, `appointmentApplicationService.js`, `meetingManagementService.js`

### Rules

1. **Canonical snapshot** — For Zoom/virtual appointments, Atlas resolves an approved meeting URL and persists it on `atlas_appointments.virtual_meeting_url` with `metadata.virtualUrlStatus` and `metadata.virtualUrlSource`. Join Zoom (BR-043) and Calendar/WhatsApp consumers read the appointment snapshot — not live Settings on every render.
2. **Resolution precedence** — (1) valid persisted appointment URL; (2) valid URL on `existingBooking`; (3) valid same-organization Personal Meeting URL from Meeting Management; (4) `null` with `virtualUrlStatus = pending`.
3. **Incomplete booking must not suppress org URL** — An `existingBooking` used by legacy repair or other paths that omits `meetingUrl` / `zoomLink` / `meetLink` must still hydrate from organization Meeting Management when configured.
4. **Validation** — Only approved HTTPS Zoom hosts (`zoom.us` / `*.zoom.us` / `zoom.gov` / `*.zoom.gov`) may be snapshotted. Never fabricate a meeting URL or create a new Zoom meeting from this rule.
5. **Organization isolation** — Never use another organization’s Personal Meeting URL.
6. **In-person** — Never populate `virtual_meeting_url` for in-person appointments.
7. **Reschedule** — Preserve an existing valid appointment URL. If missing, fill from the current approved organization URL. Do not replace a valid appointment URL merely because Settings changed (unless an explicit refresh action is approved later).
8. **Null safety** — Null booking fields or null Settings must never erase a valid persisted appointment URL.
9. **Provenance** — Record `virtualUrlSource` as `persisted_appointment` | `existing_booking` | `organization_meeting_settings` | `unavailable`.
10. **Boundaries** — Does not change BR-075, Meta Review, or invent Google Calendar events without the normal sync engines. Calendar inclusion of the URL continues through existing sync payloads that read `virtualMeetingUrl`.

---

## BR-077 — Office Address Snapshot on Canonical In-Person Appointments

**Implements:** Full office address (including suite/unit) for in-person appointments  
**Domain:** Appointments / Meeting Management  
**Depends on:** BR-018, BR-039, BR-050  
**Status:** Approved  
**Engine target:** `officeAddressResolver.js`, `appointmentApplicationService.js`, `appointmentConfirmationCopy.js`

### Rules

1. **Canonical snapshot** — For in-person appointments, Atlas resolves the complete same-organization office address and persists it on `atlas_appointments.meeting_address` with `metadata.officeAddressStatus` and `metadata.officeAddressSource`. Confirmation, reminders, resend details, Send Office Address, and Calendar consumers should prefer that snapshot.
2. **Resolution precedence** — (1) valid persisted appointment `meeting_address` when preserving; (2) valid explicit request address; (3) Meeting Management `officeAddress`; (4) BR-018 organization `fullAddress`; (5) unavailable.
3. **Completeness** — Never construct a partial truthy address (e.g. city/state only) that suppresses `fullAddress`. Always include suite/unit when present in the configured source.
4. **No truncated hardcode** — Do not use a hardcoded address that omits suite or changes city (legacy “Miami, Florida” string is forbidden).
5. **Field mapping** — When composing from structured office fields, use `street` + `suite` + `city` + `state` + `zip` (or `fullAddress`). Do not join legacy `address`/`postalCode` keys that drop suite.
6. **Virtual appointments** — Never populate `meeting_address` with office address for Zoom/virtual appointments.
7. **Organization isolation** — Never use another organization’s office address.
8. **Provenance** — Record `officeAddressSource` as `persisted_appointment` | `request` | `meeting_management` | `organization_profile` | `unavailable`.
9. **Boundaries** — Does not send WhatsApp, mutate legacy rows, or invent Calendar events. Data repair and Calendar update for existing truncated rows are separate authorized operations.

---

## BR-078 — WhatsApp Approved Template Catalog and Call-Site Mapping

**Implements:** Meta WhatsApp template catalog semantics, intent→key mapping, parameters, and language rules  
**Domain:** Communications / Recruit AI  
**Depends on:** BR-075, BR-041, BR-012  
**Related:** BR-076 (Zoom URL), BR-077 (office address), BR-092 (Zoom button suffix), BR-093 (confirmation meeting details)  
**Status:** Implemented in code (Phase 1) — catalog contracts + call-site wiring ready; templates remain inactive until Meta approval + explicit env authorization  
**Engine target:** `whatsappApprovedTemplateRegistry.js`, `whatsappTemplateVariableBuilder.js`, outbound call sites, ops `WHATSAPP_APPROVED_TEMPLATES_JSON`  
**Approval packet:** `docs/03-engineering/WHATSAPP_TEMPLATE_APPROVAL_PACKET.md`

### Rules

1. **Gate vs catalog** — BR-075 remains the sole authorization gate for every Cloud API send. BR-078 defines which registry keys exist, which intents map to them, required parameters, categories, and language selection rules for templates.
2. **No outside-window freeform fallback** — If the customer-care window is closed, Atlas may send only an exact approved+active Meta template for the resolved registry key and preferred-language locale. Otherwise fail closed.
3. **Exact activation tuple** — Outside-window send requires exact registry key + exact locale (`english` / `spanish`) + `approved: true` + `active: true` + non-empty `metaTemplateName`. Missing or invalid mapping fails closed.
4. **Semantic separation** — Confirmation, reminder, details/reschedule, missed, Zoom, location, human-assist, and lead welcome are distinct keys. Do not alias `CONFIRMATION` onto `interview_reminder`. Do not reuse `interview_details` for initial confirmation.
5. **Marketing retention** — Templates classified as marketing (including `lead_welcome`) must remain marketing. Do not reclassify recruiting/marketing content as utility to ease Meta approval.
6. **Preferred language** — Template locale uses canonical `preferred_language`. Never send both languages. No silent EN↔ES fallback.
7. **Canonical data** — Appointment datetime, Zoom URL (BR-076), and meeting address (BR-077 / appointment snapshot) must come from canonical sources. Never fabricate Zoom URLs. Never substitute office address for a public-location appointment.
8. **Production activation** — Setting real Meta template names in production `WHATSAPP_APPROVED_TEMPLATES_JSON` requires (a) Meta approval of those templates and (b) explicit environment authorization. Phase 0 drafts and inactive JSON examples are not activation.
9. **Boundaries** — Does not itself send WhatsApp, submit templates to Meta, connect ads, or weaken BR-075 fail-closed behavior.

---

## BR-079 — Organization-Local Calendar Windows

**Implements:** Team Dashboard / Alpha Brief / relative-date metrics timezone correctness  
**Domain:** Dashboards / Analytics / Operations  
**Depends on:** organization settings, appointment profile defaults  
**Related:** BR-035–037 (follow-ups), BR-050 (appointments)  
**Status:** Implemented  
**Engine target:** `organizationDateWindow.js`, Alpha Brief, Executive Dashboard, Prospect Center filters, Appointments today view, Follow-ups overdue/due-today

### Rules

1. **Organization timezone is the calendar source of truth** — User-facing relative dates (`today`, `yesterday`, `tomorrow`, `this week`, `last week`, `current month`, `previous month`, interviews today, prospects created yesterday, overdue as of today) use the organization’s configured business timezone.
2. **Server runtime timezone is never authoritative** — Railway UTC (or any host `TZ`) must not define business-calendar day boundaries. Do not use bare `setHours` / `startOfDay` / `endOfDay` without IANA timezone context for these metrics.
3. **Timezone precedence** — Resolve in order: (1) organization-configured timezone / organization settings, (2) organization profile timezone (e.g. appointment profile defaults), (3) approved Atlas default (`America/New_York` or `ATLAS_DEFAULT_TIMEZONE`), (4) `UTC` only as an explicit final fallback. Reject invalid IANA values and fall through.
4. **UTC boundaries for persistence comparisons** — Convert organization-local windows to UTC start/end instants and compare canonical timestamps (`created_at`, interview datetime, follow-up due) against those UTC bounds. Do not format database timestamps to local strings before comparison.
5. **DST-aware IANA calculations required** — Local days may not be 24 hours. Spring-forward and fall-back must use timezone-aware conversion (e.g. `Intl` / equivalent).
6. **Creation metrics are historical** — “Yesterday — new prospects” counts canonical prospects whose `created_at` falls in the previous organization-local calendar day, regardless of current lifecycle status (`NEW`, `QUALIFIED`, `INTERVIEW_SCHEDULED`, `CONFIRMED`, `COMPLETED`, `RECRUITED`, etc.).
7. **Organization isolation** — Date windows must use the authenticated session’s organization (or authorized report scope). Never apply another organization’s timezone. Never accept client-supplied timezone overrides. Cross-organization super-admin reports must resolve windows per organization; do not silently aggregate multi-org metrics under one timezone unless a report explicitly documents that behavior.
8. **Cache keys** — Any dashboard / Alpha Brief cache must include organization ID, effective timezone, and local date or resolved UTC window so a UTC-generated brief is never reused across organization-local days.
9. **Boundaries** — Does not change WhatsApp intake, Recruit AI behavior, Railway server `TZ`, or database timestamp storage format.
10. **Appointment wall clock → UTC** — Selected `dateKey` + `timeKey` for appointments are interpreted in the appointment profile / organization IANA timezone (default `America/New_York`) via `buildIsoTimestamp` → `zonedTimeToUtcMs`. Host/`Date` local constructors must never define the persisted `start_date_time` instant (BR-050).

---

## BR-114 — Recruit AI v2 One-User Live Conversation Authoring Cutover

**Implements:** Fail-closed hub-level gate so Recruit AI v2 may **author** customer-facing WhatsApp replies for exactly one allowlisted org + acting RVP — independent of BR-111 mutation authorization.  
**Domain:** Recruit AI / live conversation authoring cutover  
**Depends on:** BR-049, BR-050, BR-075, BR-079, BR-080, BR-081, BR-107, BR-108, BR-111, BR-112  
**Related:** BR-113 attribution remains for booking attempts; shadow/advisory never author live  
**Status:** Implemented in code; **live authoring OFF** and **execution OFF** in production  
**Engine target:** `recruitAiV2/liveAuthoringConfig.js`; `liveAuthoringBridge.js`; `legacyCeAppointmentMutationGate.js`; `communicationHub.processNormalizedInboundMessage`; `semanticConversationEngine.completeInterview`  
**Tests:** `backend/test/recruitAiV2LiveAuthoringBr114.test.js`; `backend/test/legacyCeAppointmentMutationGateAuthoringCanary.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/40_LIVE_AUTHORING_CUTOVER.md`

### Rules

1. **Authoring ≠ execution** — `RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED==="true"` only allows v2 to author the customer-facing reply. BR-111 still independently grants or denies appointment mutation. Authoring may be ON while execution remains OFF.
2. **Fail-closed authoring gates (ALL required)** — authoring flag exact true; exact `organizationId` in `RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS`; exact acting `atlas_users.id` in `RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS`. Missing/malformed/empty/mismatched → legacy CE unchanged.
3. **No role-derived permission** — Being RVP / DL / RL never authorizes authoring.
4. **Hub intercept before legacy CE** — Eligible turns are authored in `communicationHub.processNormalizedInboundMessage` before `handleIncomingMessage`. Successful v2 replies skip legacy CE for that turn.
5. **Canonical transport only** — Exactly one outbound via existing `sendAndPersistWhatsAppMessage`. No v2 WhatsApp sender.
6. **Durable context continuity** — Live authoring loads/persists `recruit_ai_conversation_contexts` so every relevant turn (including name/email) continues the same scheduling flow — never an isolated late-stage message.
7. **Canonical availability + timezone** — Offers use Sprint 22 `getSlots` / RVP `appointmentProfile` with BR-079/BR-050 wall-clock→UTC conversion. Legacy Mon–Fri-only `buildOfferedTimes` must not author canary scheduling offers. Org office hours must not truncate personal evening/weekend availability.
8. **Fallback only on technical failure** — Valid v2 decisions (including `clarify_once`) remain v2-owned. Throw/timeout/empty/unsafe text may fall through to legacy CE once for **conversation only**.
9. **CE fallthrough respects BR-111** — For the LIVE_AUTHORING allowlisted org+acting user, legacy CE may converse and reach interview-ready/scheduling language, but MUST NOT create/reschedule/cancel appointments (no Calendar / `atlas_appointments` / `executeScheduleInterview`) while BR-111 execution eligibility is unauthorized. Gate: `legacyCeAppointmentMutationGate` inside `completeInterview` before capacity release. Outside the authoring cohort, legacy CE scheduling is unchanged. When BR-111 later authorizes the same org+user, CE mutation may proceed again.
10. **Shadow/advisory never author live** — Post-live advisory remains non-authoring.
11. **Boundaries** — Do not enable Railway authoring/execution vars in this implementation sprint. Do not cut all users to v2. Do not redesign BR-049/050/111.

---

## BR-115 — Natural-Time Selection of Previously Offered Slots

**Implements:** When Recruit AI v2 has offered concrete slots and the prospect replies with a natural/spoken time that **uniquely** matches one offered slot, treat that reply as selection of that slot — not a free-form counteroffer that re-checks availability.  
**Domain:** Recruit AI / scheduling conversation continuity  
**Depends on:** BR-081, BR-084, BR-107, BR-108, BR-111, BR-114  
**Status:** Implemented  
**Engine target:** `recruitAiV2/decisionEngine.js`; `conversationContext.resolveUniqueOfferedSlotSelection`  
**Tests:** `backend/test/recruitAiV2NaturalOfferedSlotSelectionBr115.test.js`

### Rules

1. **Unique offered-time match = selection** — After `offer_time_choices` (or equivalent offered-slot pending state), a `requestedTime` that uniquely matches `previouslyOfferedSlots` transitions via the same confirmation path as `SELECT_OPTION` (`confirm_selected_slot` / `confirm_slot`). Do **not** emit `acknowledge_and_check_availability`.
2. **Ambiguous same-time multi-day** — If the same wall clock appears on more than one offered date and the reply does not name a day, clarify which day — do not guess.
3. **Date + time disambiguates** — Phrases like `domingo 7:30` that resolve to one offered date+time select that slot.
4. **Outside offered set** — Times not in `previouslyOfferedSlots` keep existing counteroffer / check-availability behavior.
5. **Numbered menus unchanged** — Bare `1`/`2` within the offered set length remain `SELECT_OPTION`.
6. **Execution independent** — Selection does not authorize mutations; BR-111 remains fail-closed.
7. **Preserve durable state** — Keep selected date/time/timezone, retain `previouslyOfferedSlots`, and do not reset to `awaiting_availability`.

---

## BR-116 — Same-Turn Availability After Preferred Time

**Implements:** When the prospect answers a preferred-time question (e.g. `7:30`) as `scheduling_counteroffer`, Recruit AI v2 must run the canonical availability read **in the same inbound turn** and render real offered slots — never defer with “voy a revisar disponibilidad” when Sprint 22 slots can be read now.  
**Domain:** Recruit AI / scheduling conversation continuity  
**Depends on:** BR-081, BR-084, BR-107, BR-108, BR-111, BR-114, BR-115  
**Status:** Implemented  
**Engine target:** `schedulingAvailabilityReader.shouldAttemptAvailabilityOffer`; `decisionEngine` counteroffer → `tryApplyAvailabilityOffer`  
**Tests:** `backend/test/recruitAiV2SameTurnRequestedTimeAvailabilityBr116.test.js`

### Rules

1. **Same-turn lookup** — `SCHEDULING_COUNTEROFFER` with known availability constraint / scheduling pending state enables `resolveAvailabilityForTurn` (reader → `getSlots` → Sprint 22 engine → appointment profile).
2. **Reuse offer path** — Successful reads apply `tryApplyAvailabilityOffer` / `offer_available_slots` (or zero-slot ack). Do not invent a parallel offer pipeline.
3. **Prefer requested wall clock when available** — Bias `nearestAlternatives` toward matching `requestedTime` when present in the read result.
3b. **Exact time + concrete date available → confirm only** — When the requested wall-clock exists on the known date (BR-164), confirm that slot only. Do not reintroduce unrelated times.
4. **Unavailable requested time** — Still offer real nearby alternatives same turn that honor the active date/daypart; do not wait for “OK”.
5. **State** — Retain `proposedTime` preference; persist `previouslyOfferedSlots`; set `lastQuestionAsked=offer_time_choices` (or `confirm_slot` on exact-time confirm) so BR-115 selection works next.
6. **Dead-end deferred ack is last resort** — `acknowledge_and_check_availability` only when availability cannot be checked (provider failure / no slots path unavailable).
7. **Execution independent** — Authoring only; BR-111 remains fail-closed. No Calendar / appointment / BR-080 writes from this path.
8. **Canonical path only** — No legacy `buildOfferedTimes`. Org office hours must not invent RVP truncation beyond Sprint 22 profile rules.

---

## BR-117 — Durable Context Temporal Sanitizer + Speak-Only Execution Readiness

**Implements:** Persist Recruit AI v2 durable context without corrupting ISO dates/datetimes/UUIDs via phone masking; remove Spanish “el ese día” ghost-day copy; hydrate invitation email into `knownFacts` from canonical sources without blocking booking.  
**Domain:** Recruit AI / durable context / speak-only readiness  
**Depends on:** BR-081, BR-084, BR-087, BR-111, BR-112, BR-114, BR-115, BR-116  
**Status:** Implemented in code; **execution remains OFF**  
**Engine target:** `recruitAiV2/contextSanitizer.js`; `responseRenderer.js`; `decisionEngine.js` (genuine reassertion); `prospectEmail.js`; `shadowEvaluationService.buildReconstructionInput`  
**Tests:** `backend/test/recruitAiV2DurableContextDateSanitizerBr117.test.js`

### Rules

1. **Phone masking stays on** — Unmasked phone-like values in durable context continue to mask to `+***####`.
2. **ISO temporal grammar is never a phone** — `YYYY-MM-DD` and ISO-8601 date-times (Z / offsets / fractional seconds) must round-trip exactly through `sanitizeContextForPersistence`, including nested `previouslyOfferedSlots[].date`.
3. **UUID identifiers are never phones** — `organizationId` / `prospectId` / `agentId` UUIDs must not be masked.
4. **No silent production rewrite** — Corrupted canary rows are reset/archived via supported `archiveContext` (or equivalent), not invented corrected JSON patches, unless a canonical repair operation exists.
5. **Ghost-day copy forbidden** — Never render Spanish `el ese día`. Unresolved day → neutral time-only wording (`¿Te funciona a las 7:30 PM?`).
6. **Correction language only on genuine reassertion** — `tienes razón` / `me dijiste` requires explicit repetition signal (`ya te dije` / equivalent). Matching prior `earliestTime` alone is not correction language (stale durable context).
7. **Email is invitation enrichment** — Not required for `executeScheduleInterview` booking. Hydrate `knownFacts.email` from `prospect.email` then notes `EMAIL:` token. Do not invent a parallel contact model. Do not block `create_appointment` when email is missing.
8. **Boundaries** — Do not enable BR-111/112 execution. Do not change authoring allowlists. Do not continue live canary threads or create appointments from this rule.

---

## BR-118 — Non-Text WhatsApp Media Dialogue Guard

**Implements:** Non-text WhatsApp media (document/image/audio/video/sticker/location/…) must not enter the normal Recruit AI v2 text intent/clarification path merely because the transport normalized a placeholder like `[document message]`.  
**Domain:** Recruit AI / live WhatsApp dialogue continuity  
**Depends on:** BR-081, BR-111, BR-114, BR-117  
**Status:** Implemented in code; **execution remains OFF**  
**Engine target:** `recruitAiV2/nonTextMedia.js`; `orchestrator` early short-circuit; `liveAuthoringBridge` passes structured `messageType`; `responseRenderer.acknowledge_non_text_media`  
**Tests:** `backend/test/recruitAiV2NonTextMediaDialogueGuardBr118.test.js`

### Rules

1. **Structured type first** — Classify from normalized WhatsApp `messageType`. Placeholder text `/^\[type message\]$/` is defensive fallback only.
2. **Intent `non_text_media`** — Media is not prospect language; never invent `unknown` → `clarify_once` from the placeholder alone.
3. **Soft ack** — Locale-aware short acknowledgment (e.g. “Recibí el archivo…”) may send; transport may still persist the inbound event.
4. **State preserved** — Do not change `proposedDate` / `proposedTime` / offered slots, `lastQuestionAsked`, `lastOfferMade`, `lastProspectIntent`, `pendingClarification`, or `clarificationCount`.
5. **Post-confirm / deferred** — When `lastOfferMade=appointment_confirm_deferred` (or equivalent confirmed proposed slot under execution-off handoff), media must not reopen scheduling or imply a missing field.
6. **Pre-confirm** — Soft-ack and keep the pending question/state; do not bump ambiguity as if free-form unknown text arrived.
7. **Text-like types unchanged** — `text` / `button` / `interactive` continue through the normal interpreter.
8. **Boundaries** — Do not enable execution. Do not redesign WhatsApp parsing. Do not mutate appointments/Calendar/BR-080.

---

## BR-119 — Offered-Slot Day Narrowing Preserves Choice

**Implements:** When Recruit AI v2 has already offered concrete slots and the prospect narrows by **day** (or day+time), preserve the matching offered slot(s) and move toward confirmation — do **not** broaden with a fresh availability menu unless the prospect asks outside the offered set (e.g. “más tarde”), rejects, or the narrowed set is empty. Day-part answers (e.g. “Tarde”) may proactively offer 1–2 real canonical slots instead of an open preferred-time question when availability is readable.  
**Domain:** Recruit AI / scheduling conversation continuity  
**Depends on:** BR-081, BR-084, BR-107, BR-108, BR-111, BR-114, BR-115, BR-116  
**Status:** Implemented in code; **execution remains OFF**  
**Engine target:** `conversationContext.resolveUniqueOfferedDaySelection`; `decisionEngine` date-proposal narrowing + day-part offer; `schedulingAvailabilityReader` dayPart filter / later-alternatives constraints  
**Tests:** `backend/test/recruitAiV2OfferedSlotNarrowingBr119.test.js`

### Rules

1. **Day-only unique match = selection** — After offered slots (`offer_time_choices` / equivalents), a day-only reply (`El lunes`) that uniquely matches one offered date selects that slot via the same confirmation path as BR-115 / `SELECT_OPTION`. Do **not** re-query and add new times (e.g. do not introduce Monday 8:00 when only Monday 7:30 was offered).
2. **Same-day ambiguous times** — If multiple offered times share the named day **and the offered set already spanned other dates**, restate **only those** offered times — never broaden the set.
2b. **Same-day no-op** — If every previously offered slot already sits on the named day (e.g. Mon 7:30 + Mon 8:00 → `Lunes`), do **not** re-render the full availability sentence. Preserve both slots and ask time only (`clarify_offered_slot_time`: “¿Prefieres 7:30 PM u 8:00 PM?”). Reason: `OFFERED_SLOT_DAY_ALREADY_FIXED`.
3. **BR-115 time narrowing unchanged** — Natural times (`7:30`) and exact day+time (`El lunes a las 7:30`) continue under BR-115.
4. **Outside / later alternatives** — Phrases like `El lunes, pero más tarde` leave the offered set: push `REQUESTED_LATER_ALTERNATIVES`, set exclusive earliest after the latest same-day offered time, avoid prior offered identities, and offer real later slots via BR-107 / BR-116 paths.
5. **Day-part proactive offer** — `PROVIDE_DAY_PART` (e.g. `Tarde`) attempts same-turn canonical availability filtered by dayPart. Afternoon is **strictly after 12:00** (noon is not afternoon; 12:30+ qualifies). Evening remains ≥17:00. Offer ≤2 **same-day remaining** slots first. Fall back to ask-preferred-time only when no useful slots are available.
6. **State preservation** — Narrowing reduces the active candidate set (date/time/timezone/proposed slot/`previouslyOfferedSlots`). It must not reset to a broad fresh query unless Case D / rejection / empty match.
7. **Stale availability** — Full live revalidation of a narrowed slot before confirmation remains deferred to confirm-time canonical recheck (Case E); this rule does not invent a parallel revalidation scheduler.
8. **Execution independent** — Authoring/decision only; BR-111 remains fail-closed. No Calendar / appointment / BR-080 writes. No authoring-allowlist changes. No timezone behavior changes.

---

# QR Channel

**First implementation target (after these rules are accepted):** Car Magnet V1 (`car_recruiting_01`, source `car_magnet`, default conversation goal `interview`).

**Global constraints for BR-128–BR-133:**

1. **Canonical prospect identity required** — QR Channel must not bypass BR-120. Every QR-driven WhatsApp conversation resolves through the existing org-scoped prospect identity bridge before conversation context or appointments are written.
2. **No QR-to-appointment mutation shortcut** — A scan, campaign token, or landing redirect must never create, confirm, cancel, or mutate appointments or Calendar objects. Scheduling remains the canonical appointment lifecycle (BR-039 / BR-049 / BR-050 / BR-111 family).
3. **Do not weaken BR-120–BR-127** — Identity bridging, Calendar cancel/rollback, schedule reconcile, occupation optional rules, schedule-intent recovery, post-create ownership, deferred confirm continuity, and qualification-fact sync remain mandatory.
4. **Recruit AI V2 execution remains OFF** until separately authorized Stage-1 rollout. QR Channel design and docs must not enable `RECRUIT_AI_V2_EXECUTION_ENABLED` or `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED`.
5. **Status of BR-128–BR-133** — Rules are specified. **Phase 1 entry primitives are implemented** (`/go/:token`, phone-bind, `qr_campaigns` / `qr_scans`, Car Magnet seed). **Phase 2 inbound attribution consume + `conversationGoal` hydration are implemented** (match `pending_inbound` → stamp core `lead_source` → consume). **Phase 3 QR-aware first-turn behavior is not implemented.** Do not treat QR Channel as fully complete.

---

## BR-128 — QR Campaigns

**Implements:** Org-scoped QR / entry campaigns as the durable configuration behind physical or digital QR destinations (name, type, opaque public token, source identity, default conversation goal, owner, active flag).  
**Domain:** QR Channel / lead acquisition / campaign configuration  
**Depends on:** BR-080, BR-120  
**Related:** BR-129 (trusted attribution), BR-130 (conversationGoal), BR-131 (goal-aware first turn), BR-133 (funnel telemetry), Car Magnet V1 (`car_recruiting_01`)  
**Status:** Phase 1 entry primitives implemented (campaign registry + opaque token + public `/go`); Admin UI not built  
**Engine target:** `backend/core/qrChannel/*`, `backend/routes/qrGo.js` (Admin–RVP campaign management still future)  
**Tests:** `backend/test/qrChannelPhase1.test.js`

### Rules

1. **Org-scoped entity** — Every campaign belongs to exactly one `organizationId`. Cross-tenant campaign resolve or write is forbidden.
2. **Owner / agent / RVP association** — Each campaign MUST associate an owning Atlas user (typically RVP or designated agent) used for BR-080 assignment precedence when campaign mapping is activated. Ownership must be an exact org-scoped user identity — not a role-derived guess.
3. **Opaque public token** — Public QR destinations use a non-enumerable server-issued token (not sequential integer ids, not raw campaign names). Tokens resolve only through a server-side campaign lookup.
4. **Active / inactive** — Inactive campaigns must fail closed at public entry (no scan→WhatsApp handoff that attributes to a dead campaign). Existing attributed prospects retain historical attribution.
5. **Campaign / source identity** — Campaigns carry a stable campaign key (e.g. `car_recruiting_01`) and a source label (e.g. `car_magnet`) distinct from transport channel (`whatsapp`).
6. **Default conversation goal** — Each campaign MAY declare a default `conversationGoal` per BR-130 (`interview` | `policy_review` | `unresolved`). Absence defaults to `unresolved`.
7. **No PII in public QR URL** — Public entry URLs MUST NOT embed phones, names, emails, prospect ids, or other PII in path or query. Campaign token only (plus non-PII routing required by the host).
8. **Configuration ≠ execution** — Creating or activating a campaign does not enable Recruit AI V2 execution, widen allowlists, or authorize appointment mutation.
9. **Boundaries** — Does not implement Admin UI, QR image generation libraries, or migrations in this specification alone. Does not replace Facebook Lead Ads intake or Quick Capture manual sources.

---

## BR-129 — Trusted QR Attribution

**Implements:** Forge-resistant first-touch attribution for QR Channel: public entry resolves an opaque server-side campaign token, records a scannable handoff, and stamps org-safe attribution onto the canonical prospect / conversation — never by trusting raw marketing query parameters alone.  
**Domain:** QR Channel / attribution / tenancy / public entry  
**Depends on:** BR-080, BR-120, BR-128  
**Related:** BR-130 (goal from campaign default), BR-133 (funnel events), BR-113 (booking-path telemetry — distinct)  
**Status:** Phase 2 implemented — public token resolve + phone-bind + inbound consume + core `lead_source` first/last-touch stamp  
**Engine target:** `backend/core/qrChannel/*`, `backend/routes/qrGo.js`, `whatsappProspectResolver.js`  
**Tests:** `backend/test/qrChannelPhase1.test.js`, `backend/test/qrChannelPhase2Attribution.test.js`

### Rules

1. **Token-resolved attribution** — Campaign, source, owner, org, and default goal MUST be derived from a successful opaque token → campaign resolve on the server. Do not treat arbitrary `?campaign=`, `?source=`, `?goal=`, or UTM parameters as authoritative identity.
2. **Fail closed on forged / invalid / inactive tokens** — Unknown, revoked, inactive, or cross-tenant tokens must not attribute a campaign. Prefer a safe non-attributed handoff or an explicit safe error — never invent attribution.
3. **Tenant isolation** — Resolved campaign `organizationId` must match the WhatsApp / WABA inbound org binding used for prospect create. Mismatch → fail closed (no cross-tenant attribution).
4. **Attribution survives the lifecycle** — Once stamped at first-touch create (or trusted resume attach), campaign/source/goal attribution MUST remain available through conversation, qualification, appointment, outcome, and recruit/client conversion events (BR-133). Later enrichment may add last-touch metadata; first-touch campaign must not be silently overwritten by forged inbound params.
5. **Canonical prospect only** — Attribution attaches through BR-120 identity resolution / create. No parallel “QR prospect” store that bypasses legacy/core bridging.
6. **Rate-limitable public entry** — The public entry / redirect endpoint MUST be designed for rate limiting (IP / token / org abuse controls). Scan flood must not imply appointment write capacity.
7. **No mutation from entry** — Entry and attribution emit observability / correlators only. They do not call appointment create, Calendar, or Recruit AI side-effect executors.
8. **Boundaries** — Optional Meta CTWA referral parsing remains complementary and must not override a stronger token-resolved QR first touch when both are present for the same create. Does not redefine BR-113 live-execution attribution stages.

---

## BR-130 — Canonical Conversation Goal

**Implements:** A canonical `conversationGoal` that steers QR and WhatsApp conversations toward interview scheduling, policy-review scheduling, or an unresolved state until intent is known.  
**Domain:** QR Channel / Conversation Engine / Recruit AI durable context  
**Depends on:** BR-049, BR-081, BR-120, BR-128, BR-129  
**Related:** BR-131 (first-turn behavior), BR-132 (policy-review scheduling); appointment `purpose` vocabulary (`recruiting_interview`, `policy_review`); Car Magnet V1 defaults to `interview`  
**Status:** Phase 2 partial — QR inbound hydrates `conversationGoal` on core `lead_source` (default `interview` for Car Magnet). Goal-aware first-turn copy (BR-131) and goal transition classifiers remain future. Does **not** enable appointment execution.  
**Engine target:** `whatsappProspectResolver` + `qrInboundAttribution` → `atlas_core_prospects.lead_source`; CE/V2 consumers read-only for Phase 2  
**Tests:** `backend/test/qrChannelPhase2Attribution.test.js`

### Supported goals

| `conversationGoal` | Meaning | Typical appointment `purpose` when booking |
|--------------------|---------|--------------------------------------------|
| `interview` | Recruiting interview conversion | `recruiting_interview` |
| `policy_review` | Client / policy-review meeting conversion | `policy_review` |
| `unresolved` | Goal not yet established | No appointment until resolved |

### Rules

1. **Persist the goal** — `conversationGoal` MUST be persisted in canonical prospect and/or conversation context as appropriate for the active architectures (legacy profile / core prospect / durable V2 context). Durable Recruit AI conversation context MUST carry the active goal when V2 context exists.
2. **QR may establish the initial default** — An active QR campaign (BR-128) may set the initial `conversationGoal` via trusted attribution (BR-129).
3. **Generic inbound may begin unresolved** — Non-QR or unknown-source inbound MAY start as `unresolved` and be inferred conversationally.
4. **Default ≠ immutable** — A preselected QR goal is a **default**. Atlas MAY transition goals when **explicit user intent** proves another supported goal is appropriate.
5. **Deterministic / auditable transitions** — Goal changes MUST be explicit, reason-coded, and auditable (who/what evidence). Silent goal flips from noise, forged query params, or cross-tenant signals are forbidden.
6. **Identity / tenancy safety** — Goal transitions must not silently cross organizations, prospects, or appointments (BR-120). Wrong-identity updates fail closed.
7. **Scheduling mapping** — When the active goal is `interview`, booking uses the recruiting interview path / `purpose=recruiting_interview`. When `policy_review`, booking uses `purpose=policy_review` under BR-132. `unresolved` must not create appointments.
8. **Boundaries** — Does not implement inference classifiers in this specification. Does not merge PI document `PolicyReview` aggregates (BR-051+) with conversation goals. Does not enable execution.

---

## BR-131 — Goal-Aware First Turn and Progressive Conversion

**Implements:** Replace universal forced city/state openers with context-aware first turns that answer immediate questions, open naturally from QR context, resume returning prospects, and still progress toward the active conversation goal’s appointment.  
**Domain:** Conversation Engine / Recruit AI v2 authoring / QR Channel UX  
**Depends on:** BR-049, BR-081, BR-114, BR-130  
**Related:** BR-104/FAQ family; BR-124 schedule-intent recovery; BR-137 (objection → soft interview progression); teamVision / V2 greeting templates historically used forced location openers  
**Status:** Implemented (thin first-turn + FAQ resume guard + CE/V2 FAQ sequencing parity + first-turn resume-evidence guard)  
**Engine target:** CE first-turn / FAQ routing (`semanticConversationEngine.js`, `recruitConversationSequencing.js`); V2 `interpret` + `decide` + `responseRenderer`; no appointment executor changes  
**Tests:** `backend/test/recruitAiV2ConversationQualityBr131.test.js`, `backend/test/recruitAiV2FirstTurnInfoRequestGuard.test.js`

### Rules

1. **No universal forced location opener** — Atlas MUST NOT universally open every fresh WhatsApp conversation with “Hola, ¿en qué ciudad y estado vives?” (or equivalent) solely because the chat is new. Location questions remain allowed when required for the **active goal’s** qualification path.
2. **Understand before forcing qualification** — Classify / understand inbound context (QR source/goal, greeting vs substantive question, returning state) before forcing the next qualification field.
3. **Answer immediate substantive questions** — When the prospect asks a substantive FAQ / opportunity question, Atlas SHOULD answer it (existing FAQ engines) and then continue progressive conversion — not discard the question in favor of an immediate city/state demand.
4. **Natural greeting opener** — Pure greetings MAY receive a natural broad opener influenced by known QR campaign/source/goal context (BR-128–BR-130).
5. **Returning prospects resume** — Returning prospects resume known context (durable V2 and/or legacy qualification) rather than restarting as brand-new QR leads when identity matches (BR-120 / BR-080 no-reassign rules remain).
6. **Ask qualification only when needed** — Ask only the qualification fields required for the **active** `conversationGoal`. Do not run interview-only qualification for an established `policy_review` goal (and vice versa) without an audited goal transition (BR-130).
7. **Natural ≠ abandon conversion** — Conversational flexibility does not remove the conversion objective. `interview` conversations MUST progressively move toward scheduling a recruiting interview. `policy_review` conversations MUST progressively move toward scheduling a policy-review appointment.
8. **Mutation path unchanged** — This rule changes first-turn / routing / copy behavior only. It MUST NOT alter the accepted appointment mutation path (BR-039 / BR-050 / BR-111 / BR-112 / BR-121–BR-127). No QR shortcut to Calendar or `atlas_appointments`.
9. **Boundaries** — Does not enable Recruit AI V2 execution. Does not widen Stage-1 allowlists. Does not rewrite BR-125 reply ownership. Copy changes require a separate implementation sprint after this rule is accepted.
10. **Resume requires conversation evidence** — Copy that claims Atlas already asked something (e.g. `clarify_once` / “the detail I just asked for”) MAY only be used when **this prospect’s current conversation** has concrete evidence: V2 `lastAtlasOutboundText` and/or a V2 `lastQuestionAsked` ask-key from a prior Atlas turn. Do **not** infer a pending question from `current_step`, `missingFields`, qualification cursor, workflow milestone, or default state. No prior Atlas question → resume path is impossible → use canonical first-turn / info-request response (overview + next missing fact, typically city/state). Mid-flow FAQ still answers first and resumes a **real** pending ask. First-turn precedence outranks resume/clarify.

---

## BR-132 — Policy Review Scheduling

**Implements:** Treat appointment `purpose=policy_review` as a first-class **scheduling** outcome for client / policy-review conversations, distinct from Policy Intelligence document aggregates (`atlas_policy_reviews`), while reusing the canonical appointment lifecycle wherever safely possible.  
**Domain:** Appointments / QR Channel / client conversion  
**Depends on:** BR-039, BR-040, BR-049, BR-050, BR-120, BR-130  
**Related:** BR-051–BR-061 (Policy Intelligence documents — separate); BR-044 outcomes; capacity/`appointmentTypes` alignment (future)  
**Status:** Specified (docs only; not implemented)  
**Engine target (future):** Purpose-scoped workflow branch on canonical appointment services; Conversation / Recruit AI goal consumers  
**Tests:** Deferred until implementation

### Rules

1. **Purpose ≠ PI document** — Scheduling `purpose=policy_review` is an **appointment purpose**. It is **not** the same entity as Policy Intelligence `PolicyReview` (`atlas_policy_reviews` / BR-051+). Linking them later requires an explicit bridge rule; this rule does not invent that bridge.
2. **Reuse canonical lifecycle** — Create / reschedule / cancel / complete / reminders / Calendar consistency MUST reuse canonical appointment services wherever safely possible. Do not invent a parallel policy-review booking store.
3. **Purpose-scoped workflow** — Recruiting interview milestones and side effects (e.g. auto-advance to `INTERVIEW_SCHEDULED`) MUST NOT be applied blindly to policy-review appointments. Purpose-scoped workflow/state must distinguish recruiting interviews from client policy reviews.
4. **Hard protections remain mandatory** — Identity (BR-120), tenancy, Calendar consistency, idempotency, rollback (BR-121), schedule reconcile (BR-122), and ownership protections (BR-125 family where applicable) remain mandatory for policy-review scheduling.
5. **Goal coupling** — Bookings for policy review require active `conversationGoal=policy_review` (BR-130) or an equivalent audited agent-operated scheduling path with explicit purpose — not an accidental interview create.
6. **No implementation in this documentation change** — This rule specifies architecture constraints only. No migrations, CE/V2 routing, Calendar writes, or UI in this docs change.
7. **Boundaries** — Does not enable Recruit AI V2 execution. Does not redefine Financial Intelligence evaluation (BR-062+). Car Magnet V1 targets `interview` only and must not require BR-132 runtime to ship.

---

## BR-133 — QR Funnel Attribution and Telemetry

**Implements:** Conceptual funnel instrumentation for QR Channel marketing attribution and conversion analytics — distinct from Recruit AI Stage-1 / BR-113 booking-path observability.  
**Domain:** QR Channel / analytics / business events  
**Depends on:** BR-128, BR-129, BR-130  
**Related:** BR-113 (live execution attribution telemetry); Stage-1 `recruit_ai_v2.*` ops playbook; EVENT_CATALOG / business events  
**Status:** Phase 1–2 partial — scan/bind/redirect + inbound attribution_attached/missed/scan_consumed emitters. Full funnel through appointment/conversion not implemented.  
**Engine target:** `backend/core/qrChannel/qrChannelTelemetry.js`  
**Tests:** Phase 1–2 covered via `qrChannelPhase1` / `qrChannelPhase2Attribution`

### Conceptual funnel

`scan` → WhatsApp entry/conversation → qualification / goal resolution → appointment scheduled → appointment outcome → recruit/client conversion (where available)

### Rules

1. **Event intent (documentation only here)** — Implementations MUST eventually emit org-scoped funnel signals covering the stages above, always carrying campaign/source attribution when known (BR-129).
2. **Attribution retained** — Campaign/source (and active/default goal where relevant) remain available throughout the funnel for reporting. Metrics MUST be queryable by `organizationId` and `campaignId` / campaign key.
3. **Distinct from BR-113 / Stage-1 ops telemetry** — QR marketing funnel telemetry MUST NOT be conflated with BR-113 `executionSource` stages or Stage-1 `recruit_ai_v2.*` booking-path observability. Separate event families / catalogs; shared correlation ids are allowed when useful.
4. **No mutation coupling** — Funnel events are observational. Emitting or failing to emit telemetry must not create, alter, or roll back appointments.
5. **PII minimization** — Prefer ids + opaque campaign tokens + hashed/minimal contact keys consistent with existing WhatsApp logging policy. Do not put raw PII in public scan URLs (BR-128).
6. **No runtime in this docs change** — Defining event intent does not require adding emitters, warehouses, or Datadog integrations in this documentation change.
7. **Boundaries** — Does not change Stage-1 operations playbook alert thresholds. Does not enable execution.

---

## BR-120 — Canonical Prospect Identity Bridge (Legacy ↔ Core)

**Implements:** Org-scoped bridge between Mission Control `public.prospects` and recruiting-core `atlas_core_prospects` without overloading appointment FKs  
**Domain:** Prospects / Recruit AI v2 durable context / Appointments  
**Depends on:** BR-039, BR-049, BR-081  
**Related:** BR-121 / BR-122 / BR-123 (incident exposed dual UUID; those rules defer identity bridging to BR-120); **APR1** appointment prospect reference integrity  
**Status:** Implemented (map-only + dual-load; APR1 redefines appointment FK target)  
**Engine target:** `recruitingProspectBridge.js` (`resolveCanonicalProspectIdentity`); `recruitAiV2/contextPersistenceService.js`; `appointmentApplicationService.createAppointment`  
**Tests:** `backend/test/prospectIdentityBridgeBr120.test.js`; `backend/test/appointmentProspectReferenceApr1.test.js`

### Rules

1. **Appointment FK is Mission Control canonical** — `atlas_appointments.prospect_id` MUST reference the tenant’s `public.prospects.id` (Mission Control / Prospect Center / Quick Capture row). Do **not** store `atlas_core_prospects.id` in `atlas_appointments.prospect_id`.
2. **Core remains recruiting-core identity** — `atlas_core_prospects.id` is the canonical identity for **new** Recruit AI durable context rows and bridge resolution. Persist core on appointments only as explicit metadata (`metadata.coreProspectId`), never by overloading `prospect_id`.
3. **Legacy remains phone profile/cache** — WhatsApp resolution and phone-keyed workflow continue using `public.prospects` / phone until LC2 consolidation.
4. **Shared resolver (org-scoped)** — `resolveCanonicalProspectIdentity({ phone, organizationId, … })` is authoritative only for **`organizationId + normalized phone`**. Never treat a phone-global core lookup as authoritative. Cache keys are `organizationId::phone`. Returns both `legacyProspectId` (`public.prospects.id`) and `coreProspectId`.
5. **Fail closed** — Exactly one in-org core → use it. Zero + `ensureCore=false` → unresolved. Zero + `ensureCore=true` → ensure in requested org then verify. Foreign-org core → `PROSPECT_IDENTITY_ORG_MISMATCH`. Multiple in-org cores → `PROSPECT_IDENTITY_AMBIGUOUS`. Conflicting legacy↔lookup → `PROSPECT_IDENTITY_CONFLICT`. Do not guess. Foreign `prospect_id` injection on create/update → fail closed.
6. **Appointment create** — Require a resolved in-org `public.prospects` row **and** a resolved/ensured core identity before Calendar, capacity, appointment persist, or workflow advance (MC + `executeScheduleInterview`). Persist `prospect_id = public.prospects.id` and `metadata.coreProspectId = coreProspectId`. Never write `atlas_appointments.prospect_id = null` on the Recruit AI booking path.
7. **Durable context dual-load** — Load active context by **core first, then legacy** for the same phone/org/channel. Prefer an existing active row over creating a second active for the same person.
8. **New context creates use core** — First persist for a phone/org/channel writes context `prospect_id = coreProspectId` when core can be resolved/ensured.
9. **No mass rewrite of Recruit AI contexts in this rule** — Do not bulk-update existing `recruit_ai_conversation_contexts.prospect_id` from legacy→core. Compare-and-save continues updating the **loaded row id** (may remain legacy-keyed) while JSON `prospectId` may reflect core.
10. **Do not store core as appointment FK** — Never rewrite `atlas_appointments.prospect_id` to a core UUID to “match” Recruit AI durable context.
11. **Workflow remains phone-keyed** — `advanceProspectWorkflow` / schedule side effects continue on phone + legacy profile fields (occupation, city, etc.).
12. **Boundaries** — Does not enable BR-111 execution, change live authoring allowlists, Calendar cancel semantics (BR-121), schedule reconcile (BR-122), or occupation optional rules (BR-123). Does not redesign the recruiting-core bridge.

---

## BR-123 — Occupation Optional for Interview Scheduling

**Implements:** Correct BR-037 milestone field lists so missing occupation cannot block interview readiness, scheduling advancement, or schedule-interview mission completion  
**Domain:** Workflow / Appointments  
**Depends on:** BR-037, BR-035, BR-039, BR-049  
**Related:** BR-121 / BR-122 (incident partial-write was triggered by occupation-required advance failure)  
**Status:** Implemented  
**Engine target:** `milestoneValidationEngine.js` (`MILESTONE_REQUIRED_FIELDS`, `validateRequiredFields`)  
**Tests:** `backend/test/occupationOptionalInterviewScheduleBr123.test.js`

### Rules

1. **Occupation is enrichment / optional** — it is **not** a prerequisite for interview readiness, scheduling, or due-state processing (`INTERVIEW_READY`, `INTERVIEW_SCHEDULED`, `INTERVIEW_DUE`).
2. **Do not prompt or fail closed** on missing occupation during schedule-interview mission advancement to `INTERVIEW_SCHEDULED`.
3. **Qualification gates unchanged** for city / state / work authorization where still required by BR-037.
4. **Capture still allowed** — when occupation is already known or later provided, preserve/store it; absence alone must not block advancement or become a required clarification.
5. **Boundaries** — Does not change prospect identity bridging (BR-120), BR-111 execution gates, timezone behavior, live authoring allowlists, or BR-122 reconcile semantics.

---

## BR-126 — Deferred Create Remains Confirmable (No CE Qualification Hijack)

**Implements:** After slot confirm + speak-only deferred handoff (`appointment_confirm_deferred` because execution was OFF), durable stays resumable; a later affirmative must resolve as `schedule_confirm` / `create_appointment`, never fall through to legacy CE city/state qualification  
**Domain:** Recruit AI v2 live WhatsApp runtime / deferred confirmation continuity  
**Depends on:** BR-111, BR-112, BR-114, BR-125  
**Related:** BR-103 (confirmable proposal), BR-120, BR-127 (qualification sync on create — independent)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/liveAuthoringBridge.js`, `recruitAiV2/decisionEngine.js`, `recruitAiV2/orchestrator.js`, `recruitAiV2/interpreter.js`, `recruitAiV2/locationFacts.js`, `communicationHub.js`  
**Tests:** `backend/test/deferredConfirmResumabilityBr126.test.js`

### Rules

1. **Deferred preserves proposal** — `appointment_confirm_deferred` keeps `appointment.status=proposed`, exact `proposedDate`/`proposedTime`, `lastQuestionAsked=confirm_slot`, `lastProspectIntent=schedule_confirm`, and `lastOfferMade=appointment_confirm_deferred` (plus outbound text when authored).
2. **Later affirmative resumes create** — With that durable state, bare `Si`/`Yes` classifies as `schedule_confirm` and decides `create_appointment` (execution still env-gated).
3. **No CE fallthrough on confirmable proposed** — Authoring timeout/empty/technical failure or cancelled create rollback must not hand the turn to legacy CE while a confirmable proposal remains; V2 owns soft failure (`appointment_create_failed`) or successful reclaim (BR-125) instead.
4. **Affirmatives are not cities** — Location extractors must not treat bare affirmatives as city names while confirmation is pending. Soft-acks (`ok` / `okay`) while availability is pending remain `soft_acknowledgement` — they must not be forced into `schedule_confirm` solely because appointment status is `proposed`.
5. **Exact slot authoritative** — Do not invent a different slot; reuse the proposed offered slot.
6. **Execution OFF** — Deferred path still creates zero appointments / Calendar events.
7. **Boundaries** — Does not broaden execution allowlists; does not auto-cleanup cancelled canary rows; Calendar rollback root causes remain separate from this continuity rule; does not change BR-127 qualification sync.

---

## BR-127 — Canonical Qualification Fact Synchronization for Interview Scheduling

**Implements:** Before advancing to `INTERVIEW_SCHEDULED` from Recruit AI V2 execution, synchronize durable V2 qualification facts (`city` / `state` / `workAuthorization`) into the workflow validation layer so milestone checks do not fail on stale sparse legacy nulls  
**Domain:** Recruit AI v2 execution / workflow advancement / qualification  
**Depends on:** BR-037, BR-049, BR-111, BR-112, BR-120, BR-121  
**Related:** BR-123 (occupation optional), BR-122 (schedule reconcile), BR-126 (deferred continuity — independent), BR-134 (mid-flow Mission Control hydration)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/qualificationFactSync.js`, `missionExecutionApplicationService.js` (`executeScheduleInterview`), `recruitAiV2/sideEffectExecutor.js`, `milestoneValidationEngine.js`  
**Tests:** `backend/test/qualificationFactSyncBr127.test.js`, `backend/test/scheduleWorkflowRollbackMissingQualFields.test.js`

### Rules

1. **V2 durable facts must reach workflow validation** — When V2 execution schedules an interview, city / state / workAuthorization collected in durable `knownFacts` must be available to `validateMilestoneAdvancement` (via `capturedFields` and null legacy column hydration). Do **not** require the prospect to repeat confirmed facts.
2. **Sync point** — Validate the sync plan **before** Calendar / appointment mutation; apply null-column hydration in the **same** prospect UPDATE as schedule confirmation fields, immediately before `advanceProspectWorkflow` → `INTERVIEW_SCHEDULED`. Runs **only** when `recruitAiV2Context` is explicitly provided by the V2 side-effect executor. Non-V2 mission schedule paths are unchanged.
3. **Minimum sync fields** — `city`, `state`, `workAuthorization` / `authorization`. Occupation remains optional (BR-123).
4. **Scoped identity** — Synchronization is organization-scoped and identity-safe (BR-120): prospect org must be present and match; expected legacy prospect id and core prospect id must match the schedule-time / durable mapping. Wrong mapping → fail closed (no Calendar, no mutation).
5. **Conflict precedence** — If legacy already holds a **non-null** value that normalizes differently from durable, **fail closed** (`QUALIFICATION_FACT_CONFLICT`) **before** Calendar create. The entire mutation set is cleared (no partial city/state/auth writes). Equal/normalized-equal values are sync-noop for columns; null legacy columns may be filled from durable.
6. **Validate authoritative synced facts** — Advancement must use the synchronized `capturedFields` (and updated prospect snapshot), not stale legacy nulls alone.
7. **Email is invitation enrichment** — Missing email must **not** block `INTERVIEW_READY` / `INTERVIEW_SCHEDULED` / `INTERVIEW_DUE`. Booking and workflow advancement succeed; appointment may retain `confirmation_status=missing_email` / invitation enrichment metadata outside milestone gates.
8. **Atomicity** — Legacy column hydrations share one prospect row UPDATE with schedule fields (DB row update is all-or-nothing). `capturedFields` enrichment is in-memory for advancement (not a second store). Write failure → deterministic `QUALIFICATION_SYNC_WRITE_FAILED` + BR-121 rollback.
9. **Boundaries** — Does not redesign prospect storage; does not mass-migrate historical prospects; does not enable BR-111 execution; does not merge or depend on BR-126 continuity; Calendar cancel / BR-121 rollback must still fire on genuine advance failure after a successful sync.

---

## BR-134 — Mid-Flow Qualification Fact Sync for Mission Control

**Implements:** When Recruit AI V2 durably confirms `city` / `state` / `workAuthorization` during qualification (before schedule), synchronize those facts into null legacy prospect columns so Mission Control and conversation outcome no longer list already-accepted facts as missing  
**Domain:** Recruit AI v2 conversation / Mission Control truth / qualification  
**Depends on:** BR-037, BR-094, BR-096, BR-100, BR-114, BR-120, BR-127  
**Related:** BR-049, BR-111 (execution unchanged), BR-123  
**Status:** Implemented  
**Engine target:** `recruitAiV2/qualificationFactSync.js` (`synchronizeQualificationFactsForMissionControl`), `recruitAiV2/orchestrator.js` (post-persist hook)  
**Tests:** `backend/test/qualificationFactSyncBr134MissionControl.test.js`

### Rules

1. **Accepted facts must reach Mission Control** — Conversationally confirmed V2 `knownFacts` for city / state / workAuthorization MUST hydrate null legacy prospect columns (`city`, `state`, `work_authorized`) without waiting for `INTERVIEW_SCHEDULED` (BR-127 schedule path remains).
2. **Sync after durable persist** — Run after a successful V2 context persist on the live authoring / orchestrator path when confirmed durable facts exist. CE remain skipped when V2 authors (BR-114); this sync replaces the missing CE `syncProfileToProspect` for these fields.
3. **Confirmed-only location** — Do not write proposed / unconfirmed location fragments into legacy columns. Authorization uses canonical boolean representation (`work_authorized=true|false`).
4. **Null-column hydration + fail closed on conflict** — Same BR-127 planner semantics: fill only null legacy columns; org/identity scoped; conflicting non-null legacy → no partial write.
5. **Soft-fail for conversation** — Sync errors must not block V2 reply authorship or durable context persistence. Schedule-time BR-127 remains fail-closed around Calendar mutation.
6. **No execution enablement** — Does not authorize appointment mutation, Calendar writes, or BR-111 execution gates.
7. **Boundaries** — Does not mass-backfill historical rows; operators may re-confirm or wait for the next inbound V2 persist to hydrate. Does not change HUMAN suppression, lifecycle inbox, or Meta Review isolation.

---

## BR-136 — Mission Control Operational TEST Exclusion (Meta-safe)

**Implements:** Default Mission Control / Prospect Center / executive queue counts exclude durable operational TEST and explicit TEST/CANARY/QA markers without hiding Meta App Review demo subjects  
**Domain:** Mission Control / Prospect Center / executive navigation  
**Depends on:** BR-135 (`inboxMarkedTestAt`), Meta Review session isolation  
**Related:** Conversations Center lifecycle TEST (separate helper — do not reuse `isTestProspect`), BR-111 (execution unchanged)  
**Status:** Implemented  
**Engine target:** `missionControlOperationalTestFilter.js`, `missionControlPriorityEngine.buildPrioritizedWorkflowQueue`, `loadProductionProspects`, `findLatestActiveProspectInOrganization`  
**Tests:** `backend/test/missionControlOperationalTestFilterBr136.test.js`, Meta Review workspace / boundary suites

### Rules

1. **Operational exclusion** — Exclude prospects with durable `workflow_state.inboxMarkedTestAt` or exact source/entry `TEST` / `CANARY` / `QA` from default MC queue, executive/Prospect Center counts, and “latest” navigation.
2. **Meta Review demos remain visible** — Never treat `META_REVIEW` / `META_REVIEW_DEMO` (source or entry_method) as ordinary operational TEST for Mission Control visibility.
3. **Separate from Conversations** — Do not call Conversations `isTestProspect()`; Conversations may continue to bucket Meta demos as TEST for the Niovel inbox only.
4. **Restore restores eligibility** — Clearing durable `inboxMarkedTestAt` (and removing TEST/CANARY/QA markers) returns the prospect to MC eligibility; no new lifecycle state.
5. **Meta session untouched** — No changes to Meta login flag, locker, route allowlist, reviewer permissions, Conversations access, webhooks, WhatsApp auth, or execution flags.
6. **No execution enablement.**

---

## BR-137 — Objection Handling and Interview Conversion Progression

**Implements:** First-class ACKNOWLEDGE → ANSWER/CLARIFY → CONTINUE objection handling that moves qualified prospects toward a recruiting interview using existing scheduling engines (no new scheduler).  
**Domain:** Conversation Engine / Recruit AI v2 authoring  
**Depends on:** BR-049, BR-081, BR-098–BR-106, BR-131, BR-091  
**Related:** BR-090 (employment fit), BR-099 (sales skill/aversion), BR-104 (compensation), BR-107/108/115/116/119/124/125/127/134 (scheduling — unchanged mutation path)  
**Status:** Implemented (thin objection slice + soft interview transition; execution gates remain OFF)  
**Engine target:** `conversationObjections.js`, `salesObjection.js` (identity), CE/V2 FAQ sequencing (`recruitConversationSequencing.js`), `decisionEngine.js`, `responseRenderer.js`, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2ObjectionInterviewProgressionBr137.test.js`

### Rules

1. **Acknowledge → Answer → Continue** — For each supported objection, Atlas MUST acknowledge the concern, give a concise truthful answer (or one clarifying question), then ask exactly ONE useful next question — never stack questions or restart qualification.
2. **Supported objections (this slice)** — `is_this_sales` (identity), `no_experience`, `think_about_it`, `income_question`, `legitimacy_trust`, `dont_want_to_recruit`, plus optional prospect-goal capture.
3. **Truthful sales framing** — Atlas MUST NOT claim “we're not in sales.” Identity answers describe financial-services / licensed product activity / educating families / training+licensing / not traditional employment.
4. **No inventing compliance facts** — No income guarantees, salaries, workbook earnings/fees, fabricated ratings, or demographic recruiting scoring (age/marital/children/homeownership) as eligibility logic.
5. **Recruit-role honesty** — Do not falsely claim recruiting has no role; clarify briefly and continue.
6. **Think-about-it** — Do not pressure-close; ask what they want to think through; if already qualification-complete, soft-invite a short interview without forcing.
7. **Soft interview transition** — Once required qualification facts are complete and there is no unresolved blocking objection/decline, FAQ/objection resumes SHOULD soft-invite the interview and delegate to the existing day-part / scheduling path (BR-049). Do not create appointments until existing scheduling rules authorize it.
8. **Respect clear decline** — BR-091 withdraw / not-interested remains terminal; do not continue interview pressure.
9. **Optional prospect goals** — Motivation themes MAY be stored as context only (not mandatory qualification) and referenced later only when the prospect stated them.
10. **CE/V2 parity** — Shared sequencing/copy for objection answers; material behavioral equivalence required.
11. **Boundaries** — Does not enable V2 execution or ads. Does not widen BR-114 allowlists. Does not redesign scheduling, Meta Reviewer, or follow-up-template systems beyond these flows. Does not implement demographic workbook scoring.

---

## BR-138 — WhatsApp Inbound Provider-Message Atomic Claim

**Implements:** One Meta/provider inbound message id may produce at most one conversational processing path.  
**Domain:** WhatsApp inbound pipeline / workflow events  
**Depends on:** existing inbound org/WABA fail-closed, BR-120, BR-129 (consume remains idempotent; this rule does not change QR matching)  
**Related:** BR-075 (outbound unchanged), BR-114 (CE fallback still available for a single legitimate turn)  
**Status:** Implemented  
**Engine target:** `whatsappInboundPipeline.js`, `workflowEventService.claimWhatsAppInboundCorrelation`, partial unique index `idx_workflow_events_whatsapp_inbound_claim`  
**Tests:** `backend/test/whatsappInboundAtomicIdempotency.test.js`

### Rules

1. **Canonical claim key** — `whatsapp:inbound:{providerMessageId}`. Meta wamids are globally unique; the claim is per provider message id, not a new org-scoped key. Org/WABA fail-closed runs first (read-only) so a mismatched asset cannot poison the claim.
2. **Claim before side effects** — After a successful atomic claim, the pipeline may locate/create, attribute QR, log, hub, author, and send. Unique conflict / already claimed MUST return `DUPLICATE_PROVIDER_MESSAGE` with no prospect mutation, QR lastTouch update, conversation log, hub, V2/CE, outbound, or BR-080 attention write.
3. **Uniqueness scope** — Only canonical inbound claim keys are unique. `stall:` / `reconcile:` / `advance:` and suffixed inbound keys (`:prospect_created`, `:conversation_started`) MUST remain non-unique.
4. **Historical duplicates** — Existing duplicate claim rows are retained and relabeled; they must not be deleted and must not cause runtime lookup failures.
5. **Boundaries** — Does not change QR matching/consume semantics, first-turn copy, CE fallback policy, appointment execution, ads, Meta Reviewer, or HUMAN takeover.

---

## BR-139 — Canonical Milestone Outranks Derived Mission Control Qualification Projection

**Implements:** Durable `canonicalMilestone` is Mission Control SoR for next action, missions, available actions, and recruiter brief. Stale QUAL_CAPTURE / brain `missingFields` / `requiredInputs` must not keep Complete Qualification after the prospect is already `INTERVIEW_READY` (or a later interview milestone).  
**Domain:** Mission Control / workflow projection / qualification  
**Depends on:** BR-037, BR-039, BR-135 (`prospects.workflow_state.canonicalMilestone`)  
**Related:** BR-025/026 (QUALIFYING actions), BR-123 (occupation optional), BR-127/BR-134 (fact sync — independent), qualification-complete → `INTERVIEW_READY` save advance (PR #131)  
**Status:** Implemented  
**Engine target:** `missionControlMilestoneProjection.js`, `missionEngine.js`, `conversationOutcomeEngine.js`, `agentActionEngine.js`, `recruiterBriefBuilder.js`, `missionControlLiveReadModel.js`, `agentActionApplicationService.js`  
**Tests:** `backend/test/interviewReadyMissionControlReconciliation.test.js`

### Rules

1. **Canonical milestone is MC SoR** — If `canonicalMilestone` is `INTERVIEW_READY`, `INTERVIEW_SCHEDULED`, `INTERVIEW_DUE`, `INTERVIEW_COMPLETED`, or `INTERVIEW_RESULT_PENDING`, Mission Control MUST NOT project Complete Qualification from stale QUAL_CAPTURE, brain `missingFields`, `requiredInputs`, or legacy qualification notes.
2. **Interview Ready + no appointment** — If `canonicalMilestone === INTERVIEW_READY` and there is no active appointment, MC MUST project Current Milestone Interview Ready, Next Action Schedule Interview, primary mission Schedule Interview, and MUST NOT show Complete Qualification mission or Complete Qualification recruiter brief.
3. **Scheduled interview unchanged** — An active appointment continues to suppress Schedule Interview (BR-039). Complete Qualification must not reappear.
4. **True QUALIFICATION unchanged** — Prospects still on `QUALIFICATION` with missing required fields remain Complete Qualification. This rule must not invent an `INTERVIEW_READY` advance.
5. **Invalidation is an explicit transition** — If qualification is truly invalid, roll back via an explicit canonical milestone transition. Never contradict the durable milestone in a read-model projection.
6. **Read-time reconciliation** — A fresh Mission Control / dashboard read is sufficient. Do not rewrite historical QUAL_CAPTURE notes or require the operator to Save qualification fields.
7. **Human-entered facts preserved** — Do not overwrite durable city/state/work authorization/interview type, notes, owner, org, or phone.
8. **Boundaries** — Does not change PR #131 save/advance, appointment creation, Recruit AI execution, HUMAN sticky ownership, Archive/Close, WhatsApp composer, calendar reconnect, Meta Reviewer, or tenant/RVP authorization. Execution gates remain OFF.

---

## BR-140 — Canonical Communication Modalities

**Implements:** Every inbound/outbound modality (text, WhatsApp audio/media, future SMS/email/voice/live-transfer) must plug into the same canonical prospect, org/tenant, conversation, ownership, qualification, Mission Control, Prospect Workspace, and outcome model. WhatsApp audio is the first media modality. Do not create a parallel audio CRM or workflow.  
**Domain:** Communications / Conversations / Mission Control / Prospect Workspace  
**Depends on:** BR-049, BR-075, BR-080, BR-118, BR-135, BR-138  
**Related:** BR-034 (ownership unchanged), BR-114 (V2 authoring canary unchanged)  
**Status:** Implemented (Phase 0 + Phase 1 + Phase 1B — persist/play audio + Safari-safe MP3 derivative; no STT)  
**Engine target:** `communicationClassification.js`, `whatsappWebhookParser.js`, `communication_media`, `whatsappMediaFetchService.js`, `audioTranscodeService.js`, `CommunicationAudioBubble`  
**Tests:** `backend/test/whatsappAudioPhase1.test.js`, `backend/test/whatsappAudioPhase1b.test.js`, Conversations unread/preview, Communications Center view-model / timeline SSR

### Rules

1. **One communication model** — Audio lives on the same prospect, organization, conversation log, ownership, qualification, and outcome records as WhatsApp text. Future channels extend this model; they must not invent a second inbox or milestone machine.
2. **Real vs operational** — Classify with structured fields (`direction`, `channel`, `intent`, `messageType`, `media_kind`) before bracket text. Inbound/outbound WhatsApp text and inbound WhatsApp audio/media are REAL communication. `[whatsapp_outbound:…]`, workflow, qualification saves, diagnostics, provider failures, internal notes, and system events are OPERATIONAL.
3. **Audio is real communication** — Inbound voice notes count for `lastCommunicationAt`, Conversations unread, list preview, and transcript bubbles. Preview label is “Voice message” / “Mensaje de voz”, never `[audio message]`.
4. **Do not treat all `[…]` as operational** — Media placeholders (`[audio message]`, `[image message]`, …) are real communication fallbacks only. Operational brackets remain hidden from preview/unread/transcript.
5. **Async media fetch** — Webhook parse + persist log + structured `communication_media` row must return fast. Meta download uses server-side WhatsApp credentials only. Private tenant-scoped storage (`organizationId/prospectId/wamid/original.<ext>`). No public URLs. No Meta temp URLs in the browser.
6. **Signed playback** — Authorized Atlas user + org guard + prospect access. Short-lived signed URL. Wrong-org denied. Phone is never the authorization key. Prefer `playback_path` MP3 derivative; serve original only when transcode is `not_required`.
7. **Webhook vs STT** — Webhook must not semantically interpret audio or send BR-118 immediately. Persist log + `communication_media`, return fast, background fetch/transcode. Phase 2 STT + semantic replay is **BR-141**. Legacy CE must not consume `[audio message]` as qualification text. Freeze qualification until transcript replay. No TAKE OVER. No BR-080 change from media fetch, transcode, or STT failure.
8. **Safari-safe derivative (Phase 1B)** — Always keep the original. Transcode OGG/Opus (and other non-native formats) to MP3 via `ffmpeg-static` in the same fetch poller. Transcode failure must not lose the original, mutate ownership, acknowledge BR-080, or change qualification. UI: preparing / unavailable in this browser — never ffmpeg/provider internals. MP3 derivative is the STT input after `transcode_status=ready|not_required`.
9. **Boundaries** — Execution gates stay independent and OFF. No appointment/scheduling/ads/voice-calling changes from media processing. No HUMAN sticky ownership change from transport=audio. STT itself is BR-141 (staging first). Do not edit applied production 039.

---

## BR-141 — Spanish-First Audio STT + Semantic Replay

**Implements:** WhatsApp voice notes become normal Recruit AI V2 text turns after durable transcription; one voice note → one inbound log → one media row → one transcript → one semantic V2 turn → at most one semantic Atlas reply  
**Domain:** WhatsApp audio / STT / Recruit AI V2  
**Depends on:** BR-140, BR-118, BR-049, BR-081, BR-111, BR-112, BR-114, BR-137  
**Related:** BR-080 (must not fire from STT success/failure), BR-075  
**Status:** Implemented (Phase 2, STAGING ONLY)  
**Engine target:** `communication/audio/stt/`, `whatsappAudioTranscriptService.js`, `whatsappMediaFetchService.js` (same poller), `processWhatsAppAudioTranscriptTurn`, `CommunicationAudioBubble`  
**Tests:** `backend/test/whatsappAudioPhase2Stt.test.js`, `frontend/src/components/communication/communicationAudioBubbleMount.ssr.test.js`

### Rules

1. **Artifact chain** — Original audio is the immutable source. The MP3 derivative is playback/STT input. The transcript is a derived semantic artifact. Never replace audio with transcript. Never overwrite `conversation_logs.message` from audio to text. `messageType` stays `audio`.
2. **Same Recruit AI V2 path** — Transcript text enters normal Recruit AI V2 interpretation (`processRecruitAiV2Turn` with `messageType=text`). Audio does not get its own qualification engine. Objections/location/work-auth use existing BRs (including BR-137).
3. **Idempotent semantic replay** — `transcript_turn_id = audio-stt:{communicationMediaId}`. Do not reuse original wamid (`whatsapp:inbound:{wamid}` is already consumed). Do not call `processInboundWhatsAppMessage` again. Do not insert a second inbound `conversation_logs` row. Duplicate poller workers no-op. Persist turn id before/around authoring.
4. **Webhook** — Persist inbound audio + `communication_media`, return quickly, trigger background media processing. Do not send BR-118 immediately. Fast STT → one semantic reply. Slow STT (~8–12s) or delay → one soft acknowledgement. Fail → one safe request to type/re-record. No ack spam.
5. **Lifecycle** — Same media row and poller. After `fetch_status=stored` AND `transcode_status=ready|not_required`: `transcript_status` pending → processing → ready | failed | skipped. Max STT duration 3 minutes. Max 3 attempts with bounded backoff.
6. **Language** — Spanish-first, not Spanish-only. Hint from canonical `preferred_language` (spanish → ES, english → EN, unknown/mixed → ES/EN). A 1-second “sí” must not flip the prospect to English. Do not mutate canonical `preferred_language` because STT guessed a language. Transcript language is metadata.
7. **Provider** — OpenAI `gpt-transcribe` via `POST /v1/audio/transcriptions` on private MP3 bytes. Server-side only. Do not reuse chat/completions. Do not use whisper-1, realtime, public Supabase URLs, or frontend keys. Do not leak provider internals into UI.
8. **Execution gates** — `RECRUIT_AI_V2_EXECUTION_ENABLED` and `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED` remain independent and OFF. STT success must not create appointments or execute scheduled actions.
9. **Ownership** — `transport=audio` alone never causes HUMAN ownership. Fetch/transcode/STT failure does not TAKE OVER, rewrite BR-080, or mutate `workflowOwnership` / `manualAgentOwnership` / `humanTakenOverAt` / `needsHumanAttention` / `canonicalMilestone` / appointment. Only normal semantic V2 logic may progress qualification from transcript meaning.
10. **UI** — Same `CommunicationAudioBubble` everywhere. Player stays. Ready shows transcript; pending shows preparing; failed shows unavailable. Confidence/provider errors stay diagnostics-only.
11. **Staging** — Migration 040 is staging-only additive audit columns. Do not apply 040 to production. Do not edit applied production 039.

---

## BR-142 — Atlas Auto-Reply Requires Positive Inbound Eligibility

**Implements:** The production WhatsApp Cloud API number may also be a personal/business line. Atlas may auto-reply (live authoring, Conversation Engine, automated outbound) only when the sender is **positively eligible**. Unknown and personal inbound default to silence.
**Domain:** WhatsApp inbound / Recruit AI / Conversation Engine
**Depends on:** BR-075, BR-114, BR-129, BR-135, BR-138
**Related:** BR-080 (unknown inbound may persist; silence is not a BR-080 AI failure), BR-049, BR-165 (user-owned WhatsApp is eligible)
**Status:** Implemented
**Engine target:** `atlasInboundAutomationEligibility.js`, `communicationHub.js` (before live authoring and `shouldDeliverAutomatedReply`), `whatsappProspectResolver.resolveCreateSourceFields`, `whatsappWebhookParser.extractClickToWhatsAppReferral`
**Tests:** `backend/test/atlasInboundAutomationEligibility.test.js`

### Rules

1. **Fail closed** — Auto-reply only with a positive signal. Do not infer eligibility from message text (`Hi`, `Hola`, …), contact name, or “someone texted 7338”.
2. **Eligible origins** — Click-to-WhatsApp Meta ad referral (`referral.source_type=ad` or `ctwa_clid`); trusted QR pending-inbound match (BR-129); stored QR / `car_magnet` / `FACEBOOK_LEAD_ADS` / `QUICK_CAPTURE` written by those verified events; durable `atlasEligibilitySource` from a verified event; or explicit `atlasAutomationEnabled=true`. `FACEBOOK` / `CLICK_TO_WHATSAPP` labels alone are **not** proof. An existing Recruit AI session / qualification step does **not** override a fail-closed inbound.
3. **Unknown inbound** — May persist the message and conversation/audit history. Must **not** create or promote an operational prospect (BR-159). Must not live-author, run CE for a customer reply, or send automated WhatsApp. Must not stamp FACEBOOK / CLICK_TO_WHATSAPP by default.
4. **Explicit enable** — Operators may set `atlasAutomationEnabled` so a previously silent contact starts receiving Atlas replies. Explicit `false` keeps Atlas silent.
5. **Boundaries** — Does not change TAKE OVER / RETURN TO ATLAS, BR-075, QR matching, or execution flags. Does not guess CTWA from greetings. Does not rewrite historical production rows.

---

## BR-147 — Campaign Intake Codes (Safe CTWA Fallback)

**Implements:** Positive Atlas campaign attribution when Meta omits `message.referral` / `ctwa_clid` on Click-to-WhatsApp inbound.  
**Domain:** WhatsApp inbound / Recruit AI / Lead Sources  
**Depends on:** BR-142, BR-129, recruiting session guard (PR #224)  
**Status:** Implemented  
**Engine target:** `campaignIntakeCode/*`, `atlasInboundAutomationEligibility.js`, `whatsappInboundPipeline.js`, `whatsappProspectResolver.js`  
**Tests:** `backend/test/campaignIntakeCodes.test.js`

### Rules

1. **Positive proof only** — A registered **ACTIVE** intake code embedded in the **first inbound of a new intake episode** is positive campaign proof when it matches exact code + organization + `whatsapp_phone_number_id` + configured purpose.
2. **No inference** — Generic greetings, campaign names without the issued token, `from_user_id`, or unknown inbound labels are **not** proof.
3. **No Meta fabrication** — Do not invent `ctwa_clid`, Meta `referral`, or CTWA labels. Atlas provenance is `CAMPAIGN_INTAKE` / `CAMPAIGN_INTAKE_CODE`.
4. **BR-142 path** — Fresh eligible paths: verified CTWA referral, QR match, **recruiting-purpose intake code on a fresh episode**, explicit operator enable, or continuation via stored verified source + **active recruiting session**.
5. **Episode gate** — Intake codes do not reopen closed/archived/HUMAN-owned conversations or completed recruiting sessions. Historical tokens in later messages do not grant new automation permission.
6. **Purpose** — `RECRUITING` codes may authorize Recruit AI auto-reply. `IUL` / `OTHER` codes may persist attribution but do **not** enter recruiting auto-reply.
7. **Token handling** — Case-insensitive exact-boundary match; strip token from semantic text passed to Recruit AI; preserve original inbound body in conversation history.
8. **Boundaries** — Does not weaken BR-142. Does not replace Meta referral when present. Does not require Meta Ads API.

---

## BR-143 — IUL Review Ad Conversation (Policy Review Goal)

**Implements:** Leads from the Spanish IUL-review ad get a natural educate → clarify → review conversation that moves toward a no-obligation review appointment without attacking IUL or sounding scripted.  
**Domain:** Recruit / Lead AI v2 / WhatsApp CTWA  
**Depends on:** BR-049, BR-081, BR-114, BR-130, BR-131, BR-142  
**Related:** BR-132 (policy-review **booking** remains unimplemented; this rule does not create appointments)  
**Status:** Implemented (conversation + copy only)  
**Engine target:** `recruitAiV2/iulAdConversation.js`; V2 `interpret` + `decide` + `responseRenderer`; referral headline/body on `extractClickToWhatsAppReferral` (eligibility unchanged)  
**Tests:** `backend/test/recruitAiV2IulAdConversation.test.js`

### Rules

1. **Track** — Activate when `conversationGoal=policy_review`, campaign kind `iul_review_ad`, CTWA referral headline/body/source_id identifies an IUL review ad, or the prospect explicitly asks to review an IUL policy. Do **not** treat recruiting CTWA or FACEBOOK labels as IUL ads.
2. **Spanish-first** — Default replies in Spanish for this campaign. Switch naturally when the prospect writes in English (existing language policy).
3. **Opener** — First IUL-ad / `IUL_REVIEW` turn uses BR-157 button-first qualification (status, then intent). Do **not** open with recruiting city/state, job-opportunity copy, IUL education, or a Zoom push.
4. **If active** — Second tap asks what they want to review (costs, growth, benefits, understand the policy, or other). Do **not** interrogate carrier, policy age, or premium before scheduling. In-flight threads that already have a legacy discovery `lastQuestionAsked` may continue A→G.
5. **Safety copy** — Never say or imply the IUL is bad before reviewing it. Never argue with the prospect’s current agent. Never call an IUL simply an “investment”; describe it as life insurance with cash-value features when relevant.
6. **Branches** — Info-only: answer briefly, then offer the review. “I don’t want to change my policy”: the review is informational and does not obligate replacement. “My agent said it’s an investment”: do not confront; explain life insurance + cash-value features; offer to review their policy. “Send the info here”: basics on WhatsApp; no personalized recommendation without a review. “Is this Primerica?”: answer clearly. “How much does it cost?”: the review is free; any financial recommendation depends on their needs/situation.
7. **Soft appointment** — After educate/clarify, invite a no-obligation review (day vs evening/night). Do **not** call `create_appointment` / recruiting interview booking (BR-132 still specified-only; BR-111/112 gates unchanged).
8. **Boundaries** — Does not change BR-142 eligibility. Does not run recruiting qualification on an established IUL-ad / `policy_review` track. Opt-out / cancel / withdraw / TAKE OVER remain unchanged.

---

## BR-145 — SaaS Tenant Billing Lifecycle

**Implements:** Smallest production-safe tenant billing/trial lifecycle for manual onboarding (Stripe link, Zelle, manual payment recording).  
**Domain:** Platform / tenant access / subscription  
**Depends on:** Sprint 16.9 SaaS foundation (`organizations`, `organization_subscriptions`, `atlas_audit_log`)  
**Related:** Platform tenant provisioning, Support Mode, `tenantOperationalGuard`  
**Status:** Implemented (Phase 1 backend)  
**Engine target:** `tenantBillingService.js`, `tenantLifecycle.js`, `platformTenantService.js`, `tenantOperationalGuard.js`  
**Tests:** `backend/test/tenantBillingMvp.test.js`

### Rules

1. **Lifecycle states** — Canonical platform lifecycle: `TRIAL` → `ACTIVE` → `PAST_DUE` → `SUSPENDED`. Source of truth for billing fields: `organization_subscriptions`. Mirror enforcement fields on `organizations` (`status`, `subscription_status`, `is_active`).
2. **Default trial** — New tenants created as `TRIAL` receive `trial_starts_at = now` and `trial_ends_at = now + 7 calendar days`.
3. **Max trial** — Super Admin may extend trial so `trial_ends_at` never exceeds `trial_starts_at + 10 calendar days` (max 3-day extension on default 7-day trial).
4. **Trial expiry** — When `now > trial_ends_at` and lifecycle is still `TRIAL`, lazy transition to `PAST_DUE` (no cron). Audit once: `platform.billing_trial_expired`. Do **not** auto-suspend on expiry.
5. **PAST_DUE (MVP)** — Remains operational (`is_active = true`). Support Mode allowed. Frontend banner deferred to Phase 2.
6. **SUSPENDED** — Super Admin manual only. `is_active = false`. Normal tenant access blocked. Support Mode blocked (existing contract).
7. **Mark paid** — Super Admin records payment. `TRIAL` or `PAST_DUE` → `ACTIVE`. Sets `last_paid_at`, `next_due_at` (+1 calendar month), appends `metadata.payments[]`. **SUSPENDED:** records payment but does **not** silently reactivate.
8. **Payment methods** — `STRIPE` (stored payment link only), `ZELLE`, `MANUAL`. No Stripe Customer/Subscription API or webhooks in Phase 1.
9. **Tenant admin** — `GET /api/organization/billing` read-only safe DTO (`billing:access`). No tenant write path.
10. **Boundaries** — No recruiting engine changes, no BR-142/143 changes, no Stripe webhooks, no invoice/accounting system.

---

## BR-146 — Team Vision Seed Tenant Invariant

**Implements:** Team Vision (`00000000-0000-4000-8000-000000000001`) is the permanent Atlas seed tenant. Automatic billing/lifecycle and destructive tenant operations must fail closed for this organization.  
**Domain:** Platform / tenancy / billing  
**Depends on:** BR-145, Sprint 16.9 SaaS foundation  
**Related:** Recruiting config defaults (C1 clone of Team Vision snapshot), platform provisioning  
**Status:** Implemented  
**Engine target:** `teamVisionSeedTenant.js`, `tenantBillingService.js`, `tenantOperationalGuard.js`, `platformTenantService.js`  
**Tests:** `backend/test/tenantBillingMvp.test.js`, `backend/test/teamVisionSeedTenant.test.js`

### Rules

1. **Must always exist** — Seed org id `00000000-0000-4000-8000-000000000001` is permanent. Recreate/replace via `createTenant` with slug `team-vision` is rejected.
2. **No automatic trial expiry** — Guards and billing jobs must skip Team Vision. Never auto-transition to `PAST_DUE` from trial dates.
3. **No automatic suspend** — Automatic lifecycle must never set Team Vision `SUSPENDED`. Super Admin may still change status explicitly via platform status PATCH.
4. **Trial dates** — Remain `NULL` unless Super Admin uses an explicit seed override. Billing PATCH cannot rewrite `trial_starts_at` / `trial_ends_at`.
5. **Billing migrations** — Must preserve Team Vision `ACTIVE`, `professional` plan, and NULL trial dates (see migration 043).
6. **Delete / archive / reset** — Fail closed (`SEED_TENANT_PROTECTED`) for Team Vision.
7. **Templates** — Child tenants may **read/clone** Team Vision recruiting defaults. They must never write Team Vision rows (`assertCannotMutateSeedFromOtherTenant`).
8. **Boundaries** — Does not change BR-142/143, WhatsApp, Meta, or recruiting engines.

---

## BR-147 — Primerica Personal Workspace (User-Owned Integrations + Scheduling)

**Implements:** Separate tenant/organization configuration from each user's personal operating setup for Primerica tenants.  
**Domain:** Settings / integrations / scheduling / WhatsApp routing / Zoom  
**Depends on:** BR-076, BR-108–BR-111, BR-114, hierarchy scope isolation  
**Related:** BR-075 (WhatsApp outbound), BR-129 (tenant isolation)  
**Status:** Implemented  
**Engine target:** `personalIntegrationOwnership.js`, `googleCalendarIntegrationService.js`, `whatsappIntegrationService.js`, `virtualMeetingUrlResolver.js`, `appointmentSchedulingEngine.js`, Settings hub  
**Tests:** `backend/test/personalWorkspaceBr147.test.js`, `frontend/src/config/hierarchyDisplayTitle.test.js`, `frontend/src/engines/whatsappEmbeddedSignupOwnership.test.js`

### Rules

1. **Organization settings** — RVP/Owner (`org:write`) only by default. Lower ranks must not see Organization settings. Office hours are location metadata and must **not** constrain agent availability.
2. **Personal workspace** — Every recruiting user may own: Google Calendar, WhatsApp Embedded Signup, Zoom URL, Mon–Sun availability, and hierarchy-scoped prospects/conversations.
3. **Hierarchy ≠ ownership** — `reports_to` controls data visibility only. It never grants management of another user's integrations.
4. **Scheduling formula** — personal availability ∩ personal Google free/busy ∩ duration/conflict rules. Do **not** intersect tenant office hours. Sunday / outside office hours allowed when the agent enables those blocks.
5. **Google ownership** — `organization_integrations.user_id` + `organization_id` + `provider`. `user_id NULL` = legacy organization-owned. Personal UI never presents another user's or org-legacy row as personal. Free/busy for an agent uses **personal** calendar only.
6. **WhatsApp ownership** — `whatsapp_integrations.user_id` nullable. Inbound Phone Number ID resolves to organization + owning user. Connected Phone Number ID remains globally unique. Personal disconnect cannot disconnect the org channel without `org:write`.
7. **Zoom** — Prefer interviewer `appointmentProfile.virtualMeeting.personalMeetingUrl`; fall back to organization Meeting Management only as legacy.
8. **Compatibility** — Do not destroy or silently reassign legacy org-owned rows. No ownership inference from phone/email alone.
9. **Permissions** — `integrations:self` manages personal connectors; `org:write` manages organization channel + Organization settings. Org-channel Connect / Reconnect uses `/settings/whatsapp?ownership=organization` and must not bounce on `personalWhatsAppEnabled`. Do not enable personal WhatsApp capability as a substitute for org reconnect.
10. **Boundaries** — No Round Robin, Recruit AI enablement, or Meta webhook architecture redesign beyond owner-user routing.

---

## BR-148 — Primerica Agent Lead/Source Capabilities

**Implements:** Per-user, tenant-scoped capability flags for organization vs personal lead channels. Supports future Round Robin without building it yet.  
**Domain:** Identity / Settings / WhatsApp / lead ownership  
**Depends on:** BR-147 (personal workspace ownership)  
**Related:** Admin Users, My Integrations, WhatsApp Embedded Signup  
**Status:** Implemented (flags + gating; Round Robin and Meta Ad Builder intentionally deferred)  
**Engine target:** `agentCapabilitiesEngine.js`, `identityAdminService.js`, Admin Users Capabilities panel, My Integrations WhatsApp gate  
**Tests:** `backend/test/agentCapabilitiesBr148.test.js`, `frontend/src/pages/identity/adminUsersGridHelpers.test.js`

### Rules

1. **Defaults for new agents** — `canReceiveOrganizationLeads=true`, `roundRobinEligible=false`, `personalWhatsAppEnabled=false`, `personalLeadSourcesEnabled=false`, `personalMetaAdsEnabled=false`.
2. **Not from rank** — Capabilities are never derived from business_rank. Two RLs may differ.
3. **Admin-only mutation** — Only `admin:users` (RVP/Admin) may change another user’s capabilities in the effective tenant (Support Mode uses effective org). Users cannot self-enable personal WhatsApp/lead sources.
4. **Personal WhatsApp UX** — When capability is OFF: hide personal Embedded Signup card; do not show “Not Connected”; do not mark setup incomplete; optional “Lead channel managed by your organization” when `canReceiveOrganizationLeads`.
5. **Readiness** — Agent may be ready with Profile + Google + Zoom + Availability + Organization Managed lead channel. Personal WhatsApp is required only when its capability is ON.
6. **Ownership** — Organization/shared source → tenant → future assignment/Round Robin. Personal campaign/WhatsApp → tenant + owning user → direct ownership (skip Round Robin unless explicitly reassigned). Store ownership explicitly when campaign/ads systems are built; never infer from phone/email.
7. **Future ads (document only)** — Client/policy ads normally agent-owned (direct). Recruiting/shared ads may be RVP/org-owned and feed Round Robin later. `personalMetaAdsEnabled` is reserved; no ad builder in this release.
8. **Boundaries** — Do not implement Round Robin, Meta Ad Builder, or Recruit AI enablement.

---

## BR-149 — Team Dashboard Access (Non-RVP Field Roles)

**Implements:** Restore Team Dashboard for RL / division leaders / agents / recruiters after scope isolation removed `dashboard:executive` from those roles. Keep Executive Dashboard RVP/Admin-only. Keep Team Dashboard data hierarchy-scoped (no org-wide fallback).  
**Domain:** Identity / Workspace navigation / Dashboard aggregates  
**Depends on:** Hierarchy scope isolation (BR-related fail-closed subtree), BR-146 Team Vision seed  
**Related:** `permissions.js`, `workspaceExperience.js`, `/api/dashboard/*`  
**Status:** Implemented  
**Engine target:** Role permission matrix (`dashboard:team`), route/nav gates, `filterProspectsForAuthContext` on dashboard aggregates  
**Tests:** `backend/test/teamDashboardAccessBr149.test.js`, `frontend/src/config/teamDashboardAccessBr149.test.js`, `hierarchyScopeIsolation.test.js`

### Rules

1. **Capability split** — `dashboard:team` grants Team Dashboard UI + scoped aggregate APIs. `dashboard:executive` grants Executive Dashboard UI + remains Admin/RVP only.
2. **Role grants** — `dashboard:team` for administrator, rvp, division_leader, agent, recruiter. Do not grant `dashboard:executive` to division_leader / agent / recruiter.
3. **Landing after login** — RVP/Admin → Executive Dashboard. SRL/RL/DIV/DIS/REP (roles with team, without executive) → Team Dashboard.
4. **Data scope** — Team Dashboard / shared `/api/dashboard/executive` (and alpha-brief) must filter via auth hierarchy scope. Missing hierarchy remains fail-closed (self), never org-wide.
5. **Boundaries** — Do not restore org-wide management scope for RL. Do not change Team Legacy feature gates. Production/Analytics may stay executive-gated.

---

## BR-150 — Team Dashboard Action-First Workspace

**Implements:** Redesign `/app/team-dashboard` as a daily execution workspace for non-RVP field users (SRL/RL/DIV/DIS/REP).  
**Domain:** Workspace UX / Dashboard presentation  
**Depends on:** BR-149 (`dashboard:team`, hierarchy-scoped dashboard APIs)  
**Status:** Implemented  
**Engine target:** `teamDashboardViewModel.js`, `TeamDashboard.jsx`  
**Tests:** `frontend/src/engines/teamDashboardViewModel.test.js`, `frontend/src/pages/teamDashboardActionFirst.test.js`

### Rules

1. **Not Executive** — Team Dashboard must not embed Executive Dashboard components (Agency Health, org-wide KPIs, Team Interview Board).
2. **Action-first** — Primary screen answers “What do I need to do today?” via KPIs, priorities, pipeline, appointments, recruiting/production panels, Atlas recommendation, recent activity.
3. **Adaptive hierarchy** — Same component adapts: self-only users see personal labels; leaders with subtree owners see team-aware appointment title. Infer team scope from scoped prospect ownership only.
4. **Data safety** — Use existing scoped `/api/dashboard` + `/api/dashboard/executive` payloads only. No org-wide fallback.
5. **Executive unchanged** — `/app/executive-dashboard` behavior and RVP-only access remain unchanged.
6. **i18n** — Spanish and English labels for all Team Dashboard chrome.

---

## BR-151 — Knowledge Hub Field Read Access

**Implements:** Restore Knowledge Hub (`/app/knowledge`) for normal field users (RL, REP, agent, recruiter). Fix blank-page crash when `useLanguage()` did not expose translation catalog `t`. Explicit `knowledge:read` for read-only reference; `knowledge:write` reserved for RVP/Admin. Never render a blank white page — show empty, 403, or error states.  
**Domain:** Workspace navigation / Knowledge Hub API / i18n  
**Depends on:** LC1 permission matrix, authenticated Atlas session  
**Status:** Implemented  
**Engine target:** `permissions.js`, `workspaceExperience.js`, `KnowledgeHub.jsx`, `LanguageContext.jsx`, `/api/knowledge/*`  
**Tests:** `backend/test/knowledgeHubFieldAccessBr151.test.js`, `frontend/src/config/knowledgeHubFieldAccessBr151.test.js`, `frontend/src/i18n/languageContextCatalog.test.js`

### Rules

1. **Read capability** — `knowledge:read` grants Knowledge Hub UI + `/api/knowledge/tree` + `/api/knowledge/document`. Grant to administrator, rvp, division_leader, agent, recruiter (and support read-only).
2. **Write capability** — `knowledge:write` is RVP/Admin only. Knowledge Hub API remains read-only in v1; write is a separate gate for future editorial flows.
3. **No org-admin escalation** — Field roles must not gain `org:write`, `admin:users`, or other management permissions via Knowledge Hub.
4. **Tenant session** — Knowledge reads require authenticated Atlas user context (`requireAtlasUser` + `knowledge:read`). Platform `/docs` content is shared; tenant isolation is enforced at auth boundary (no anonymous or cross-tenant session fallback).
5. **UI resilience** — Missing content → empty state. API 403 → forbidden state. API failure → error state. Never crash on undefined `t` translation catalog.
6. **i18n** — `knowledgeHubTitle` and error/empty copy in Spanish and English.

---

## BR-152 — Knowledge Hub Practical Agent Reference Library

**Implements:** Repurpose Knowledge Hub as a field-agent reference library with six categories, tenant feature gate `knowledgeHubEnabled`, and read-only field UX. Hide hub from sidebar when tenant disables for field users; RVP/Admin bypass tenant gate via `knowledge:write`.  
**Domain:** Knowledge Hub content model / tenant features / workspace navigation  
**Depends on:** BR-151 (`knowledge:read`, `knowledge:write`)  
**Status:** Implemented  
**Engine target:** `knowledgeHubService.js`, `knowledgeHubCategories.js`, `knowledgeHubAccess.js`, `tenantFeatureControls.js`, `KnowledgeHubLibraryHome.jsx`  
**Tests:** `backend/test/knowledgeHubPracticalLibraryBr152.test.js`, `frontend/src/config/knowledgeHubPracticalLibraryBr152.test.js`

### Rules

1. **Content root** — Agent library lives under `docs/agent-library/` with six category folders (scripts, recruiting, licensing, product, procedures, quick reference). Technical `/docs` engineering content is not exposed in the field hub API.
2. **Tenant gate** — `knowledgeHubEnabled` controls field-user access. OFF → hide sidebar + deny API with `KNOWLEDGE_HUB_NOT_ENABLED`. RVP/Admin (`knowledge:write`) bypass tenant gate.
3. **Read-only field UX** — Field roles browse/search only; no edit/delete/publish in v1.
4. **Home UX** — Category cards, search, recently updated, most-used (client view counts), empty states, back navigation inside articles.
5. **Starter content** — One generic editable article per category; no invented legal/compliance claims.
6. **Search** — Title, category, folder, path, and frontmatter keywords.

---

## BR-153 — Knowledge Hub Field UX Polish

**Implements:** Human-friendly titles/summaries, legacy localStorage purge, breadcrumbs, article cards, unavailable-article state. Field users never see engineering doc paths or stale history.  
**Depends on:** BR-152 (`docs/agent-library/**`)  
**Status:** Implemented  
**Tests:** `backend/test/knowledgeHubFieldUxBr153.test.js`, `frontend/src/config/knowledgeHubFieldUxBr153.test.js`

### Rules

1. **Display metadata** — Articles expose `displayTitle`, `shortSummary`, `categoryLabelKey`, `estimatedReadTime` from frontmatter with safe filename fallback.
2. **Storage v3** — `atlas_knowledge_activity_v3` validates recent/favorites/pinned/viewCounts against current agent-library catalog; legacy engineering paths silently purged.
3. **Unavailable articles** — Direct legacy URLs show friendly unavailable state; never expose technical title/path.
4. **Field UI** — No raw `.md` paths, folder slugs, or filesystem tree in sidebar; breadcrumbs use Hub → Category → Article.

---

## BR-154 — Knowledge Hub Single-Language Article Experience

**Implements:** Locale-specific article variants (`{slug}.en.md` / `{slug}.es.md`); API resolves full article (title, summary, body) from user locale. No mixed-language fields.
**Depends on:** BR-153
**Status:** Implemented
**Tests:** `backend/test/knowledgeHubSingleLanguageBr154.test.js`, `frontend/src/config/knowledgeHubSingleLanguageBr154.test.js`

### Rules

1. **Content variants** — Each article uses explicit locale files under `docs/agent-library/**/{slug}.{locale}.md`.
2. **Locale-neutral article path** — API/UI use `category/slug` (no `.md`, no locale suffix in URLs or storage).
3. **Single-language resolution** — `locale` query param on `/api/knowledge/tree` and `/document`; Spanish users get Spanish metadata and body only.
4. **No hybrid fallback** — Missing locale variant returns unavailable/404; never mix Spanish chrome with English article fields.
5. **Storage migration** — Activity paths normalized from legacy `*.md` to locale-neutral slugs; display refreshed from current locale catalog.

---

## BR-155 — Recruiting Welcome Opener + City/State Clarification

**Implements:** Spanish CTWA/QR first-touch opener without leading “servicios financieros”; city+state collection; ambiguous city-only asks state without guessing.
**Depends on:** BR-131, BR-094
**Status:** Implemented
**Tests:** `backend/test/recruitAiV2WelcomeLocationHotfixBr155.test.js`

### Rules

1. **Spanish ad-lead first touch** — Info-request openers use acknowledgment + location ask (`ciudad y estado`); no financial-services lead-in on turn one.
2. **Direct opportunity questions** — When prospect asks what the opportunity is (post-first-touch or explicit FAQ), use existing recruiting FAQ/overview copy honestly.
3. **Confident city resolver** — Known cities (e.g. Miami → FL) may propose/confirm state; complete `City, ST` continues without redundant state ask.
4. **Ambiguous city-only** — Ask only: `Perfecto 😊 ¿En qué estado queda esa ciudad?` — never invent state.
5. **Scope** — Copy/renderer only; no change to attribution, routing, ownership, execution gates, or scheduling.

---

## BR-157 — IUL Review Button-First Qualification (Formal Spanish)

**Implements:** WhatsApp `IUL_REVIEW` leads qualify with tap-first options (status → intent) then a Zoom-review transition, in consistent formal Spanish.  
**Domain:** Recruit / Lead AI v2 / WhatsApp Cloud API / IUL policy review  
**Depends on:** BR-143, BR-049, BR-075, BR-114, BR-142  
**Related:** BR-118 (media not ingested in this flow), BR-132 (booking still gated), BR-155 (recruiting opener must not apply)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/iulAdConversation.js`, `recruitAiV2/iulQualificationOptions.js`, `whatsappInteractiveMessage.js`, `whatsappOutboundPipeline.js`, webhook parser  
**Tests:** `backend/test/iulButtonFirstQualificationBr157.test.js`

### Rules

1. **Track** — Continue `IUL_REVIEW` / `policy_review` / `iul_review_ad`. Never route these leads into Recruit AI city/state qualification.
2. **First response** — After Atlas identifies an IUL lead: `Hola, {firstName} 👋 Gracias por escribirnos. Para orientarle mejor, ¿cuál describe su situación?` Options (IDs): `IUL_STATUS_ACTIVE`, `IUL_STATUS_RESEARCH`, `IUL_STATUS_UNSURE`. Do not explain IUL or push Zoom on this turn.
3. **Active** — `Perfecto. ¿Qué le gustaría revisar principalmente?` Options: Costos / Crecimiento / Beneficios / Entender mi póliza / Otro (`IUL_REVIEW_*` IDs). Persist the selected ID in IUL workflow `knownFacts`.
4. **Research** — `Claro. ¿Qué le interesa entender mejor?` Options include Cómo funciona. Atlas may answer briefly, then continue to the review transition. No replacement claims or product recommendations.
5. **Unsure** — `No hay problema. Podemos ayudarle a identificar qué tipo de póliza tiene.` Options: Tengo la póliza / No la tengo a mano. Do **not** pretend WhatsApp attachment ingestion/analysis exists (BR-118). After either tap, continue to the Zoom transition.
6. **Otro** — `Cuénteme brevemente qué le gustaría revisar.` Resume the IUL workflow after the free-text answer (counts as the prospect asking for more, not a third interrogation).
7. **Zoom transition** — Once Atlas has enough context (max two tap steps): `Gracias. Con eso ya tengo una mejor idea. Lo ideal es revisar su póliza con usted y explicarle exactamente lo que tiene. ¿Qué horario le funciona mejor?` Options: Mañana / Tarde. Then existing availability/slot offer. Never hard-code an appointment time.
8. **Conversation** — Formal Spanish only (`usted`, `su póliza`, `le`, `tiene`). Do not mix `tú` / `tu`. Spanish-first. Concise. Do not ask carrier, policy age, or monthly premium one-by-one before scheduling. Preserve campaign/owner/org/Meta attribution and CTWA eligibility (BR-142).
9. **Interactive send** — Prefer Cloud API reply buttons when ≤3 options and titles fit Meta’s 20-character limit; otherwise the existing list-message pattern. Branch on stable IDs, never display labels. Persist the human-readable label in conversation history. If interactive delivery fails, fall back to numbered text (`1.` / `2.` / `3.`) and accept those digits.
10. **Boundaries** — No full IUL analysis over WhatsApp. No replacement/cancellation recommendation. No unsupported guarantees or tax claims. Ordinary text-only WhatsApp conversations stay unchanged.

---

## BR-159 — Prospect Promotion Requires a Valid Signal

**Implements:** A WhatsApp/contact record may be stored for audit/history, but must not become an operational prospect merely because Atlas received, synced, or saw the contact. The same rule applies to every tenant.
**Domain:** Prospects / WhatsApp inbound / Team Dashboard / Mission Control / Prospect Center / KPIs
**Depends on:** BR-142, BR-129, BR-147, BR-080
**Related:** BR-075, BR-143, BR-157
**Status:** Implemented
**Engine target:** `prospectPromotionEligibility.js`, `whatsappProspectResolver.js`, `whatsappInboundPipeline.js`, `productionProspectFilter.js`, `prospectNumberService.js`
**Tests:** `backend/test/prospectPromotionEligibilityBr159.test.js`

### Rules

1. **Fail closed** — A contact becomes a prospect only after an explicit valid signal: verified CTWA/ad referral; trusted QR pending-inbound; valid campaign intake (recruiting or IUL); Facebook Lead Ads intake; Quick Capture explicit create; explicit manual convert/create; stored verified lead-origin evidence; or explicit `atlasAutomationEnabled=true`.
2. **Not enough** — Receiving, syncing, or seeing a WhatsApp contact is not promotion. Message text, contact name, and “someone texted the business number” are not promotion.
3. **Operational surfaces** — Personal/unknown contacts must not appear in Team Dashboard prospect lists/priorities, Mission Control queues, Prospect Center, or New/Hot/Follow-up/Appointment prospect KPIs. They must not enter Recruit AI or IUL workflow, must not trigger Atlas auto-reply (BR-142), and must not receive prospect lifecycle/status merely from contact creation.
4. **Persistence** — Conversation logs, WhatsApp archive, and audit history may remain as contact/conversation records.
5. **Multi-tenant** — Do not branch on Team Vision UUID. Team Vision, Team Legacy, and every future tenant inherit this rule automatically.
6. **Prospect identity** — Generate/display `prospect_number` from the record `organization_id` (configured prefix, or slug/name-derived: Team Vision → TV, Team Legacy → TL). Never mint a TV identity because `DEFAULT_ORGANIZATION_ID` is missing. `organization_id` remains authoritative; do not infer organization from the prefix.
7. **Boundaries** — Does not weaken CTWA, QR, IUL, or recruiting eligibility. Does not change Google Calendar, Meta ownership, billing, or appointment scheduling logic.

---

## BR-160 — Super Admin Control Plane Has No Home-Org Workload

**Implements:** A global Super Admin is a platform control-plane actor. Operational prospect workload loads only while Support Mode is explicitly active for one tenant.
**Domain:** Auth / Tenant context / Team Dashboard / Mission Control / Prospect Center / Follow-ups / Appointments / Conversations / KPIs
**Depends on:** BR-146, Support Mode
**Related:** BR-149, BR-159
**Status:** Implemented
**Engine target:** `effectiveOrganizationContext.js`, `organizationGuard.js`, `operationalControlPlane.js`
**Tests:** `backend/test/superAdminControlPlaneBr160.test.js`, `backend/test/tenantIsolationOperationalSurfaces.test.js`

### Rules

1. **Control plane** — `SUPER_ADMIN` and no Support Mode organization = no operational tenant. Do not use `users.organization_id`, `atlas_users.organization_id`, or `DEFAULT_ORGANIZATION_ID` as the operational org.
2. **Empty, not error** — Operational list/count endpoints return safe empty payloads. Do not query the Super Admin home org.
3. **Support Mode** — Entering Support Mode binds effective org to that tenant only. Exit clears operational tenant immediately.
4. **No query bypass** — `?organizationId=` while control-plane Super Admin is forbidden.
5. **Tenant users unchanged** — ADMIN, RVP, SRL, RL, DIVISION_LEADER, DISTRICT_LEADER, REPRESENTATIVE keep existing home-org / hierarchy scope.
6. **Boundaries** — Does not change WhatsApp eligibility, Recruit AI, IUL, Google Calendar, billing, appointment scheduling engines, BR-159 promotion, or prospect-number identity.

---

## BR-161 — Personal iCloud Availability Overlay (Read-Only)

**Implements:** A user who keeps personal appointments in Apple Calendar / iCloud can connect that calendar so Atlas reads busy windows and excludes them from interview slots. Google remains the booking/write calendar.  
**Domain:** Scheduling / personal integrations / availability  
**Depends on:** BR-147, BR-050, BR-079  
**Related:** BR-039 (confirm-time slot recheck), BR-049 (conversation still delegates to the same slot engine)  
**Status:** Implemented (feature-flagged)  
**Engine target:** `appointmentSchedulingEngine.js`, `availabilityTypes.js`, `icsBusyWindowCalculator.js`, `icloudCalDavClient.js`, `icloudCalendarIntegrationService.js`  
**Tests:** `backend/test/icloudAvailabilityBr161.test.js`

### Rules

1. **One engine** — Slot authority remains `appointmentSchedulingEngine.getAvailableSlots`. Do not create a second scheduler. Recruit AI / IUL continue to read this engine.
2. **Read-only iCloud** — iCloud is an additional personal availability source. Atlas does not create, edit, or delete Apple Calendar events.
3. **Google unchanged** — Google remains the booking calendar. Google free/busy fail-open behavior is unchanged.
4. **Formula** — personal working schedule ∩ Atlas appointment conflicts ∩ personal Google busy ∩ connected personal iCloud busy. A slot is unavailable if any connected source is busy. Overlaps are unioned; do not infer event identity across providers.
5. **Ownership** — Per-user only (`organization_id` + `user_id` + `provider=icloud_calendar`). Never tenant-wide. Hierarchy does not grant credential management. Support Mode may see connection status, never the app-specific password.
6. **Credentials** — Apple Account email + app-specific password. Encrypt the password with existing token encryption. Never store the password in `config`. Never log passwords, Basic Auth, raw ICS, titles, attendees, or descriptions.
7. **Busy math** — Do not depend on Apple free/busy. Discover CalDAV calendars, `REPORT calendar-query` a time range, and compute busy from ICS (timed, RRULE, EXDATE, RECURRENCE-ID, cancelled, TRANSPARENT, all-day, TZID/DST). Expand only inside the requested window and cap pathological recurrence.
8. **Fail closed** — If iCloud is not connected, ignore it. If connected and readable, merge busy. If connected and 401/403, offer no slots and require reconnect. If connected and transiently unavailable, offer no slots for that request. Never assume the user is free because Apple failed.
9. **Feature flag** — Default off (`ATLAS_ICLOUD_CALENDAR_AVAILABILITY_ENABLED`). Optional org/user allowlists for canary.
10. **Boundaries** — No WhatsApp, Recruit AI dialogue, IUL, billing, prospect-identity, or appointment-lifecycle changes.

---

## BR-162 — Ordered Interviewer Pool + Interviewer-Owned Zoom

**Implements:** Recruiting slots are interviewer-owned, not globally blocked by any appointment at a timestamp. Zoom belongs to the assigned interviewer.  
**Domain:** Scheduling / interview assignment / Zoom  
**Depends on:** BR-006, BR-007, BR-042, BR-048, BR-076, BR-147  
**Related:** BR-043 (Join Zoom reads appointment snapshot), BR-161 (personal iCloud overlay unchanged)  
**Status:** Implemented  
**Engine target:** `interviewerPoolEngine.js`, `appointmentSchedulingEngine.js`, `virtualMeetingUrlResolver.js`, `appointmentApplicationService.js`  
**Tests:** `backend/test/interviewerPoolCapacity.test.js`, `backend/test/interviewerOwnedZoom.test.js`

### Rules

1. **Generic pool** — Tenants may configure an ordered interviewer pool (`primary`, then overflow). The scheduler must not hardcode a tenant UUID. Tenants without a pool keep single-interviewer availability.
2. **Availability** — A slot is available when at least one pool member is free on working schedule ∩ Atlas interviewer-owned appointments ∩ personal Google ∩ personal iCloud. Auto-assign walks the ordered pool and persists that interviewer.
3. **Explicit selection** — Showing Ana-only or Niovel-only availability must use that interviewer’s conflicts and calendars only.
4. **Zoom owner** — Assigned `interviewer_user_id` is the Zoom authority. Snapshot that user’s personal Zoom URL on the appointment. Confirmations, 24h/1h/15m reminders, reschedule, and Join Zoom use the snapshot.
5. **No identity leak** — Do not resolve Zoom from the logged-in admin, Support Mode actor, or another interviewer. Do not use tenant default Zoom when a personal interviewer is assigned. If the assigned interviewer has no personal Zoom, fail closed.
6. **Boundaries** — Does not change daypart logic, BR-159, BR-161 fail-closed iCloud behavior, WhatsApp tenant isolation, billing, or appointment lifecycle states.

---

## BR-163 — 24-Hour Conversation Window Archive + Tenant Prospect Report

**Implements:** Keep Conversations operationally clean after the WhatsApp customer-care window expires, and provide a tenant-scoped printable prospect report.  
**Domain:** Conversations inbox lifecycle / Prospect Center reporting / multi-tenant isolation  
**Depends on:** BR-075 (customer-care window), BR-135 (soft inbox), BR-140 (qualifying communication), BR-146 / BR-160 (tenant + Super Admin control plane)  
**Related:** BR-034 / BR-080 (ownership and silence unchanged on reactivation)  
**Status:** Implemented  
**Engine target:** `conversationWindowInboxEngine.js`, `conversationsCenterLifecycle.js`, `prospectReportReadModel.js`  
**Tests:** `backend/test/conversationWindowInboxBr163.test.js`, `backend/test/prospectReportReadModelBr163.test.js`

### Rules

1. **Window source** — The 24-hour customer-care window is the latest **qualifying prospect inbound** only (BR-075 + BR-140). Delivery/read receipts, reactions, diagnostics, ownership changes, system events, and Atlas outbound must not extend the window.
2. **Archive, do not delete** — When an Active WhatsApp thread has no qualifying inbound inside the window, derive **ARCHIVED** with reason `WINDOW_EXPIRED`. Persist `inboxArchivedAt` + `inboxWindowExpiredAt` without deleting history, prospect state, campaign attribution, appointments, ownership, notes, or diagnostics.
3. **Do not auto-archive** TEST, CLOSED, or DNC threads. SCHEDULED stays Scheduled (already off Active). Fail closed without authoritative `organization_id`. Never use phone as tenant identity.
4. **Reactivate on inbound** — A later qualifying inbound restores the same tenant-scoped thread to Active (`inboxArchivedAt` / `inboxWindowExpiredAt` cleared). Do not create a duplicate prospect/thread. Re-evaluate ownership with existing rules. Do not auto-reply if eligibility/ownership says stay silent. Do not unclose CLOSED / DNC / TEST.
5. **Human ownership** — Window archive must not destroy HUMAN/ATLAS ownership history. Operator Archive/Close remains distinct from system `WINDOW_EXPIRED`.
6. **System backfill exception to BR-135 #9** — One-time / idempotent **system** window-expiry marks for Active threads already outside the 24h window are authorized. Do not invent operator TEST/CLOSED/HUMAN marks. Skip Test unless current TEST rules already apply. Report before/after counts by tenant. Ambiguous/null-org rows fail closed.
7. **Prospect report** — Tenant-scoped printable/exportable report (Prospect Center). Same authorization/hierarchy filters as Prospect Center. Super Admin without Support Mode = empty control plane. Support Mode = selected tenant only. No diagnostics, credentials, or cross-tenant data.
8. **Boundaries** — Does not change Recruit AI copy, IUL logic, scheduling/daypart, BR-161, BR-162, billing, or WhatsApp send-eligibility beyond inbox archive/reactivation state.

---

## BR-164 — Recruit AI v2 Fact Persistence + Scheduling Constraint Continuity

**Implements:** Resolved Recruit AI v2 facts must not regress; FAQ interruptions answer then resume the next unresolved step; scheduling daypart/date/time constraints persist and filter offered slots.  
**Domain:** Recruit AI v2 orchestration / durable context / shared scheduler  
**Depends on:** BR-081, BR-098, BR-105, BR-107, BR-108, BR-116, BR-119, BR-120, BR-131  
**Related:** BR-101 (day-part clock inheritance), BR-115 (offered-slot selection)  
**Status:** Implemented (execution remains OFF)  
**Engine target:** `decisionEngine` FAQ resume; `recruitConversationSequencing`; `contextPersistenceService.protectResolvedQualificationFacts`; `schedulingAvailabilityReader` day-part + same-day selection  
**Tests:** `backend/test/recruitAiV2FactRegressionSchedulerBr164.test.js`

### Rules

1. **Resolved facts stick** — City, state, work authorization, day-part, and availability constraints stay resolved unless the prospect explicitly supplies a replacement value.
2. **FAQ then forward** — Job/work FAQs (`what is the work`, `where would I work`, `que es el trabajo`, `donde trabajaria`, equivalents) are answered, then the flow resumes at the next **unresolved** step. Never re-ask a prior resolved datum.
3. **`lastQuestionAsked` cannot regress facts** — Rebuild the next action from latest persisted knownFacts before every send. Stale lastQ / lastAtlasOutboundText must not override newer facts.
4. **Stale version drop** — A write whose inbound `contextVersion` is older than the current row is rejected (`CONTEXT_STALE_VERSION_DROPPED`). Queued/outbound authored against an older version must not overwrite newer resolved facts.
5. **Tenant + channel + contact scope** — Persist and load only under organizationId + channel + canonical prospect identity. Never phone-only (BR-120).
6. **Afternoon excludes noon** — `12:00` is not afternoon. Afternoon is strictly after 12:00. Search today’s remaining afternoon window first; return multiple valid same-day options when available.
7. **Exact requested time** — Thursday + afternoon + `3` → 15:00. If that slot is available, confirm only that time. If unavailable, offer nearby alternatives that still honor date/daypart. Do not reintroduce unrelated slots (including noon).
8. **No silent terminal** — Every turn ends with explicit `respond` | `wait` | `suppress` plus a reason. Empty customer replies are not allowed on recoverable paths.
9. **Boundaries** — Shared orchestration/scheduler only. No Team Vision-specific copy. No IUL, billing, or WhatsApp isolation changes. Execution remains OFF.

---

## BR-165 — Personal WhatsApp Workspace Ownership + Default Mine Lists

**Implements:** Inbound to a user-owned WhatsApp connection is assigned to that user. The personal connection is routing/ownership metadata only — it is not prospect promotion, Conversations inbox membership, or Recruit AI eligibility. Default Conversations My Prospects / Prospect Center lists are `owner_user_id` = signed-in user only.
**Domain:** WhatsApp inbound / assignment / workspace lists / Recruit AI eligibility
**Depends on:** BR-080, BR-142, BR-147 (personal workspace), BR-148, BR-159
**Related:** BR-129 (tenant isolation), BR-149 (team/oversight views)
**Status:** Implemented
**Engine target:** `whatsappInboundOrganizationResolver`, `whatsappProspectResolver`, `newLeadAssignmentEngine`, `atlasInboundAutomationEligibility`, `prospectPromotionEligibility`, `authorizationService.resolveWorkspaceListScope`, `loadProductionProspects`, `whatsappLastInboundAsset`, `conversationsCenterHumanReplyService`, `whatsappSendCredentials`
**Tests:** `backend/test/personalWhatsAppWorkspaceBr165.test.js`, `backend/test/personalWhatsAppPrivacySurfaces.test.js`, `backend/test/conversationsCenterOwnershipUx.test.js`, `backend/test/conversationsCenterTabExclusivity.test.js`, `frontend/src/engines/conversationsWorkspaceScope.test.js`, `backend/test/atlasInboundAutomationEligibility.test.js`, `backend/test/br080NewLeadAssignmentAttention.test.js`, `backend/test/whatsappSendCredentialsCutoverPin.test.js`, `backend/test/conversationsCenterHumanReplyAssetRouting.test.js`

### Rules

1. **Personal connection owner** — `phone_number_id` → `whatsapp_integrations` with `user_id` (`whatsapp_personal_connection`) is the CRM owner. Do not fall through to org `defaultRecruiterUserId` or organization RVP. If that user is ineligible, leave the lead Unassigned. Never invent Niovel / first-RVP / default-user ownership for a personal connection.
2. **Shared org number unchanged** — `user_id` null (`whatsapp_organization_connection`) keeps BR-080 (campaign → default recruiter → RVP) and BR-142 fail-closed. Greeting text is not CTWA. Team Vision 7338 routing stays intact. Do not change Meta/WABA configuration.
3. **Personal connection is not eligibility** — Connecting a personal WhatsApp number must never mirror that user’s general inbox into Atlas. Ordinary personal contacts must not appear in Conversations (owner or Team), Mission Control, Prospect Center, or recruiting/client metrics, and must not become prospects merely because they messaged a connected personal number. A personal-channel row may surface only with explicit Atlas business eligibility: CTWA/ad referral, active campaign intake, QR attribution, explicit create/import, or `atlasAutomationEnabled=true`. Historical `atlasEligibilitySource=PERSONAL_WHATSAPP` is not eligibility. Existing ordinary-contact rows are excluded from operational read models, not deleted.
4. **Default workspace lists** — Conversations Center **My Prospects** (default) and Prospect Center default to `mine`: `owner_user_id` === signed-in user only. No fallback to `assigned_agent_id`, same-org visibility, hierarchy, workflow owner, or phone correlation. Filter in the backend query before pagination. Administrator / RVP org-wide `canAccessProspect` remains for single-thread / deep-link access only.
5. **Team Prospects / oversight is explicit** — Conversations **Team Prospects** and `workspaceScope=oversight` require authorized RVP/Admin/DL or `dashboard:executive`, show only valid downstream/team Atlas prospects (`owner_user_id !==` signed-in user), and still respect hierarchy + tenant isolation. My Prospects and Team Prospects are mutually exclusive. Ordinary personal WhatsApp contacts stay excluded. `dashboard:team` is not Conversations Team access. Unauthorized oversight requests stay `mine`. Team Dashboard / Mission Control / Executive Dashboard still use `getProspectListScope` (may include self).
6. **No silent reassignment** — Repeated inbound does not move an existing valid `owner_user_id` (BR-080). Existing mis-assigned rows need an explicit data correction.
7. **Outbound token matches inbound asset** — A reply from a personal inbound `phone_number_id` decrypts that same `whatsapp_integrations` row (`getDecryptedAccessToken(orgId, user_id)`). Do not send to a personal Graph `phone_number_id` with the org-owned / Team Vision token. Org-owned (`user_id` null) send stays the org token / env pin (BR-075). Human composer (`sendHumanComposerReply`) must resolve the conversation’s most recent inbound receiving `phone_number_id` and pass it as `inboundPhoneNumberId`. Do not omit that id and fall back to an unrelated org asset when the inbound asset is known. Do not change WABA, Meta, routing, or eligibility to paper over a token mismatch.
8. **Boundaries** — Do not weaken tenant/RBAC isolation. Do not unlock the Conversations composer for ATLAS-owned threads. Do not treat FACEBOOK / CLICK_TO_WHATSAPP labels as eligibility. Failed outbound audit rows (`WHATSAPP_OUTBOUND_*`, `[whatsapp_outbound:…]`) stay Diagnostics-only — they are not Atlas transcript bubbles.

---

## BR-168 — Late-Settled Live Authoring Reply Recovery

**Implements:** When live V2 `processTurn` exceeds the soft authoring timeout during legitimate work (including calendar I/O) but then settles with a valid authored conversational reply, Atlas must deliver that V2 reply once instead of BR-167 silence  
**Domain:** Recruit AI v2 live WhatsApp runtime / authoring timeout  
**Depends on:** BR-114, BR-125, BR-126, BR-166  
**Related:** BR-111, BR-112, BR-167 (authoring-loss fail-closed)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/lateSettledAuthoringResult.js`, `recruitAiV2/liveAuthoringBridge.js`, `communicationHub.js`  
**Tests:** `backend/test/liveAuthoringLateResultRecoveryBr168.test.js`

### Rules

1. **Late result is inspected** — On `LIVE_AUTHORING_TIMEOUT`, await the already-tracked `processTurn` within the existing post-timeout grace window. Do not start a second turn. Do not raise the 8s authoring timeout as the fix.
2. **Recover sendable conversational results** — If the late result settled successfully and has safe `replyText`, deliver it on the normal V2 outbound path (`authored=true`, no legacy CE). Classification is by mutation vs conversational outcome, not by a single action name. `offer_available_slots` is included because it is a non-mutation authored decision.
3. **BR-166 still applies** — Recovered replies go through `deliverWhatsAppReply` and the pre-send coherence guard. Stale or fact-regressive copy stays suppressed.
4. **Idempotent send** — One inbound turn yields at most one outbound. Recovery must not re-execute `processTurn` or double-send.
5. **Mutations stay fail-closed here** — Failed, partial, conflicted, or unverified mutation turns (`create_appointment` and other executable mutations, any `execution.attempted`) are not recovered by this rule. BR-125 / BR-126 remain the only post-timeout mutation owners.
6. **Unresolved timeout stays BR-167** — If the tracked turn does not settle in grace, or the late result is empty/unsafe/conflicted/unrecoverable, keep BR-167: no legacy CE fallback.
7. **Boundaries** — Does not change calendar hours, interview-hour configuration, or tenant-specific copy. Does not special-case a prospect, city, day-part word, or calendar provider.

---

## BR-135 — Durable Conversations Workflow State (prospects.workflow_state)

**Implements:** Soft Conversations Center inbox marks (TEST / ARCHIVED / CLOSED) and HUMAN ownership / needs-attention runtime fields must survive Railway deploy and process restart; stop treating ephemeral `workflowState.json` as production SoR  
**Domain:** Conversations Center / workflow ownership / Human take-over silence  
**Depends on:** BR-034, soft inbox lifecycle (PR #102/#105), Conversations ownership presentation  
**Related:** BR-041 (language out of Phase 1), BR-049, BR-080, BR-111 (execution unchanged)  
**Status:** Implemented (Phase 1)  
**Engine target:** `workflowStateStore.js` (async adapter), `workflowStateDurableRepository.js`, `conversationsCenterOwnershipService.js`, `communicationHub.shouldDeliverAutomatedReply`  
**Tests:** `backend/test/durableWorkflowStateBr135.test.js`, `preserveInboxLifecycleSoftFlags.test.js`, Conversations lifecycle / HUMAN silence regressions

### Rules

1. **Production SoR** — Durable state lives in `prospects.workflow_state` JSONB, scoped by `organization_id` + prospect `id`. Phone is lookup only.
2. **Phase 1 durable fields** — Soft inbox: `inboxMarkedTestAt`, `inboxArchivedAt`, `inboxClosedAt`, `inboxCloseReason`. Human/runtime: `workflowOwnership`, `manualAgentOwnership`, `needsHumanAttention`, `handoffReason`, `handoffAt`, `humanTakenOverAt`, `keepWithHuman`, `returnedToAtlasAt`. Conversations messaging cursor (not attention/ownership): `conversationsLastReadInboundAt`, `conversationsLastSeenInboundMessageId`.
3. **Exclude competing DNC** — Do not treat `doNotContact` as Phase 1 durable SoR (no `do_not_contact` column competition).
4. **Preserve-on-write** — Unrelated patches omit durable keys. File/memory re-read and preserve; database writes only the patch keys.
5. **Atomic DB merge** — Production persist uses `merge_prospect_workflow_state` (top-level `jsonb ||` under row update) so concurrent writers cannot erase omitted durable fields. Full JSONB replace is reserved for wipe/delete only.
6. **Production fail closed** — Production default backend is `database` (`NODE_ENV=production`, no env required). File backend is forbidden in production. No silent fallback to ephemeral JSON after DB errors. Load errors must not silently allow automated delivery.
7. **Non-prod backends** — Local may use `file`; tests may use `memory` via `ATLAS_WORKFLOW_STATE_BACKEND`.
8. **Async adapter** — Load/save are awaited at call sites (including HUMAN silence gate).
9. **No mass backfill** — After deploy, operators re-mark TEST/CLOSED/ARCHIVED / HUMAN as needed. Do not invent historical marks.
10. **Out of Phase 1** — Preferred language, occupation, interview type, receipts, wholesale `agentActionState`, and BR-111 execution enablement. V2 mid-flow knownFacts continuity remains `recruit_ai_conversation_contexts` (BR-081+), not this JSONB.
11. **Sticky TAKE OVER vs attention / advancement (clarification)** — Manual TAKE OVER (`manualAgentOwnership=true` + `humanTakenOverAt`) is authoritative Conversations ownership (**HUMAN**) until explicit RETURN TO ATLAS (or another explicit human ownership release). **BR-172** may release *temporary* TAKE OVER automatically after a successful appointment create; it must not release HUMAN_REQUIRED, keep-with-human, opt-out, or other durable human seals. Sticky HUMAN must survive BR-034 stall/attention evaluation, BR-035 human advancement / Complete Qualification, Mission Control / Prospect Center workflow evaluation, and page refresh. `needsHumanAttention` / stall / follow-up metadata may coexist as an attention warning but must not demote or mask HUMAN, disable the composer, or re-offer TAKE OVER. BR-035 must not write `manualAgentOwnership=false` or derive `workflowOwnership=ATLAS` while the sticky hold is active. Atlas automated outbound (including `allowHandoffAck`) stays suppressed while the sticky hold is active. Stall-only escalations without `humanTakenOverAt` continue to present as **NEEDS_ATTENTION**. `workflowOwnership=AGENT` without the sticky seal is **not** Conversations HUMAN — use NEEDS_ATTENTION when `needsHumanAttention` is true, otherwise ATLAS. BR-080 `human_required` without TAKE OVER is NEEDS_ATTENTION.
12. **TAKE OVER acknowledges the current BR-080 attention episode** — Explicit TAKE OVER means the human is handling the prospect and therefore acknowledges the **current** BR-080 episode via the canonical `acknowledgeLead` path (`acknowledged_at`, `acknowledged_by_user_id`, `attention_status=acknowledged`). This clears Prospect Center New / unacknowledged and BR-080-driven Human Attention for that episode and resolves `NewLeadAttention` as acknowledged. It does **not** Return to Atlas, clear sticky HUMAN, or permanently suppress future alerts. A later genuine BR-034 stall / new `human_required` episode may warn again while HUMAN remains sticky; it must not resurrect the old unacknowledged New episode.
13. **Conversations status badge is allowlisted** — The third Conversations header badge may show a user-facing lifecycle/status (`NEW`, `QUALIFICATION`, `INTERVIEW_READY`, appointment lifecycle, canonical milestone). It must not render raw qualification-brain tokens (`DAY_PART`, `CITY`, `WORK_AUTHORIZATION`, …). Presentation uses a centralized allowlist; unknown enums fail closed (omit badge).
14. **Conversations unread ≠ attention / ownership** — Messaging unread is prospect inbound WhatsApp the operator has not viewed. Source of truth is `conversation_logs` plus the Conversations-only cursor (`conversationsLastReadInboundAt` / optional `conversationsLastSeenInboundMessageId`). Unread must not be derived from `needsHumanAttention`, `workflowOwnership`, BR-080 acknowledgement, or inbox lifecycle. Mark-read on open/select updates the cursor only — it must not acknowledge BR-080, TAKE OVER, RETURN TO ATLAS, or change Archive/Close. Thread sort uses `lastCommunicationAt` from real WhatsApp only (prospect inbound + Atlas/Human outbound). System logs, qualification saves, workflow events, diagnostics, and internal notes must not create unread or reorder the list.

---

## BR-125 — Single Post-Create Ownership After Live V2 Mutation

**Implements:** When live authoring decides `create_appointment` and a mutation succeeds (or an active Atlas appointment matches the proposed slot), V2 owns durable confirmed + `appointment_confirmed` reply; CE must not take create/reply ownership via timeout fallthrough or “already confirmed” stub  
**Domain:** Recruit AI v2 live WhatsApp runtime / post-execution ownership  
**Depends on:** BR-088 (PR #88 ownership), BR-111, BR-112, BR-114, BR-122  
**Related:** BR-120, BR-121, BR-123, BR-124, BR-126, BR-127  
**Status:** Implemented  
**Engine target:** `recruitAiV2/liveAuthoringBridge.js`, `recruitAiV2/postCreateOwnership.js`, `communicationHub.js`, `semanticConversationEngine.js`  
**Tests:** `backend/test/livePathPostCreateOwnershipBr125.test.js`

### Rules

1. **One mutation owner** — For an authorized V2 `create_appointment` turn, mission create via V2 side-effect/execution is the booking owner; CE `completeInterview` must not create a second appointment after V2 already mutated.
2. **Timeout must not abandon ownership** — Soft live-authoring timeout may not fall through to CE while an in-flight V2 create finishes; reclaim late `processTurn` result and/or reconcile from `findActive` matching the proposed slot before CE.
3. **Durable confirmed** — Ownership reclaim persists `appointment.status=confirmed`, `appointmentId`, `confirmedDate`, `confirmedTime` consistent with the performed slot.
4. **V2 reply** — Customer-facing copy is V2 `appointment_confirmed` with performed date/time — never the CE “ya está confirmada / already confirmed” stub as the success owner.
5. **No confirmed → proposed** — Advisory/capture must not erase confirmed authority (existing protect); reclaim path writes confirmed SoR into durable.
6. **Execution OFF unchanged** — Speak-only deferred path remains deferred with no mutation when gates are off.
7. **Boundaries** — Does not cancel/reschedule existing live appointments; does not broaden execution allowlists; Ana/production bookings remain untouched by this code change alone.

---

## BR-124 — Explicit Schedule Intent Recovers Stale Pre-Appointment Ambiguity

**Implements:** Strong renewed “schedule an interview” intent resumes qualification/scheduling when no active confirmed appointment exists; stale clarification counters must not escalate that ask into silence  
**Domain:** Recruit AI v2 conversation / pre-booking recovery / escalation UX  
**Depends on:** BR-081, BR-082, BR-088, BR-114  
**Related:** BR-034 (human ownership delivery), BR-080 (attention read-only from v2), BR-111/112 (execution unchanged)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/interpreter.js`, `recruitAiV2/decisionEngine.js`, `communicationHub.js`  
**Tests:** `backend/test/recruitAiV2ScheduleIntentRecoveryBr124.test.js`

### Rules

1. **Explicit schedule intent** — Phrases such as “quiero agendar una entrevista” / “I want to schedule an interview” classify as `request_schedule_interview` with high confidence (not `unknown`).
2. **Pre-booking recovery** — When durable appointment is not confirmed (e.g. `none` / empty / proposed without confirmation authority) and no confirmed `appointmentId`, this intent **resets** `clarificationCount` / pending clarification and resumes the next missing qualification or scheduling step (ask only what is still needed).
3. **Do not escalate solely on stale repeats** — Prior recoverable-ambiguity counts must not force `escalate_to_human` when the new message is an explicit schedule request under rule 2.
4. **Confirmed appointment unchanged** — If durable appointment is already confirmed with an `appointmentId`, treat the ask as reschedule-flow semantics (existing BR-081 reschedule path); do not wipe confirmed booking state into day-part recovery.
5. **Weak inputs still escalate** — Ambiguous fragments / incomplete day-part with repeated clarification in the same family still escalate after the existing BR-082 threshold.
6. **Genuine escalate must speak** — When `escalate_to_human` / safe-failure escalate remains correct, customer copy uses the handoff template (`requiresHuman=true`). Delivery may still send that one acknowledgement even if workflow already shows AGENT human ownership — silence is not the product outcome for escalate.
7. **Schedule-recovery delivery** — Live V2 authored resume replies after rule 2 may likewise be delivered despite prior AGENT ownership so the prospect is not left without a next question.
8. **Boundaries** — No BR-080 ownership/attention writes from v2 persistence. Does not enable execution, change authoring allowlists, or alter PR #88 post-success confirmation ownership. No WhatsApp/appointment/Calendar mutations from this rule alone.

---

## BR-122 — Schedule Result Reconciliation (No Failure With Live Appointment)

**Implements:** Partial-write customer/system consistency — never tell the customer booking failed while an active `atlas_appointments` row remains  
**Domain:** Appointments / Recruit AI v2 execution result semantics  
**Depends on:** BR-039, BR-049, BR-050, BR-111, BR-121  
**Status:** Implemented  
**Engine target:** `missionExecutionApplicationService.executeScheduleInterview`; `recruitAiV2/sideEffectExecutor.js`  
**Tests:** `backend/test/scheduleResultReconciliationBr122.test.js`

### Rules

1. **Clean rollback → failure OK** — If Calendar + appointment persist succeed but workflow advance fails, and rollback leaves the appointment **cancelled/terminal**, customer-facing failure (`appointment_create_failed`) is correct.
2. **Orphan active → reconcile success** — If canonical scheduling reports failure **and** an **authoritative** active appointment for **this create attempt** still exists, treat the outcome as **success**, attach `appointmentId`, and never emit `appointment_create_failed`.
3. **Authoritative match (required)** — Reconcile only when ALL hold: active lifecycle status; same `organizationId`; same appointment id from this attempt when known (else phone+acting-agent active lookup); **start instant equals** requested `dateKey`+`timeKey` in conversation timezone (rejects older unrelated actives).
4. **Mission path first** — After workflow-advance rollback, re-read **this** `appointmentRecord.id` in-org. Active + same start instant → success reconcile; cancelled → failure.
5. **Executor safety net** — Prefer attempt appointment id from the schedule payload; else active lookup; always require slot instant match before success.
6. **Atlas appointment is customer booking truth** — Calendar cancelled/absent/unknown does not revoke a live Atlas scheduled appointment for reconcile-vs-failure classification (Calendar cleanup remains BR-121).
7. **No second lifecycle** — Do not create a replacement appointment during reconciliation.
8. **Occupation unchanged** — Does not add or require occupation for scheduling (occupation BR-037 correction is a separate PR).
9. **Boundaries** — Does not change prospect identity bridging (BR-120), BR-111 allowlists, timezone conversion math, or live authoring. Execution remains env-gated OFF until separately authorized.

---

## BR-121 — Idempotent Calendar Cancellation + Domain Rollback Continuation

**Implements:** Partial-write incident hardening — Calendar already-absent must not leave Atlas appointments `scheduled`  
**Domain:** Appointments / Google Calendar rollback  
**Depends on:** BR-039, BR-050  
**Related:** BR-049 (conversation scheduling remains delegated); BR-111 (execution architecture unchanged; execution remains OFF)  
**Status:** Implemented  
**Engine target:** `googleCalendarAbsence.js`; `googleCalendarIntegrationService.deleteCalendarEvent`; `schedulingService.cancelAppointment`; `appointmentApplicationService.cancelAppointment`  
**Tests:** `backend/test/appointmentCancelIdempotentBr121.test.js`

### Rules

1. **Already-absent = success for cancel/rollback** — Google Calendar `404`, `410`, `"Resource has been deleted"`, and equivalent already-absent/deleted semantics MUST be treated as successful Calendar absence. Do not abort Atlas domain cancellation.
2. **Domain cancel continues** — After attempting Calendar delete/cancel, Atlas MUST perform canonical appointment domain cancel + persist `cancelled` even when the Calendar object was already removed or cancelled.
3. **Unexpected Calendar errors** — Auth/network/5xx and other non-absence failures are logged/reported, but cancel/rollback compensation MUST still continue domain cancel so Atlas does not remain `scheduled` solely because Calendar cleanup failed.
4. **Reconcile linkage** — On successful domain cancel, clear `calendar_event_id` / `calendarEventId` (and prospect schedule cache calendar fields) appropriately.
5. **Single cancel lifecycle** — Do not invent a second cancellation lifecycle. Double-delete during rollback (mission calendar cleanup then appointment cancel cleanup) must be idempotent/harmless.
6. **Central classification** — Reuse `googleCalendarAbsence.isMissingGoogleEventError` / `isAlreadyAbsentGoogleEventError`. Do not duplicate string/status parsing across services.
7. **Boundaries** — Does not change prospect identity bridging (BR-120), occupation/milestone validation, booking response reconciliation, live authoring allowlists, BR-111 execution gates, or timezone behavior.

---

## BR-113 — Live Execution Attribution Telemetry

**Implements:** Explicit structured stage logs so every authoritative live appointment attempt is attributable to exactly one final execution source: `V2`, `LEGACY_FALLBACK`, or `LEGACY_NO_V2_ATTEMPT`.  
**Domain:** Recruit AI / observability  
**Depends on:** BR-111, BR-112  
**Status:** Implemented (telemetry only; no execution behavior change)  
**Engine target:** `recruitAiV2/liveExecutionAttribution.js`; `semanticConversationEngine.completeInterview`  
**Tests:** `backend/test/recruitAiV2LiveExecutionAttributionBr113.test.js`  
**Related ops (Stage-1):** `docs/06-business/RECRUIT_AI_V2_STAGE1_OPERATIONS.md` — monitoring cookbook for normalized `recruit_ai_v2.*` Stage-1 events (does not change BR-113 behavior)

### Rules

1. **Telemetry only** — Do not change authorization, fallback, WhatsApp routing, or appointment lifecycle.
2. **Stages** — `recruit_ai_v2_live_execution_not_attempted` (live path off); `recruit_ai_v2_live_execution_used` (v2 success); `recruit_ai_v2_live_execution_not_used` (v2 attempted, no mutation); `recruit_ai_v2_legacy_fallback_performed` (only after legacy CE `executeScheduleInterview` runs following a v2 attempt).
3. **No shadow/advisory emission** of these live attribution stages.
4. **Deterministic classification** — one booking attempt → one final `executionSource`.

---

## BR-112 — Recruit AI v2 Live Execution Path Cutover Capability

**Implements:** Smallest authoritative live Conversation Engine bridge so the live WhatsApp path can pass `options.allowExecution=true` under a fail-closed server-side live-path flag — without enabling BR-111 execution env vars or activating the canary.  
**Domain:** Recruit AI / live path integration + execution cutover boundary  
**Depends on:** BR-049, BR-050, BR-080, BR-081, BR-111  
**Related:** Live `semanticConversationEngine.completeInterview` remains the booking site; shadow/advisory remain non-executing  
**Status:** Implemented in code; **live path flag OFF** and **execution OFF** in production  
**Engine target:** `recruitAiV2/liveExecutionPathConfig.js`; `liveExecutionBridge.js`; `semanticConversationEngine.completeInterview`  
**Tests:** `backend/test/recruitAiV2LiveExecutionPathBr112.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/39_LIVE_EXECUTION_PATH_CUTOVER.md`

### Rules

1. **Live path ≠ authorization** — `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED==="true"` only allows the live CE bridge to request `allowExecution`. BR-111 still independently grants or denies mutation.
2. **Fail-closed live flag** — absent / malformed → live path disabled → `allowExecution` stays false from the live bridge.
3. **Live CE only** — `resolveAllowExecutionForLiveTurn` returns true only for `invocationSource === "live_ce"`. Shadow / advisory / playground must never request allowExecution.
4. **Booking-site intercept** — Bridge runs inside `completeInterview` before CE's direct `executeScheduleInterview`. On v2 execution success, CE uses the canonical mission result and still builds WhatsApp confirmation via `buildPersistedAppointmentConfirmation` (no v2 WhatsApp send).
5. **Fall-through safety** — If live path is off, or v2 does not successfully execute, CE may continue its existing booking path **only when mutation is authorized**. For the BR-114 LIVE_AUTHORING cohort while BR-111 execution is unauthorized, CE fallthrough is conversational only (no `executeScheduleInterview` / Calendar / `atlas_appointments` write). Non–LIVE_AUTHORING cohorts keep prior CE booking behavior.
6. **No hard-coded canary UUIDs in permission logic** — Exact org/user remain BR-111 env allowlists.
7. **Boundaries** — Do not set Railway live-path or execution vars in this sprint. Do not cut all conversation routing to v2. Do not redesign BR-049/050/111.

---

## BR-111 — Recruit AI v2 One-User Execution Canary Boundary

**Implements:** Fail-closed server-side authorization + create-only side-effect executor so Recruit AI v2 may later mutate appointments for **exactly one** allowlisted Atlas user via canonical BR-049 / BR-050 services — without enabling Railway execution yet.  
**Domain:** Recruit AI / execution authorization + appointment mutation boundary  
**Depends on:** BR-049, BR-050, BR-080, BR-081, BR-103, BR-107, BR-108, BR-110  
**Related:** BR-075 (unchanged WhatsApp gate); live `semanticConversationEngine` remains customer-visible authority until a separate cutover  
**Status:** Implemented in code; **execution remains OFF** in production (env unset)  
**Engine target:** `recruitAiV2/executionConfig.js`; `sideEffectAuthorizer.js`; `sideEffectExecutor.js`; `orchestrator.js`  
**Tests:** `backend/test/recruitAiV2ExecutionCanaryBr111.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/38_EXECUTION_CANARY_BOUNDARY.md`

### Rules

1. **Propose ≠ authorize ≠ performed** — `nextAction` / `mayCreateAppointment` are decision proposals only. `SideEffectAuthorizer` grants permission. `execution.performed` reports completed mutations. Never infer permission from `nextAction=create_appointment`.
2. **Fail-closed gates (ALL required)** — `RECRUIT_AI_V2_EXECUTION_ENABLED==="true"`; exact `organizationId` in `RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS`; exact `actingUserId` in `RECRUIT_AI_V2_EXECUTION_USER_IDS`; `profileConfigured===true`; action is an explicitly supported executable (`create_appointment` only for first canary). Missing/malformed/empty/mismatched → DENY.
3. **No role-derived permission** — Being RVP / DL / RL / FT / Representative never authorizes. Another RVP in the same org remains denied unless their exact `atlas_users.id` is allowlisted.
4. **Authorize immediately before mutation** — Re-run authorizer in the orchestrator immediately before `sideEffectExecutor`. Do not rely on a decision made only at conversation entry.
5. **Canonical mutation only** — Executor delegates create to `missionExecutionApplicationService.executeScheduleInterview` (Calendar + appointment + lifecycle). No direct `atlas_appointments` inserts, no parallel lifecycle, no v2 WhatsApp send path.
6. **Confirmation before write** — No appointment write before explicit prospect confirmation of a concrete slot. Re-check Sprint 22 availability immediately before write; stale slots fail closed.
7. **Caller live gate** — Shadow/advisory must omit `options.allowExecution`. Mutations require `authorization.authorized && options.allowExecution===true`.
8. **Idempotency** — Before create, if an active appointment already exists for the prospect, return that appointment (no second create). Prefer canonical active-appointment resolution over a parallel v2 duplicate store.
9. **Ordering** — Canonical appointment success must precede any success confirmation copy. Never report booking success if the canonical write failed. Calendar writes remain inside the canonical mission path.
10. **Availability source of truth** — Offered/executed slots use the acting user’s configured `appointmentProfile.workingSchedule` (BR-108/110). Organization office hours must not truncate personal evening/weekend availability.
11. **Boundaries** — Do not set Railway execution variables in this rule’s implementation sprint. Context capture + shadow behavior unchanged. Do not redesign BR-049/050.

---

## BR-169 — Recruit AI v2 Tenant/User Certification & Enablement

**Implements:** Durable, audited V2 onboarding so Super Admin certifies a tenant and certified-tenant Admins grant per-user authoring/execution — without requiring Railway org/user allowlist edits for normal activation.  
**Domain:** Recruit AI / tenant certification / user enablement  
**Depends on:** BR-111, BR-114, BR-129, BR-145  
**Related:** BR-112 (live CE path remains a separate global flag), BR-142, BR-165, BR-166, BR-167, BR-168  
**Status:** Implemented  
**Engine target:** `recruitAiV2/v2CertificationGrants.js`; `recruitAiV2CertificationService.js`; `liveAuthoringConfig.js`; `executionConfig.js`; platform tenant routes; Administration — Users  
**Tests:** `backend/test/recruitAiV2CertificationBr169.test.js`; `frontend/src/pages/platform/recruitAiV2CertificationHelpers.test.js`

### Rules

1. **Global kill switches remain fail-closed** — `RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED` and `RECRUIT_AI_V2_EXECUTION_ENABLED` must still be exact `"true"`. Malformed/missing master flags deny everyone, including certified tenants.
2. **Railway allowlists remain valid during migration** — Existing `*_ORGANIZATION_IDS` + `*_USER_IDS` still authorize. Durable grants are an additional path, not a replacement, until allowlists are emptied later.
3. **Tenant certified + enabled** — Super Admin only. Default off. Enable is refused until certified. Un-certify also disables the tenant. Certification never grants a user authoring or execution.
4. **Per-user authoring_enabled** — Certified-tenant Admin (`admin:users`) may grant live authoring for a same-org user. Role never authorizes.
5. **Per-user execution_enabled** — Independent of authoring. Execution is never implied by authoring, role, or tenant enablement.
6. **Suspended tenant fails closed** — `lifecycleStatus=SUSPENDED` denies live authoring and execution even if env allowlists or grants exist.
7. **Audit** — Persist `recruit_ai_v2.tenant_certified|uncertified|enabled|disabled` and `recruit_ai_v2.user_authoring_updated|user_execution_updated`.
8. **Boundaries** — Do not change WhatsApp eligibility/privacy, owner routing, BR-166 coherence, BR-167/168 timeout recovery, TAKE OVER / Return to Atlas, or `RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED`. Do not treat existing `recruitAiAuthoringEnabled` / `recruitAiExecutionEnabled` tenant feature toggles as live WhatsApp authority.

---

## BR-170 — Citizenship / Legal-Authorization Durability + SSN Privacy

**Implements:** Clear citizenship or legal-authorization statements durably resolve `workAuthorization=true`; Atlas must not re-ask that fact, must not treat SSN/privacy objections as qualification uncertainty, and must not continue automated qualification after a spoken handoff unless ownership is returned.  
**Domain:** Recruit AI / Qualification + conversation coherence  
**Depends on:** BR-083, BR-096, BR-100, BR-166  
**Related:** BR-114, BR-124 (TAKE OVER / Return to Atlas)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/qualificationFacts.js`; interpreter; decisionEngine; responseRenderer; liveAuthoringBridge; communicationHub  
**Tests:** `backend/test/recruitAiV2CitizenshipWorkAuthSsnBr170.test.js`

### Rules

1. **Citizenship resolves work authorization YES** — Pending `ask_authorization` accepts stacked prefixes (`sí claro`), optional `yo`, duration (`hace mucho`), `soy ciudadana americana`, and first-person citizenship clauses.
2. **Correction is authorization** — `Los ciudadanos americanos no necesitan permiso de trabajo` (and EN equivalents) resolve work authorization YES. The word `no` in that correction is not a denial of authorization.
3. **No re-ask** — Once `workAuthorization` / `workAuthorizationStatus` is authorized or not-authorized, do not ask work authorization again unless the prospect explicitly contradicts it. BR-166 still suppresses a residual re-ask against durable facts.
4. **SSN/privacy** — `no pienso darle mi social` and similar objections do not erase a resolved eligibility fact. Atlas must explicitly say SSN is not requested over WhatsApp.
5. **In-person is scheduling** — Preferring an in-person interview is a meeting preference, not qualification uncertainty, and must not by itself reopen work authorization.
6. **Handoff hold** — After V2 `safe_uncertain_escalate` / `HUMAN_REQUIRED`, do not continue automated qualification until TAKE OVER is returned to Atlas. Do not fall through to legacy CE for that hold. If the hold snapshot cannot be read, fail closed for that turn (`V2_HUMAN_REQUIRED_HOLD_UNRESOLVED`) — do not resume qualification. Explicit Return to Atlas still resumes.
7. **No tenant/user exceptions** — Same rules for every V2-eligible user, including Niovel and Misleisys.
8. **Boundaries** — Do not special-case a prospect or phone. Do not change WhatsApp privacy, campaign eligibility, TAKE OVER write rules, or live execution path.

---

## BR-171 — WhatsApp Natural-Language Appointment Rescheduling

**Implements:** When a prospect asks in Spanish or English to reschedule an existing appointment (including inflections such as `reprogramar` / `reprogramarla`), Atlas must correlate to that appointment, offer real interviewer availability for a supplied day, and move the same appointment through the canonical reschedule path. TAKE OVER / HUMAN ownership stays silent and does not mutate the appointment, but the request must surface as human attention.  
**Domain:** Recruit AI / Scheduling + conversation ownership  
**Depends on:** BR-049, BR-050, BR-080, BR-107, BR-111, BR-124, BR-172  
**Related:** BR-039 (calendar move), BR-076 (reminders), BR-142 (automation eligibility)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/rescheduleRequestFacts.js`; interpreter; decisionEngine; schedulingAvailabilityReader; sideEffectAuthorizer; sideEffectExecutor → `appointmentApplicationService.rescheduleAppointment`; whatsappInboundPipeline  
**Tests:** `backend/test/recruitAiV2NaturalLanguageRescheduleBr171.test.js`

### Rules

1. **ATLAS ownership — detect** — Recognize ES/EN reschedule language, including `reprogramar`, `reprogramarla`, `reprogramarlo`, `reprogramación`, `cambiar la cita`, `mover la cita`, `no podré asistir` plus an alternate date, and `Can we move my interview to Monday?`. Correlate to the existing active appointment. Do not treat this as a new create.
2. **ATLAS ownership — offer real slots** — If the prospect names a day/date (`el lunes`), load that interviewer’s real availability for that date and offer valid slots. Do not invent times.
3. **ATLAS ownership — confirm executes canonical reschedule** — After the prospect selects/confirms, call `appointmentApplicationService.rescheduleAppointment` only. Preserve prospect id and appointment id. Move the existing calendar event. Do not create a duplicate appointment. Cancel prior reminders and schedule reminders for the new slot. `missing_email` or lack of reminder confirmation must not block the reschedule.
4. **Fail closed** — Ambiguous appointment match (zero or more than one active) or a thrown calendar/canonical error must not invent a write. Tenant-scoped and interviewer-scoped.
5. **HUMAN / AGENT TAKE OVER** — Do not auto-reply and do not move the appointment. A detected reschedule or cannot-attend request must mark human attention with reason `appointment_reschedule_requested`. Do not Return to Atlas automatically on the reschedule *request*. If BR-172 already returned temporary ownership after booking, Atlas may continue the reschedule flow.
6. **Reminders under HUMAN ownership** — Automatic reminder pause/cancel when a human-owned prospect says they cannot attend is **out of scope**. Do not mutate the appointment or reminder schedule under HUMAN ownership until a separate business rule is established.
7. **No tenant/user/prospect exceptions** — Same rules for every V2-eligible thread. Do not special-case a phone or named prospect.
8. **Boundaries** — Do not duplicate calendar/reschedule logic in V2. Do not add reschedule to `allowHandoffAck`. Do not Return to Atlas from a reschedule request. Booking-time ownership return is BR-172.

---

## BR-172 — Return Temporary Ownership to Atlas After Successful Scheduling

**Implements:** When an appointment is successfully created, temporary human/manual ownership returns to ATLAS so Atlas can manage reminders, confirmation, reschedule, cancellation, Zoom/location questions, and follow-up. Explicit sticky human-required conditions stay HUMAN.  
**Domain:** Conversations ownership + canonical appointment lifecycle  
**Depends on:** BR-050, BR-080, BR-135  
**Related:** BR-124 (explicit Return to Atlas), BR-171 (reschedule after Atlas owns the thread)  
**Status:** Implemented  
**Engine target:** `appointmentSchedulingOwnership.js` → `appointmentApplicationService.createAppointment` (shared create for every tenant, agent, and purpose)  
**Tests:** `backend/test/appointmentSchedulingOwnershipBr172.test.js`

### Rules

1. **Global** — Same invariant for every tenant, agent, and supported appointment purpose (`recruiting_interview`, `fna`, `policy_review`, `client_service`, `training`, `other`). No Team Vision, user, or phone special-case.
2. **Canonical hook** — Run only after `appointmentApplicationService.createAppointment` persists the appointment. Mission Control, V2, interview-outcome, and repair creates share that path. Do not implement this in a tenant-specific controller.
3. **Temporary holds return** — Ordinary Conversations TAKE OVER (`take_over`) and WhatsApp Business App takeover (`whatsapp_business_app`) clear `manualAgentOwnership`, restore `workflowOwnership=ATLAS`, and stamp `returnedToAtlasAt`.
4. **Durable human seals stay HUMAN** — Do not clear HUMAN_REQUIRED, compliance/safety escalation, opt-out / do-not-contact, explicit `keepWithHuman`, or any other unclassified durable human-only seal.
5. **Audit** — Successful automatic return writes `conversation.returned_to_atlas_after_scheduling`.
6. **Fail open** — Ownership-return failure must not roll back the booked appointment.
7. **Reschedule requests** — BR-171 still does not Return to Atlas from inbound reschedule language. This rule fires at booking success only.
8. **Boundaries** — Do not change the explicit Return to Atlas button. Do not mutate appointments. Tenant isolation of workflow state is unchanged.

---

## BR-173 — Order-Independent Location Facts + Safe City/State Normalization

**Implements:** Location facts may arrive in any order. Spanish/English South Carolina normalizes to SC. Common city misspellings such as Bluftton resolve to Bluffton when confidence is sufficient. A later turn merges with a previously resolved partial location instead of replacing it. Once city and state are both resolved, Atlas must not re-ask either unless the prospect explicitly corrects the location.  
**Domain:** Recruit AI / Qualification location  
**Depends on:** BR-082, BR-094, BR-095, BR-102, BR-166  
**Related:** BR-155 (city/state clarification), BR-164 (fact persistence)  
**Status:** Implemented  
**Engine target:** `recruitAiV2/locationFacts.js`; interpreter; contextTurnUpdate; decisionEngine  
**Tests:** `backend/test/recruitAiV2LocationOrderNormalizationBr173.test.js`

### Rules

1. **Any order** — State first then city, city first then state, or both in one phrase must complete the same canonical pair. Do not replace a retained state when a later city arrives, and do not replace a retained city when a later state arrives.
2. **Spanish/English states** — `Sur Carolina` / `south carolina` / `carolina del sur` → SC. Equivalent Spanish aliases for other two-word U.S. states follow the same fold-then-lookup path. Do not treat those phrases as cities.
3. **Safe city typos** — High-confidence unique edit-distance-1 matches against known city spellings (and explicit aliases such as `bluftton` → Bluffton) canonicalize the city. Do not invent a state for nationally ambiguous cities.
4. **No re-ask** — After city+state are confirmed, do not ask city or state again unless the prospect explicitly corrects location. Repeated state while city is still missing asks city only.
5. **BR-166** — Coherence still suppresses `ask_state` / `ask_location` once the corresponding facts exist. This rule makes those facts resolvable so the guard can fire.
6. **Global** — Same parser/merge for every V2 conversation. No phone, prospect, tenant, or campaign special-case.
7. **Boundaries** — Do not change work authorization, scheduling, ownership, WhatsApp transport, or IUL routing.

---

## BR-174 — Recruit AI v2 Provider-Neutral Semantic Understanding Layer

**Implements:** Inbound meaning is extracted through a provider-neutral `SemanticInterpretation` contract. Atlas deterministic rules, ownership, scheduling, tenant isolation, execution authorization, BR-166 coherence, and TAKE OVER remain outside the model. The model interprets; Atlas persists. Production behavior stays on the current regex interpreter until a later apply canary.  
**Domain:** Recruit AI / Conversation understanding  
**Depends on:** BR-049, BR-081, BR-083, BR-094, BR-102, BR-166, BR-170, BR-171, BR-173  
**Related:** BR-114 (live authoring unchanged), BR-141 (STT remains a separate OpenAI transcription path)  
**Status:** Foundation implemented — shadow/observe only  
**Engine target:** `recruitAiV2/semantic/*`; orchestrator observation hook  
**Tests:** `backend/test/recruitAiV2SemanticInterpreterBr174.test.js`

### Rules

1. **Contract** — Providers return JSON that is validated into `SemanticInterpretation` (`intent`, `language`, `confidence`, `facts`, `corrections`, `objections`, `schedulingIntent`, date/time/day-part, `meetingPreference`, clarification, safety/privacy). Decision engine never reads provider-specific fields.
2. **Provider router** — `semanticInterpreter` → `providerRouter` → OpenAI adapter first. Anthropic/Google adapters may be added later without changing Atlas rules.
3. **Shadow first** — `RECRUIT_AI_V2_SEMANTIC_SHADOW_ENABLED` compares semantic vs legacy and logs disagreements. It must not change replies, context, CRM, ownership, or appointments.
4. **Apply stays off** — `applyEnabled` is false in this foundation. A later canary may apply accepted high-confidence facts through existing merge/certainty rules only.
5. **Persistence** — Atlas writes durable facts. The model is not memory. A confirmed fact cannot disappear because a later message omits it. Overwrite only on explicit correction (existing BR-170 / location overwrite guards).
6. **Fail safe** — Timeout, invalid JSON, low confidence, or missing API key leaves context unchanged and falls back to the deterministic interpreter.
7. **Minimal context** — Send inbound text, pending question, structured known facts, and appointment status only. Do not send full conversation history.
8. **Boundaries** — Do not enable live apply, do not change BR-114/111/166/TAKE OVER, do not reuse STT `gpt-transcribe` for chat, do not special-case a phone or tenant.

---

## BR-175 — AI Quality & Learning Review Center

**Implements:** A global Atlas platform capability that turns production quality signals into a human-reviewed queue and approved regression candidates. Atlas never autonomously modifies production business rules or prompts from this system.  
**Domain:** Platform / AI quality / learning loop  
**Depends on:** BR-160, BR-169, BR-174  
**Related:** BR-049, BR-081, BR-114, BR-146  
**Status:** V1 implemented — capture default off, observe/review only  
**Engine target:** `aiQuality/*`; `aiQualityService`; platform `/ai-quality` routes; Super Admin AI Quality page  
**Tests:** `backend/test/aiQualityLearningCenterBr175.test.js`; `frontend/src/pages/platform/aiQualityHelpers.test.js`

### Rules

1. **Global, not tenant-special** — Same capture, review, and isolation model for every organization. No Team Vision, user, or phone special-case.
2. **Fail-closed master switch** — `ATLAS_AI_QUALITY_CAPTURE_ENABLED` must be exact `"true"` and `ATLAS_AI_QUALITY_MODE` must be `OBSERVE` or `REVIEW`. Missing/malformed/OFF captures nothing. Tenant settings cannot override platform OFF.
3. **New tenants default off** — `ai_quality_tenant_settings.participation_enabled` defaults false. Capture requires platform on + tenant participation.
4. **Modes** — `OFF`, `OBSERVE`, `REVIEW`. Do not implement autonomous APPLY. Semantic apply remains hard-off (BR-174).
5. **Capture** — Persist structured cases from semantic vs legacy disagreement, low-confidence/timeout/invalid JSON, missed high-confidence objections, repeated-question, frustration phrases, HUMAN_REQUIRED-then-qualification, and unacted reschedule/cancel. Deduplicate open cases per organization + episode key. Do not copy raw WhatsApp bodies into quality tables.
6. **Review** — Humans mark semantic correct, legacy correct, both wrong, expected behavior, ignore, or promote a regression candidate. Promotion is mandatory before a case enters the regression library.
7. **Regression library** — An approved case becomes a copyable spec (input turns, prior facts, expected intent/facts/action, forbidden behavior, source/future BR, proposed/implemented/verified). Do not auto-edit source or tests.
8. **Access** — Super Admin sees cross-tenant platform quality. Tenant Admin sees only their organization. Normal agents have no quality console. Support Mode keeps Super Admin operationally bound to one tenant on tenant APIs.
9. **Audit** — Record tenant participation changes, reviewer decisions, expected-behavior definitions, regression promotion, and ignore/resolve in `atlas_audit_log`.
10. **Boundaries** — Do not enable capture in production in this foundation. Do not change Recruit AI replies, scheduling, ownership, or semantic apply. Do not expose provider secrets or hidden model chain-of-thought.

---

## BR-176 — Agent Notifications Foundation

**Implements:** Durable, tenant-safe in-app notifications so the responsible Atlas user is told when an important operational event happens, without watching Mission Control continuously.  
**Domain:** Notifications / operational events / workspace shell  
**Depends on:** BR-080, BR-135, appointment application services, workflow state persistence  
**Related:** BR-049, BR-160, BR-172  
**Status:** V1 implemented — in-app channel only; sound default OFF  
**Engine target:** `agentNotifications/*`; `agentNotificationService`; `/api/organization/notifications`; NotificationBell; `/app/notifications`  
**Tests:** `backend/test/agentNotificationsBr176.test.js`; `frontend/src/engines/agentNotificationSound.test.js`

### Rules

1. **V1 events** — `NEW_APPOINTMENT`, `APPOINTMENT_RESCHEDULED`, `APPOINTMENT_CANCELLED`, `NEEDS_ATTENTION`, `HUMAN_TAKEOVER_REQUESTED`.
2. **Durable + deduped** — Persist tenant-scoped rows (`organization_id`, `recipient_user_id`, `event_type`, copy, entity, `action_url`, `severity`, `read_at`, `dismissed_at`, `dedup_key`). Deterministic `dedup_key` prevents the same operational event from spamming.
3. **Route to one responsible user** — Appointments → interviewer / assigned agent / creator. Needs Attention and takeover request → current owner / assigned agent. Never broadcast tenant-wide. Never route by phone alone. No recipient → persist nothing.
4. **Own feed only** — A user may read/update only their notifications. Tenant Admin does not see another user’s personal feed. Super Admin control-plane (`controlPlaneOnly`) returns an empty feed. No cross-tenant leakage.
5. **Canonical hooks only** — Create/reschedule/cancel and `requestHumanAssist` notify from `appointmentApplicationService` after persist. Needs Attention notifies on `workflowStateStore.savePersistedWorkflowState` enter-edge only (including `explicit_human_request` / `recruiter_escalation` as takeover request). Do not hook Recruit AI decision/semantic apply, UI routes, or pollers.
6. **Needs Attention enter, not poll** — Notify when state meaningfully enters Needs Attention. Do not notify on every read. A genuinely new episode may create a new notification. Sticky TAKE OVER (`manualAgentOwnership` + `humanTakenOverAt`) is not an enter.
7. **In-app V1** — Bell with unread badge, recent list, unread/read, mark read / mark all read, click → `action_url`. Full page `/app/notifications`. Optional browser chime for new unread high-value events; default sound OFF; no loop; no sound for historical/already-read; respect autoplay.
8. **Preferences** — Per-user `atlas_users.notification_preferences.agentNotifications`: `inAppEnabled` (default ON), `soundEnabled` (default OFF), event toggles. Merge only that namespace so urgent-WhatsApp keys survive. Sound preference must not affect persistence.
9. **Channels stay separate** — Operational event → routing → channel delivery. V1 channel is in-app. Do not couple creation to WhatsApp, email, FCM, or APNs.
10. **Audit** — Audit preference updates only. Do not write `atlas_audit_log` for every read.
11. **Boundaries** — Do not change Recruit AI qualification, semantic apply, AI Quality capture, appointment scheduling rules, or ownership semantics. Do not send real external notifications from tests.

---

## BR-177 — Unified Agenda Actions & Promotion

**Implements:** Turn Agenda from a read-only appointment list into an operational workflow: Agenda Contact → Appointment → Outcome → explicit Promote to Recruit or Client, without treating unpromoted Agenda contacts as prospects.  
**Domain:** Agenda / appointments / promotion  
**Depends on:** BR-168 Unified Agenda V1; appointment application services; BR-176 notification hooks  
**Related:** BR-043, BR-045, BR-080, BR-142, BR-160, BR-176  
**Status:** V1 implemented  
**Engine target:** `agendaApplicationService`; `/api/agenda`; existing `/api/appointments` reschedule/cancel/complete  
**Tests:** `backend/test/unifiedAgendaBr177.test.js`; `frontend/src/engines/appointmentCardPresentation.test.js`  
**Docs:** `docs/06-business/BR-177-agenda-actions-promotion.md`

### Rules

1. **Canonical actions** — Record Outcome, Reschedule, Cancel, Promote to Recruit, Promote to Client. Reuse `rescheduleAppointment`, `cancelAppointment`, and `completeAppointment`. Do not duplicate scheduling in the UI.
2. **Record Outcome** — Vocabulary: `recruited`, `client`, `follow_up`, `no_show`, `cancelled`, `not_interested`, `rescheduled`, `other`. Outcome belongs to the appointment with actor + timestamp + optional note + history. Idempotent when the same outcome is already recorded. `recruited` / `client` do not auto-promote.
3. **Reschedule** — Same appointment ID; move the same calendar event where supported; keep owner/interviewer unless intentionally changed; remake reminders; no duplicate appointments. BR-176 emits `APPOINTMENT_RESCHEDULED` from the appointment service only. UI picks a real availability slot.
4. **Cancel** — Reuse canonical cancel: history, calendar, stop reminders. BR-176 emits `APPOINTMENT_CANCELLED` from the appointment service only. Reason optional.
5. **Promote to Recruit** — Explicit only. Create or link one same-org prospect; preserve `organization_id`, `owner_user_id`, name, phone, language, source/notes; link appointment/history. Phone required. Entry method is `AGENDA_PROMOTION` (not QR / CTWA / Quick Capture). Persist Agenda email as the canonical `EMAIL:` notes token — do not write `prospects.email` (live schema has no such column). Second promote returns the existing link. Do not start Recruit AI unless existing eligibility rules already allow it.
6. **Promote to Client** — Explicit only. Persist `atlas_agenda_clients` as the smallest durable client foundation and land in the BR-179 Client Workspace. Do not invent a recruiting prospect to represent a client.
7. **Workspace separation** — Unpromoted Agenda contacts stay out of Prospect Center, Mission Control recruiting metrics, Recruit AI queues, and recruiting conversion metrics. Client promotion enters only the Agenda client record.
8. **Contact details** — `atlas_agenda_contacts` is source of truth for name, phone, email, preferred language, owner, source, and notes. Phone must display when stored.
9. **Lifecycle views** — Today, Upcoming, Pending Confirmation, Human Assist, Completed, Cancelled stay consistent. Deep-linked `appointmentId` still opens off-tab.
10. **Permissions** — Same-org appointment/Agenda scope. Super Admin control-plane sees no operational Agenda data unless Support Mode is active. No cross-tenant access by appointment or contact ID.
11. **Audit** — Outcome, reschedule, cancel, promote recruit, and promote client write appointment history with friendly actor display names (not raw UUIDs).
12. **Boundaries** — Do not change Recruit AI qualification, semantic apply, AI Quality, WhatsApp eligibility, ownership semantics, or campaign intake. No Team Vision-specific code.

---

## BR-178 — Follow-up Engine V2

**Implements:** Turn operational outcomes into durable next-action obligations so leads, recruits, and clients do not fall through the cracks: outcome → follow-up → owner queue → due/overdue → in-app notification.  
**Domain:** Follow-ups / Agenda outcomes / interview outcomes / notifications  
**Depends on:** BR-035/036/037 workflow follow-up fields; BR-079 org-local dates; BR-160 control plane; BR-176 notifications; BR-177 Agenda outcomes  
**Related:** BR-044 interview outcomes; BR-080 ownership (unchanged)  
**Status:** V1 implemented — in-app only; no automatic WhatsApp/SMS/email  
**Engine target:** `followUps/*`; `followUpApplicationService`; `/api/follow-ups`; `/app/follow-ups`; dashboard summary  
**Tests:** `backend/test/followUpEngineV2Br178.test.js`; `frontend/src/engines/followUpsViewModel.test.js`  
**Docs:** `docs/06-business/BR-178-follow-up-engine-v2.md`

### Rules

1. **Durable SoT** — `atlas_follow_ups` is the source of truth for the follow-up queue, dashboard chips, and due/overdue notifications. `agentState.followUpDate` / `followUpTime` / `futureReminder` remain workflow milestone fields and are still written by interview outcomes. Leftover agentState-only items may appear as read-only legacy rows until they have a durable match. No silent mass backfill.
2. **Outcome mapping** — Canonical services only (`recordInterviewOutcome`, `recordStandaloneOutcome`). `follow_up` creates/updates an obligation (date required or default 3 days / 10:00 from existing interview config). `no_show` creates a retry (existing 7-day / 10:00 default). `not_interested` creates only when a recycle/future date is provided. `recruited` creates the existing IBA/onboarding check-in. Interview `Became Client` creates the existing 2-day service check-in. Agenda `client` does not (no Client CRM). `rescheduled` and `cancelled` create no automatic obligation.
3. **Manual create** — Authorized users may create a follow-up for prospect, conversation, appointment, Agenda contact, or client foundation. Date required; time optional; owner defaults to the current responsible owner. Date-only stays date-only.
4. **Owner queue** — `/app/follow-ups` defaults to My Follow-ups with Needs Date / Due Today / Upcoming / Overdue / Completed. A row is Overdue or Due Today only when a real due date exists (no date → Needs Date, never “Urgent — overdue”). Undated legacy rows stay visible until Set date creates/updates one durable `atlas_follow_ups` row; the legacy row is then covered by phone/entity and must not duplicate. Fetch on entry, filter/scope change, and after mutations; optional stale refresh on tab focus; no blind periodic polling on this page (BR-176 NotificationBell polling stays separate). Team scope only when existing hierarchy permissions already allow it. No phone-based tenant identity.
5. **Dashboard** — Personal Today / My Dashboard surfaces due-today count, overdue count, and the next few follow-ups. Do not build a second dashboard.
6. **Completion** — Complete, reschedule, and cancel are durable and history-aware. Completing a follow-up does not change prospect outcome. A reschedule may start a new due notification episode.
7. **Notifications** — BR-176 in-app only: `FOLLOW_UP_DUE`, `FOLLOW_UP_OVERDUE`. Owner only. Deterministic dedup by follow-up + due date. No notify-every-poll spam. No WhatsApp, email, or push.
8. **Entity separation** — One follow-up system may reference prospect, appointment, Agenda contact, conversation, or client. Agenda contact is not a prospect. Client stays client-side.
9. **Dedup** — Outcome retries, API retries, and duplicate UI submits reuse `organization_id + dedup_key`.
10. **Permissions** — Users manage only authorized follow-ups. Wrong-org IDs fail closed (404). Super Admin control-plane sees none unless Support Mode (tenant-bound).
11. **Boundaries** — Do not change Recruit AI qualification, semantic apply, AI Quality, WhatsApp eligibility, campaign intake, ownership, or appointment scheduling rules. No Team Vision-specific code.

---

## BR-179 — Client Workspace V1

**Implements:** A global, tenant-safe Client Workspace so Agenda Contact → Appointment → Client → Follow-ups is an operational path, without mixing clients into recruiting prospects or Recruit AI.  
**Domain:** Clients / Agenda / appointments / follow-ups  
**Depends on:** BR-177 Agenda client foundation; BR-178 follow-ups; BR-168 Unified Agenda; BR-160 control plane; BR-176 notifications  
**Related:** BR-043 appointments; BR-080 ownership (unchanged)  
**Status:** V1 implemented — workspace only; FNA / Policy Review remain later. Production tracking is BR-181.  
**Engine target:** `clients/*`; `clientWorkspaceApplicationService`; `/api/clients`; `/app/clients`  
**Tests:** `backend/test/clientWorkspaceBr179.test.js`; `frontend/src/engines/clientsViewModel.test.js`  
**Docs:** `docs/06-business/BR-179-client-workspace-v1.md`

### Rules

1. **Durable SoT** — `atlas_agenda_clients` is the canonical V1 client entity. Do not create a second client table. Do not represent a client as a recruiting prospect.
2. **Workspace** — `/app/clients` defaults to My Clients. Team Clients only when existing hierarchy permissions already allow it. Search by name, phone, or email.
3. **Profile** — Detail shows contact, owner, source, notes, linked Agenda contact, appointments/outcomes, BR-178 follow-ups, promoted timestamp, and friendly actor names. No raw UUIDs in normal UI.
4. **Promotion** — BR-177 Promote to Client is idempotent (one client per Agenda contact) and links to `/app/clients/:id`. Preserve org, owner, name, phone, email, language, source, notes, and appointment/contact linkage.
5. **Follow-ups** — Reuse BR-178 with `entityType=client`. Authorized users may create, complete, reschedule, or cancel from the client profile. Client follow-ups appear in `/app/follow-ups` under the same owner/isolation rules.
6. **Appointments** — Show linked appointments and reuse canonical appointment dialogs/routes. Do not duplicate scheduling logic.
7. **Status** — Optional manual statuses only: ACTIVE, FOLLOW_UP, INACTIVE. Do not auto-advance from incomplete assumptions. Do not invent insurance/policy statuses.
8. **Notes** — Tenant-scoped, actor/timestamp history. Do not store sensitive policy/health data in generic notes.
9. **Permissions** — Own clients by default. Wrong-org IDs fail closed (404). Super Admin control-plane sees none unless Support Mode (tenant-bound). No phone-based tenant identity.
10. **Recruiting separation** — Clients do not appear in Prospect Center, recruiting Mission Control metrics, Recruit AI queues, or recruiting conversion metrics.
11. **Dashboard** — Lightweight My Clients count and client follow-ups due only. Do not redesign dashboards.
12. **Boundaries** — Do not change Recruit AI, semantic apply, AI Quality, WhatsApp eligibility, campaign intake, ownership semantics, or appointment scheduling rules. No Team Vision-specific code. FNA, Policy Review, Policy Intelligence, production/premium tracking, and household relationships stay out of V1.

---

## BR-180 — Today / Action Center

**Implements:** One tenant-safe Today screen that answers “What needs my attention today?” by aggregating existing operational work.  
**Domain:** Operations / Needs Attention / appointments / follow-ups / notifications  
**Depends on:** BR-079 org-local dates; BR-080 acknowledgement; BR-160 control plane; BR-176 notifications; BR-178 follow-ups; BR-179 clients  
**Related:** BR-043 appointments; BR-034/080 human attention (unchanged)  
**Status:** V1 implemented — read model only; no new operational table  
**Engine target:** `today/*`; `todayActionCenterApplicationService`; `GET /api/today`; `/app/today`  
**Tests:** `backend/test/todayActionCenterBr180.test.js`; `frontend/src/pages/todayPageBr180.test.js`  
**Docs:** `docs/06-business/BR-180-today-action-center.md`

### Rules

1. **Aggregation only** — `/app/today` is a read model. Do not duplicate Needs Attention, appointments, follow-ups, leads, or notifications into a new operational table.
2. **Default My Today** — Team Today only when existing hierarchy permissions already allow team visibility. Preserve org isolation, owner/subtree rules, Support Mode tenant binding, and Super Admin control-plane empty. Prospect authorization uses the canonical authenticated `authContext` from `buildAuthContext` (including user `status`); do not strip fields that `canAccessProspect` / `isActiveContext` require.
3. **Sections** — Needs Attention (real cases only, including persisted CRM `human_required` / takeover that is not yet a BR-159 pipeline member; no healed BR-080 SLA false positives), today’s appointments (org-local today), follow-ups due (Due Today / Overdue / Needs Date from BR-178 `listFollowUps` including legacy undated coverage; recruiting and client), new actionable inbound conversations, unread BR-176 notifications. My Today stays owner-scoped.
4. **Display priority** — Human takeover / real NA → overdue follow-ups → appointment soon/today → due-today follow-ups → needs-date → new actionable conversations → notifications. Do not mutate underlying priority/state because an item appears on Today.
5. **Timezone** — “Today” is the resolved operational timezone (BR-079), not server UTC. Friendly times only in UI.
6. **Actions** — Reuse existing appointment, follow-up, acknowledgement, and notification-read services/routes. Refresh only Today data after mutations.
7. **Refresh** — Fetch on entry, My/Team change, after mutations, and optional stale window focus. No blind 1–2 minute full-page polling. NotificationBell polling stays separate.
8. **Counts** — Compact counts derive from the same items shown below. No conflicting dashboard math.
9. **Empty** — If nothing needs action: “You’re caught up for today.” Do not manufacture tasks.
10. **Deep links** — Prospect/conversation → existing prospect or conversation route; appointment → appointment details; prospect follow-up → prospect; client follow-up → `/app/clients/:id`; notification → existing entity-aware deep link.
11. **Clients** — Participate only through real actionable items. Do not add clients to recruiting metrics.
12. **Boundaries** — Do not change Recruit AI, semantic apply, AI Quality, WhatsApp eligibility, campaign intake, scheduling rules, BR-176 engine, or BR-178/179 sources of truth. No Team Vision-specific code.

---

## BR-181 — Production & Client Activity Foundation

**Implements:** A global, tenant-safe production/activity record so Atlas can answer what client business was submitted, issued, paid, pending, or closed — and who owns it — without mixing that work into recruiting prospects or Recruit AI.  
**Domain:** Clients / production / activity  
**Depends on:** BR-179 Client Workspace; BR-178 follow-ups; BR-160 control plane  
**Related:** BR-180 Today (unchanged — no automatic production items)  
**Status:** V1 implemented — manual records only; no carrier APIs, commissions, or inferred status  
**Engine target:** `clientProduction/*`; `clientProductionApplicationService`; `/api/production`; `/app/production`  
**Tests:** `backend/test/clientProductionBr181.test.js`; `frontend/src/pages/productionPageBr181.test.js`  
**Docs:** `docs/06-business/BR-181-client-production.md`

### Rules

1. **Durable SoT** — `atlas_client_production` is the canonical V1 production/activity entity, linked to `atlas_agenda_clients`, owning user, and organization. Do not store production on generic client notes or appointments.
2. **Types** — LIFE, INVESTMENT, ANNUITY, POLICY_REVIEW, OTHER. No product-specific schemas in V1.
3. **Statuses** — Manual only: DRAFT, SUBMITTED, PENDING, ISSUED, PAID, DECLINED, WITHDRAWN, CLOSED. Do not infer status from appointments or conversations.
4. **Amounts** — Nullable. Persist only a real stored value. Never invent 0, commissions, projections, persistency, or compensation.
5. **Workspace** — Client profile (`/app/clients/:clientId`) shows Production / Activity. `/app/production` defaults to My Production. Team Production only when existing hierarchy permissions already allow it.
6. **Metrics** — Top-level counts for Submitted, Pending, Issued, Paid. Sum amounts only when a real value exists.
7. **History** — Append created, status changed, amount changed, carrier/product changed, and notes changed. Store actor id; present a friendly name.
8. **Permissions** — Own production by default. Wrong-org and unauthorized peer IDs fail closed (404). Super Admin control-plane empty. Support Mode tenant-bound. No phone-based tenant identity.
9. **Recruiting separation** — Production records do not create recruiting prospects, enter Recruit AI, or change recruiting Mission Control / conversion metrics.
10. **Today / follow-ups** — Do not add production to Today. Do not auto-create follow-ups on status change. Authorized users may manually create a BR-178 client follow-up from a production record.
11. **Boundaries** — Do not change Recruit AI, semantic apply, WhatsApp, campaign intake, BR-176, BR-178 SoT, BR-179 client SoT, or BR-180 Today behavior. No Team Vision-specific code. Carrier APIs, commissions, compensation hierarchy, policy ingestion, FNA, and Policy Intelligence stay out of V1.

---

## BR-182 — Client Service / Policy Review Workspace

**Implements:** A global, tenant-safe client service workspace so Atlas can track policy reviews, annual reviews, document requests, and other service work separately from production and recruiting.  
**Domain:** Clients / service / appointments / follow-ups  
**Depends on:** BR-179 Client Workspace; BR-181 Production; BR-178 follow-ups; BR-180 Today  
**Related:** BR-043 appointments  
**Status:** V1 implemented — manual cases only; POLICY_REVIEW is a service case, not policy analysis  
**Engine target:** `clientService/*`; `clientServiceApplicationService`; `/api/service-cases`; `/app/service`  
**Tests:** `backend/test/clientServiceBr182.test.js`; `frontend/src/pages/servicePageBr182.test.js`  
**Docs:** `docs/06-business/BR-182-client-service.md`

### Rules

1. **Durable SoT** — `atlas_client_service_cases` is the canonical V1 service-case entity, linked to `atlas_agenda_clients`, owning user, organization, and optionally a production record. Do not store service work on generic notes, recruiting prospects, or production statuses.
2. **Types** — POLICY_REVIEW, ANNUAL_REVIEW, BENEFICIARY_UPDATE, DOCUMENT_REQUEST, SERVICE_FOLLOW_UP, GENERAL_SERVICE, OTHER. POLICY_REVIEW tracks requested / scheduled / waiting / completed service work only. Do not analyze policy values or recommend replacement.
3. **Statuses** — Manual only: OPEN, WAITING_ON_CLIENT, WAITING_ON_AGENT, SCHEDULED, COMPLETED, CANCELLED. Do not infer status from WhatsApp or appointments.
4. **Due dates** — Nullable. Classify Needs Date / Due Today / Overdue / Upcoming / closed. Never invent a date.
5. **Workspace** — Client profile shows a Service section. `/app/service` defaults to My Service. Team Service only when existing hierarchy permissions already allow it.
6. **Follow-ups / appointments** — Manual BR-178 client follow-ups only. Optional link to an existing Atlas appointment. No second reminder engine and no duplicate scheduling.
7. **Today** — Add only overdue, due-today, and Needs Date open cases to the existing Today read model. Do not list every open case. Do not change existing Today priorities.
8. **History** — Append created, status/due/title/notes changes, appointment linked/unlinked, completed, and cancelled. Store actor id; present a friendly name.
9. **Permissions** — Own cases by default. Wrong-org and unauthorized peer IDs fail closed (404). Super Admin control-plane empty. Support Mode tenant-bound. No phone-based tenant identity.
10. **Recruiting separation** — Service cases do not create recruiting prospects, enter Recruit AI, or change recruiting Mission Control / conversion metrics. IUL Review funnel stays unchanged.
11. **Boundaries** — Do not change Recruit AI, semantic apply, WhatsApp eligibility, campaign intake, BR-176, BR-178 SoT, BR-179 client SoT, or BR-181 production SoT. No Team Vision-specific code. Policy ingestion, OCR, replacement analysis, carrier APIs, and commissions stay out of V1.

---

## BR-183 — Client Documents & Secure Document Requests V1

**Implements:** A global, tenant-safe document layer so agents can request, receive, track, and organize client documents for service and policy-review work without OCR or automated analysis.  
**Domain:** Clients / service / documents  
**Depends on:** BR-179 Client Workspace; BR-182 Service; BR-181 Production; BR-178 follow-ups; BR-180 Today  
**Related:** BR-052 private storage pattern  
**Status:** V1 implemented — metadata + request workflow only  
**Engine target:** `clientDocuments/*`; `clientDocumentsApplicationService`; `/api/documents`; `/api/document-requests`  
**Tests:** `backend/test/clientDocumentsBr183.test.js`; `frontend/src/pages/clientDocumentsBr183.test.js`  
**Docs:** `docs/06-business/BR-183-client-documents.md`

### Rules

1. **Durable SoT** — `atlas_client_documents` holds metadata. `atlas_client_document_requests` tracks what the agent is waiting for. Binary objects stay in the private `client-documents` bucket. Do not store files in Postgres or on recruiting prospects.
2. **Types / statuses** — Types are manual: POLICY_DOCUMENT, APPLICATION, STATEMENT, IDENTIFICATION, BENEFICIARY_FORM, SERVICE_FORM, OTHER. Document statuses: RECEIVED, REVIEW_PENDING, REVIEWED, REJECTED, ARCHIVED. Request statuses: OPEN, RECEIVED, COMPLETED, CANCELLED. No OCR or AI classification.
3. **Upload security** — Authenticated, tenant-bound, client-authorized. Random storage keys. PDF/JPEG/PNG only, 10 MB max, sanitized filename, magic-byte check. Authorized API download only. Never expose storage keys or public bucket URLs.
4. **Fulfillment** — Link a document to a request only when the user supplies the request id. Do not auto-match on filename. Fulfillment is idempotent.
5. **Workspace** — Client profile shows requested and received documents. Service-case cards show linked documents and open requests. Do not change BR-182 service SoT.
6. **Today / follow-ups** — Add only overdue and due-today **open** requests to the existing Today follow-ups section. Needs Date stays on the client profile. Manual BR-178 client follow-ups only. No WhatsApp.
7. **Permissions** — Own documents/requests by default. Wrong-org and unauthorized peer IDs fail closed (404). Super Admin control-plane empty. Support Mode tenant-bound. No phone-based tenant identity.
8. **Recruiting separation** — Documents and requests do not create recruiting prospects, enter Recruit AI, or change Mission Control / IUL routing.
9. **Boundaries** — Do not implement OCR, PDF parsing, policy extraction, AI summaries, replacement analysis, or carrier comparison. Do not change Recruit AI, semantic apply, WhatsApp, campaign intake, BR-176, or BR-178–182 sources of truth. No Team Vision-specific code.

---

## BR-110 — Management Self Appointment Settings + Configured Playground Schedule Bind

**Implements:** MANAGEMENT recruiters (RVP / Division Leader / Regional Leader) may open Settings → Appointments to edit their **own** Sprint 22 `appointmentProfile`. Playground auto-bind may only select agents with a **persisted/configured** appointment profile — engine default Mon–Fri 09:00–17:00 is not treated as configured.  
**Domain:** Identity / Settings UX + Recruit AI Playground availability  
**Depends on:** Sprint 22 appointment profile; BR-109; BR-108  
**Related:** BR-080 (unchanged; no ownership mutation)  
**Status:** Implemented (execution remains OFF)  
**Engine target:** `workspaceExperience.js` Settings gates; `appointmentProfileService.profileConfigured`; `recruitAiV2CustomPlayground.resolvePlaygroundReadAgent`  
**Tests:** `frontend/src/config/settingsAppointmentsAccessBr110.test.js`; `backend/test/appointmentProfileConfiguredBr110.test.js`; `backend/test/recruitAiV2PlaygroundRollingPathBr109.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/37_PLAYGROUND_ROLLING_AVAILABILITY_PATH.md`

### Rules

1. **Self only** — Appointments Settings UI for MANAGEMENT edits the authenticated user’s profile via existing `GET/PATCH /api/appointments/profile`. No other-user edit.
2. **Not admin expansion** — Do not grant Review Users, subordinate schedule editing, or org-level Scheduling merely to open Appointments.
3. **Representatives / Field Trainers** — Intentionally excluded from this Settings hub expansion (no MANAGEMENT workspace); backend self API remains available if reached.
4. **Configured ≠ normalized default** — `profileConfigured` is true only when a persisted 7-day `workingSchedule` exists on `appointmentProfile`.
5. **Playground auto-bind** — org_default / operating RVP only if `profileConfigured`; otherwise unresolved (BR-105). Production/shadow owner resolution unchanged.
6. **No Admin→RVP copy** — Operators configure the RVP schedule manually after UI access exists.
7. **Boundaries** — No Railway vars, no execution enablement, no BR-080 mutation, no schedule migration.

---

## BR-109 — Recruit AI Playground Rolling Availability Path + Non-Narrating Constraint Copy

**Implements:** Ops Center Playground must resolve a read-only scheduling agent for live Sprint 22 reads (without BR-080 mutation) so BR-108 rolling offers run on the real UI path; ordinary scheduling acknowledgements must not narrate internal note-taking (“anoto que puedes…”).  
**Domain:** Recruit AI / Ops Playground + Scheduling UX  
**Depends on:** BR-081, BR-084, BR-105, BR-107, BR-108; Sprint 22 read path; **BR-110** (configured-profile bind)  
**Related:** BR-080 (read-only; no mutation from playground)  
**Status:** Implemented in Recruit AI v2 playground wiring + response templates (execution remains OFF)  
**Engine target:** `recruitAiV2CustomPlayground.js` read-agent bind → async `sendPlaygroundTurnAsync`; `responseRenderer` constraint copy  
**Tests:** `backend/test/recruitAiV2PlaygroundRollingPathBr109.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/37_PLAYGROUND_ROLLING_AVAILABILITY_PATH.md`

### Rules

1. **Real Playground path** — Ops HTTP turns use async Sprint 22 reads; synthetic playground prospects still need a resolvable read agent.
2. **Safe agent bind** — Precedence: explicit agent/owner (configured or fixture/sim) → org default recruiter **if configured** → deterministic org operating RVP **if configured**. Never random RVP pick. Never create/claim/assign (no BR-080 writes). Never treat engine-default 09:00–17:00 as configured (BR-110).
3. **No-date constraint** — Missing `proposedDate` must not force ask-time when rolling search can run.
4. **Copy** — Do not use “anoto que puedes / anoto tu disponibilidad / Entendido — anoto…” for ordinary scheduling facts; prefer action (“Tengo disponible…”) or a direct missing question.
5. **Fallback priority** — 2 slots → offer 2; 1 → offer 1; successful zero → truthful no-availability; unread/missing agent/provider failure → BR-105 clarification (without robotic anoto).
6. **Boundaries** — No Railway flag changes, no execution enablement, no live CE cutover, no WhatsApp/Calendar/appointment writes from v2.

---

## BR-108 — Recruit AI Rolling Multi-Date Availability Offer

**Implements:** When a prospect supplies a useful time constraint (`después de las 5`, etc.) without a concrete date, Atlas proactively searches upcoming REAL Sprint 22 availability (org-local NOW → preferred 48h horizon, then bounded day-by-day expansion) and offers up to two useful day+time choices (“Tengo disponible…”), instead of asking the prospect to invent a day or a specific clock time.  
**Domain:** Recruit AI / Scheduling UX + availability Tools  
**Depends on:** BR-079, BR-081, BR-084, BR-102, BR-105, BR-107; Sprint 22 appointment scheduling engine (read path)  
**Related:** BR-008 (Presence), BR-080 (read-only; no mutation from v2); **BR-109** (Playground path wiring)  
**Status:** Implemented in Recruit AI v2 engines (read-only; execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/schedulingAvailabilityReader.js` rolling search → `getSlots` (`date`/`dateEnd`); `decisionEngine` + `responseRenderer` multi-date offer templates  
**Tests:** `backend/test/recruitAiV2RollingAvailabilityBr108.test.js`  
**Simulator:** `rolling-availability-after-constraint`  
**Docs:** `docs/03-engineering/recruit-ai-v2/36_ROLLING_AVAILABILITY_OFFER.md`

### Rules

1. **Read ≠ write** — Rolling search may call Sprint 22 availability for multiple dates; never reserve, book, Calendar-write, WhatsApp, or mutate BR-080 while execution is OFF.
2. **Constraint-first proactive offer** — With a confirmed time constraint and no concrete date, do not default to “¿Qué día…?” / “¿Qué hora después de las 5…?”; search and offer real options.
3. **Bounded search** — Preferred initial horizon **48 hours** from org-local NOW; if fewer than 2 useful slots, expand date-by-date up to **14 calendar days** from org-local today. Never unbounded search.
4. **Same-day remaining first** — If the first qualifying date has 2+ valid remaining slots, offer same-day earliest+latest (BR-107 / BR-164). Do not jump to the next date while those remain. Introduce another date only when the first date has a single remaining slot (or the prospect asks for another day). Never invent slots.
5. **Past slots** — Never offer slots at/before NOW; skip exhausted current-day windows automatically.
6. **Boundaries preserved** — BR-107 exclusive/inclusive earliestTime semantics apply on every searched date.
7. **Zero vs unread** — Successful zero across the allowed horizon → truthful no-availability + ask different time preference; provider/agent failure → BR-105-style fallback (do not claim zero).
8. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution enablement, no live CE cutover, no BR-080 mutation.

---

## BR-107 — Recruit AI Available-Slot Offering After a Time Constraint

**Implements:** When a prospect supplies an availability constraint (`después de las 5`, day-part, before/after windows), preserve the constraint, read canonical real availability when safely available, filter violating slots, select up to two meaningfully spaced candidates, and offer them directly (“Tengo disponible…”) instead of echoing the constraint and asking the prospect to invent a time.  
**Domain:** Recruit AI / Scheduling UX + availability Tools  
**Depends on:** BR-081, BR-084, BR-102, BR-103, BR-105; Sprint 22 appointment scheduling engine (read path)  
**Related:** BR-008 (Presence), BR-080 (read-only; no mutation from v2); **BR-108** (rolling multi-date when no concrete date)  
**Status:** Implemented in Recruit AI v2 engines (read-only; execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/schedulingAvailabilityReader.js` → `appointmentApplicationService.getSlots` / Sprint 22; orchestrator injection; `decisionEngine` + `responseRenderer` offer templates  
**Tests:** `backend/test/recruitAiV2ReadonlySlotOfferingBr107.test.js`  
**Simulator:** `readonly-slot-offering-after-constraint` (fixture-injected availability only; no invented slots)  
**Docs:** `docs/03-engineering/recruit-ai-v2/35_AVAILABLE_SLOT_OFFERING.md`

### Rules

1. **Read ≠ write** — Offering slots uses availability READ only. Never create/update appointments, Calendar events, WhatsApp, or BR-080 from this path while execution is OFF.
2. **Canonical source only** — Sprint 22 engine (agent schedule + Atlas appointments + optional Google FreeBusy). Do not offer from legacy `capacity.json` while booking truth is Sprint 22.
3. **Never fabricate** — Example times (5:30 / 7:00) are illustrative. If availability cannot be read safely, keep BR-105 ask-for-time / awaiting behavior and document the gap — do not invent slots.
4. **Constraint first** — Preserve `earliestTime` / `latestTime` / `earliestTimeInclusive` / day-part; filter out violating slots before selection. Exclusive phrases (`después de` / `after`) mean `time > earliestTime`; inclusive phrases (`a partir de` / `starting at` / `desde`) mean `time >= earliestTime`.
5. **Up to two candidates** — Prefer diversity of choice among real slots (earliest + latest when distinct). Avoid adjacent near-duplicates when farther real options exist. If only adjacent slots exist, offer them. No hardcoded 60/90-minute (or Nx duration) minimum spacing.
6. **One / zero / unread** — One → offer that time; successful zero → say no qualifying availability; read unavailable → BR-105 ask-time fallback (do not claim zero when unread).
7. **Concrete date / rolling** — Single-day offer when a concrete date is known. When only a time constraint is known, **BR-108** performs bounded rolling search instead of forcing the prospect to pick a date first.
8. **Conversation style** — Prefer “Tengo disponible…”; avoid mechanical “anoto que puedes / me dijiste que…” when offering real options.
9. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution enablement, no live CE cutover, no BR-080 mutation.

---

## BR-106 — Recruit AI Short Pay-Mechanics Compensation Phrase Recognition

**Implements:** Recognize short pay-mechanics phrases (`como pagan`, `cómo es el pago`, `how do they pay`, pay structure, …) as existing `compensation_question` / `pay_how`; answer directly from canonical production-based compensation knowledge; never map to name/generic Continuemos; preserve `awaiting_availability` and preferred time when availability is unresolved.  
**Domain:** Recruit AI / Conversation / FAQ routing  
**Depends on:** BR-081, BR-088, BR-095, BR-104, BR-105  
**Related:** BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/compensationQuestion.js`, interpreter name blocklist, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2ShortPayMechanicsBr106.test.js`  
**Simulator:** `short-pay-mechanics-como-pagan`  
**Docs:** `docs/03-engineering/recruit-ai-v2/34_SHORT_PAY_MECHANICS.md`

### Rules

1. **Reuse intent** — `compensation_question` + `pay_how` subtype; no parallel top-level intent.
2. **Priority** — Pay-mechanics phrases outrank name extraction, soft ack, fragment, and generic clarify.
3. **Direct answer** — Production-based / not fixed hourly; no Continuemos; no fabricated amounts/%.
4. **Lifecycle** — While `awaiting_availability`, answer FAQ without inventing a slot, confirmation, or handoff.
5. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-105 — Recruit AI Constraint-Preserving Resume + Direct Compensation Answers

**Implements:** After availability constraints (e.g. after 5 → `earliestTime=17:00`), FAQ/objection interruptions must resume the most specific pending time ask (after-5), not a degraded day-part-only prompt; answer compensation subtypes with direct yes/no supported by canonical FAQ; omit mechanical “Por cierto” on FAQ resume; reject bare hours before the earliest bound.  
**Domain:** Recruit AI / Scheduling lifecycle + FAQ continuity  
**Depends on:** BR-081, BR-084, BR-088, BR-102, BR-103, BR-104  
**Related:** BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `decisionEngine.resolvePendingResume`, `responseRenderer.composeFaqThenResume`, `schedulingConstraints`, `teamVisionWorkflowCopy`, `contextTurnUpdate`  
**Tests:** `backend/test/recruitAiV2ConstraintPreservingResumeBr105.test.js`  
**Simulator:** `constraint-preserving-resume-compensation`  
**Docs:** `docs/03-engineering/recruit-ai-v2/33_CONSTRAINT_PRESERVING_RESUME.md`

### Rules

1. **Most-specific resume** — `earliestTime` / `latestTime` outrank day-part-only prompts when asking for a specific time.
2. **No degradation** — FAQ/objection interruptions preserve modality, day_part, constraints, and preferred time.
3. **Direct compensation answers** — Yes/no where canonical knowledge supports it (production-based; not hourly; not guaranteed fixed salary); no invented rates/%.
4. **Natural resume** — Do not mechanically prepend “Por cierto” / “By the way” on FAQ→workflow resume.
5. **Constraint precedence** — Bare hours before `earliestTime` clarify; valid later hours inherit PM context (after 5 + 6 → 18:00).
6. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-104 — Recruit AI Compensation / Earnings FAQ Routing During Scheduling

**Implements:** Recognize direct compensation/earnings questions (`entonces como voy a ganar dinero`, `cómo me pagan`, `how do I make money`, …) as existing `compensation_question` before pending `ask_time` / location / fragment / generic clarify; answer concisely with progressive disclosure; resume the exact pending scheduling question without income guarantees.  
**Domain:** Recruit AI / Conversation / FAQ routing  
**Depends on:** BR-081, BR-088, BR-095, BR-097, BR-098, BR-103  
**Related:** BR-090 (fixed-employment preference distinct), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/compensationQuestion.js`, interpreter, decisionEngine, responseRenderer, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2CompensationFaqBr104.test.js`  
**Simulator:** `compensation-faq-during-ask-time`  
**Docs:** `docs/03-engineering/recruit-ai-v2/32_COMPENSATION_FAQ_ROUTING.md`

### Rules

1. **Reuse intent** — Use existing `compensation_question`; do not invent a parallel intent.
2. **Priority** — Clear compensation FAQ outranks `ask_time` / day-part / date / location / name / fragment / generic clarify.
3. **Progressive disclosure** — Broad earnings asks get a short structure answer; subtypes (`hourly_pay_question`, `salary_question`, `fixed_pay_question`, `commission_question`, how-much) get specific short answers without stacking every caveat. Short-forms like `a como la hora` / `es pago fijo` are included.
4. **Safety** — No income guarantees, unsupported dollar amounts, “unlimited income”, invented commission percentages, or false hourly/salary promises.
5. **Continuity** — Preserve location, work auth, modality, day-part; resume the exact pending scheduling question after the FAQ.
6. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-103 — Recruit AI Acknowledgement Semantics + Network Objection

**Implements:** Soft acknowledgements (`ok` / `perfecto` / …) after preference capture or “I’ll review availability” are not appointment confirmations; `schedule_confirm` requires a concrete confirmable slot. Network/prospecting objections (`no conozco a nadie`, …) are answered briefly without lead/client guarantees and resume scheduling without generic fallback.  
**Domain:** Recruit AI / Scheduling lifecycle + Objection handling  
**Depends on:** BR-081, BR-084, BR-085, BR-087, BR-088, BR-095, BR-099, BR-102  
**Related:** BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/schedulingConfirmation.js`, `networkObjection.js`, interpreter, decisionEngine, responseRenderer  
**Tests:** `backend/test/recruitAiV2AckNetworkObjectionBr103.test.js`  
**Simulator:** `acknowledgement-not-confirmation-network-objection`  
**Docs:** `docs/03-engineering/recruit-ai-v2/31_ACK_VS_CONFIRM_NETWORK_OBJECTION.md`

### Rules

1. **Acknowledgement ≠ confirmation** — Short acks (`ok`, `okay`, `dale`, `perfecto`, `está bien`, `gracias`, `sounds good`, `got it`, `thanks`) follow the immediately preceding Atlas action. They do not invent appointments or handoffs.
2. **Confirmation object required** — `schedule_confirm` only when a concrete candidate was presented for acceptance (confirm ask / date+time / offered slot). “Voy a revisar disponibilidad…” is not confirmable.
3. **Availability-pending state** — After preference capture without presented options, use `awaiting_availability`; soft acks stay non-terminal.
4. **Network objection** — Map contact/network phrases to `network_objection`; concise truthful reassurance; no lead/client/success promises.
5. **Interrupt + preserve** — Network objections during scheduling answer then preserve modality, day-part, preferred time; do not re-ask location/auth/day-part/time.
6. **Opposite case** — Concrete “¿Te funciona?” + `ok`/`si` may confirm per BR-084/085.
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-102 — Recruit AI Partial-State Location + After-Time Scheduling

**Implements:** State-only answers (`Florida` / `Texas` / …) while city+state is pending are retained as partial state with an ask-city follow-up; city then completes with the retained state. Natural after-5 phrases (`despues de la 5`, `a partir de las 5`, `after 5`, …) under `ask_time` resolve as PM availability constraints (BR-084), not generic clarification.  
**Domain:** Recruit AI / Qualification + Scheduling continuity  
**Depends on:** BR-081, BR-082, BR-084, BR-085, BR-094, BR-095, BR-101  
**Related:** BR-087 (scheduling memory), BR-100 (auth), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/schedulingConstraints.js`, `interpreter.js`, `decisionEngine.js`, `contextTurnUpdate.js`, `responseRenderer.js`, `locationFacts.js`  
**Tests:** `backend/test/recruitAiV2PartialStateAfterTimeBr102.test.js`, `backend/test/recruitAiV2PartialLocationFloridaNeedAttention.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/30_PARTIAL_STATE_AFTER_TIME.md`

### Rules

1. **State-only partial** — Valid U.S. state/DC while city is unresolved → `completeness=state_only`, retain state, ask only for city (“¿En qué ciudad de {State} vives?”). Last-ask evidence is not required. Do not discard the state, re-ask city+state, escalate, or go silent. Confirmed state does not regress.
2. **City completes retained state** — After state-only, a compatible city (e.g. `miami` after `florida`) confirms city+state per BR-094 completeness.
3. **City-only preserved** — Bare city without prior state still uses BR-094 proposal/confirmation (`¿Miami, Florida?`).
4. **New York** — Bare `New York` is state-only NY; do not invent New York City.
5. **After-time constraints** — Under pending time (esp. afternoon/evening), phrases like `despues de la 5` / `después de las 5` / `a partir de las 5` / `luego de las 5` / `after 5` / `anytime after 5` → `availability_constraint` with PM earliest time (`17:00` for 5). No AM interpretation, no generic fallback, no invented date, no handoff.
6. **Reuse BR-084/085** — Constraints remain independent of concrete appointment candidates; ask the next useful time question or review options after 5 — do not fabricate availability.
7. **Bare affirmation hygiene** — Exact bare `si`/`yes`/… only; prefixed status phrases stay on auth/status paths.
8. **Acknowledgement stacking** — Do not stack multiple equivalent acknowledgement phrases in one customer reply (e.g. `Perfecto, gracias. Excelente.`). Keep one natural acknowledgement; preserve phrases with genuinely different functions.
9. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-101 — Recruit AI Day-Part Context Priority for “mañana” and Hour Inheritance

**Implements:** When `ask_day_part` is pending, `mañana` / `en la mañana` / `por la mañana` resolve to day-part morning (not tomorrow); only pending date asks treat `mañana` as tomorrow; confirmed day-part inherits AM/PM for bare numeric times without clarification  
**Domain:** Recruit AI / Conversation / Scheduling continuity  
**Depends on:** BR-081, BR-084, BR-085, BR-088, BR-095  
**Related:** BR-087 (scheduling memory), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/interpreter.js` (`parseDayPart`, `shouldTreatAsDateOnlyProposal`), `schedulingConstraints.js` (`resolveCandidateTime`), decisionEngine  
**Tests:** `backend/test/recruitAiV2DayPartMananaContextBr101.test.js`, `backend/test/recruitAiV2PlaygroundFeedbackFix7.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/29_DAY_PART_MANANA_CONTEXT_PRIORITY.md`

### Rules

1. **Context priority** — Pending `ask_day_part` outranks the generic date meaning of Spanish `mañana`.
2. **Morning day-part forms** — At minimum: `mañana`, `manana`, `en la mañana`, `en la manana`, `por la mañana` → `preferredDayPart = morning`.
3. **Date meaning reserved** — `mañana` → tomorrow only when a date question is pending (or explicit date framing), not while morning/afternoon is being asked.
4. **Hour inheritance** — With confirmed morning day-part, bare `10` / `10:00` → 10:00 AM. With afternoon, bare `3` → 15:00. Do not ask AM/PM when day-part already resolves it.
5. **Continue flow** — Day-part answers still advance to the time question (BR-088); no Saturday false-positive from morning phrases.
6. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-100 — Recruit AI Affirmative-Prefix Work-Authorization Status

**Implements:** When `ask_authorization` is pending, affirmative discourse markers (`sí`/`si`/`claro`/`yes`/…) before an already-recognized BR-096 status (e.g. `si soy ciudadano`) still satisfy work authorization and must not fall through to schedule confirm / human-assist handoff  
**Domain:** Recruit AI / Qualification  
**Depends on:** BR-081, BR-083, BR-095, BR-096  
**Related:** BR-090 (Puerto Rico origin), BR-099 (unrelated sales objection)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/qualificationFacts.js` (`parseWorkAuthorizationAnswer`)  
**Tests:** `backend/test/recruitAiV2AffirmativePrefixWorkAuthBr100.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/28_AFFIRMATIVE_PREFIX_WORK_AUTH.md`

### Rules

1. **Pending-auth only** — Affirmative-prefix status applies when `lastQuestionAsked` is `ask_authorization`.
2. **Prefix + BR-096 status** — Accept optional `sí`/`si`/`claro`/`correcto`/`por supuesto`/`yes`/`yeah`/`yep` (with optional comma) before residente/ciudadano/resident/citizen forms (and birthplace affirmatives).
3. **Continue recruiting flow** — Satisfied auth continues to the next canonical step (e.g. day-part). Never route to companion handoff, terminal confirmation, or human-assist copy solely because of the prefix.
4. **Negatives win** — Mixed negatives (`sí, pero no tengo permiso`, `yes, but I'm not authorized yet`) remain NOT authorized.
5. **Visa ambiguity** — `si tengo visa` / `tengo visa` still do not auto-authorize.
6. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-099 — Recruit AI Sales Skill / Sales Aversion Objection Recognition

**Implements:** Recognize EN/ES sales skill, sales-experience, and sales-aversion objections before correction/location/name/fragment handling so phrases like `no se vender` never invent city `Vender`  
**Domain:** Recruit AI / Conversation / Objection handling  
**Depends on:** BR-081, BR-088, BR-095, BR-098  
**Related:** BR-097 (overview FAQ), BR-090 (fixed-employment preference distinct), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/salesObjection.js`, interpreter, decisionEngine, responseRenderer, `locationFacts.js`, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix11.test.js`  
**Simulator:** `sales-objection-not-location`  
**Docs:** `docs/03-engineering/recruit-ai-v2/27_SALES_OBJECTION_RECOGNITION.md`

### Rules

1. **Intent** — Map clear sales objections to `sales_objection` with kind `skill` | `experience` | `aversion`.
2. **Priority** — Evaluate before correction interpretation, location parsing, name extraction, fragments, and scheduling reinterpretation.
3. **Skill/experience reply** — Reassure that sales skill/experience is not required to start; training teaches the process step by step; resume pending question.
4. **Aversion reply** — Acknowledge naturally; never claim “esto no es ventas” / “this is not sales”; no pressure, income guarantees, or licensing dumps.
5. **No false cities** — `no se vender` must not create city `Vender` or ask for its state.
6. **Normalization** — Accent/case/punctuation variants classify equivalently (BR-095); preserve raw inbound text.
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-098 — Recruit AI FAQ Routing Priority and Experience Question Recognition

**Implements:** Recognize experience FAQ intents; make Spanish/English insurance FAQ detection survive BR-095 comparisonText routing; keep clear FAQ/business intents ahead of permissive location parsing so phrases like `¿Necesito experiencia?` never invent cities  
**Domain:** Recruit AI / Conversation / FAQ routing  
**Depends on:** BR-081, BR-083, BR-088, BR-095, BR-097  
**Related:** BR-089 (license FAQ), BR-094 (legitimate location still works), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/interpreter.js`, decisionEngine, responseRenderer, `locationFacts.js`, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix10.test.js`  
**Simulator:** `faq-priority-experience-insurance`  
**Docs:** `docs/03-engineering/recruit-ai-v2/26_FAQ_ROUTING_PRIORITY_EXPERIENCE_INSURANCE.md`

### Rules

1. **Experience intent** — EN/ES experience asks/statements (`¿Necesito experiencia?`, `Do I need experience?`, `No tengo experiencia`, etc.) map to `experience_question`.
2. **Concise experience answer** — Prior experience is not required; training is provided to learn the process. Resume the exact pending workflow question. Do not stack licensing/compensation caveats.
3. **Insurance routing** — Spanish/English insurance FAQ shapes (`¿Es de seguros?`, `es de seguros`, `Is this insurance?`, etc.) must resolve to `insurance_question` on comparisonText and raw text. Detector truth must survive final routing.
4. **FAQ before location** — Clear FAQ/business intents (job, compensation, insurance, experience, license, meeting access, opt-out/withdraw/cancel) outrank permissive location/name/fragment parsing.
5. **No false cities** — Experience/insurance FAQ messages must not create location facts (e.g. city `Necesito Experiencia`).
6. **Workflow continuity** — After FAQ answers, resume the pending question (e.g. `ask_day_part`); no scheduling collision, generic clarification, or state reset.
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-097 — Recruit AI Concise First-Level Job FAQ (Progressive Disclosure)

**Implements:** First-level job/overview questions (`de que se trata`, `qué hacen`, `what is this about`, etc.) receive a short financial-services answer and resume the pending workflow question; do not volunteer salary/experience/license/employment caveats until specifically asked  
**Domain:** Recruit AI / Conversation / FAQ  
**Depends on:** BR-081, BR-083, BR-088  
**Related:** BR-089 (license FAQ), BR-090 (job FAQ interrupt), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/conversationContinuity.js`, interpreter, decisionEngine, responseRenderer, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix9.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/25_CONCISE_JOB_FAQ_OVERVIEW.md`

### Rules

1. **First-level overview** — Recognize EN/ES overview asks (`de que se trata`, `de qué es`, `qué hacen`, `what is this about`, close variants) as `job_opportunity_question` with detail level `overview`.
2. **Short canonical answer** — Overview replies use only: opportunity in financial services + details explained in the interview. Then resume the exact pending question (e.g. `ask_day_part`).
3. **Progressive disclosure** — Do not volunteer salaried/hourly disclaimers, no-experience copy, licensing details, compensation caveats, or business-opportunity framing unless the prospect asks those specifics.
4. **Specific FAQs unchanged** — Compensation, experience, insurance, licensing, and “is this a job?” / employment-structure asks keep their dedicated BR-083/BR-088/BR-089 copy.
5. **BR-088 priority preserved** — Overview/job FAQ still outranks scheduling parsing; no time-unavailable collision; no bare Continuemos dead-end.
6. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-096 — Recruit AI Pending Work-Authorization Status Shorthand

**Implements:** Recognize short legal-status answers (`residente`, `ciudadano`/`ciudadana`, and close variants) as affirmative work authorization when Atlas is specifically asking for work authorization  
**Domain:** Recruit AI / Qualification  
**Depends on:** BR-081, BR-083, BR-095  
**Related:** BR-090 (Puerto Rico origin), BR-089 (license ≠ work auth), BR-100 (affirmative prefixes)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/qualificationFacts.js` (`parseWorkAuthorizationAnswer`)  
**Tests:** `backend/test/recruitAiV2WorkAuthStatusShorthandBr096.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/24_WORK_AUTH_STATUS_SHORTHAND.md`

### Rules

1. **Pending-auth only** — Shorthand applies when `lastQuestionAsked` is `ask_authorization` (or equivalent pending work-auth ask).
2. **Accepted Spanish status forms** — At minimum: `residente`, `residente permanente`, `ciudadano`, `ciudadana`, `ciudadano americano`, `ciudadana americana` (case/accent/punctuation tolerant via BR-095).
3. **Accepted birthplace affirmatives (pending-auth)** — At minimum: `nací aquí` / `naci aqui`, `yo nací aquí`, `nací en Estados Unidos` / `nací en USA`, `born here`, `I was born here`, `I was born in the US`. These satisfy work authorization and must not be reinterpreted as a location answer or trigger an immigration-document re-ask.
4. **No “soy …” requirement** — Do not require `soy residente` / `soy ciudadano` when the pending question already makes meaning clear.
5. **Affirmative prefixes** — Optional discourse markers before these forms are covered by BR-100 (`si soy ciudadano`).
6. **License boundary** — License-only wording still does not satisfy work authorization (BR-083 / BR-089).
7. **No out-of-context inventing** — Bare status / birthplace tokens outside a pending work-auth question must not invent authorization.
8. **Boundaries** — Does not enable execution, change shadow/capture, cut over live CE, send WhatsApp, or mutate appointments/Calendar/BR-080.

---

## BR-095 — Recruit AI Deterministic Inbound Input Normalization

**Implements:** Shared interpretation-only normalization layer so WhatsApp case/accent/punctuation/whitespace variants classify equivalently without mutating original transcript text  
**Domain:** Recruit AI / Conversation Interpretation  
**Depends on:** BR-081  
**Related:** BR-094 (city/state uses this layer), BR-088 (context-sensitive `mañana`/`manana`), BR-086, BR-091  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/inputNormalization.js`, `recruitAiV2/interpreter.js`  
**Tests:** `backend/test/recruitAiV2InputNormalization.test.js`, `backend/test/recruitAiV2PlaygroundFeedbackFix8.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/23_INPUT_NORMALIZATION.md`

### Rules

1. **Raw preserved** — Keep original inbound text for audit/transcript; matching uses a separate comparison form.
2. **Tolerances** — Case-insensitive, accent/diacritic-insensitive, punctuation-tolerant (where punctuation does not change meaning), whitespace-tolerant.
3. **No semantic erasure** — Do not globally force `si`→affirmative or erase BR-088 day-part vs tomorrow ambiguity for `manana`/`mañana`.
4. **No fuzzy inventing** — Deterministic only; no aggressive autocorrect / edit-distance intent invention.
5. **Reuse** — Prefer this utility before domain detectors (location, licensing, opt-out, scheduling, FAQ) instead of one-off regex patches.
6. **Boundaries** — Does not enable execution, change shadow/capture, cut over live CE, send WhatsApp, or mutate appointments/Calendar/BR-080.

---

## BR-094 — Recruit AI U.S. City-State Abbreviation Normalization

**Implements:** Recognize informal U.S. city + state abbreviation / name replies (e.g. `miami fl`) as confirmed location facts when Atlas is collecting city/state; advance qualification without generic fragment clarification  
**Domain:** Recruit AI / Qualification  
**Depends on:** BR-081, BR-082, BR-095  
**Related:** BR-083 (qualification fact separation), BR-090 (Puerto Rico — not a USPS state pair), BR-091 (withdrawal)  
**Status:** Implemented in Recruit AI v2 engines (execution remains OFF until separately authorized)  
**Engine target:** `recruitAiV2/locationFacts.js`, `recruitAiV2/interpreter.js`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix8.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/22_CITY_STATE_ABBREVIATION_NORMALIZATION.md`  
**Scenario:** `city-state-abbreviation-normalization`

### Rules

1. **USPS normalization** — Recognize common forms `City ST`, `City, ST`, `City StateName` (any casing) using a canonical U.S. postal abbreviation / state-name map. Do not hardcode Florida-only matching.
2. **Confirmed pair** — When both city and recognized state are present, set city/state certainty to **confirmed** and do not re-ask location.
3. **Pending-question priority** — While waiting for city/state, a complete city+state phrase must win over `ambiguous_fragment`, name, scheduling, and generic FAQ clarification.
4. **BR-082 partial safety** — City-only (`Miami`) remains partial with optional proposed state. State-only (`FL`) remains incomplete without inventing a city. Regional phrases (`South Florida`) are not `city = South`. Hedged answers (`Miami maybe`) must not over-confirm.
5. **Correction** — `actually orlando fl` (and equivalents) corrects location; coverage/modality must be re-evaluated; do not keep stale local-office modality.
6. **Boundaries** — Does not enable Recruit AI v2 execution, change shadow/capture env, cut over live CE, send WhatsApp, or mutate appointments/Calendar/BR-080.

---

## BR-093 — WhatsApp Interview Confirmation Meeting Details Semantics

**Implements:** Make `interview_confirmation` / `interview_details` BODY `{{4}}` (meeting details) distinct from `{{3}}` (meeting type); Zoom uses Meta-aligned “link provided separately” copy; in-person uses BR-077 address  
**Domain:** Communications / WhatsApp Templates  
**Depends on:** BR-075, BR-077, BR-078, BR-092  
**Related:** Meta WABA exact structure audit (`atlas_interview_confirmation_en` / `_es`)  
**Status:** Implemented in code — templates remain inactive until explicit `WHATSAPP_APPROVED_TEMPLATES_JSON` authorization  
**Engine target:** `whatsappTemplateVariableBuilder.js` (`resolveMeetingLocationLabel` / `ZOOM_MEETING_DETAILS_COPY` / confirmation builders)  
**Tests:** `backend/test/whatsappConfirmationMeetingDetailsBr093.test.js`  
**Docs:** `docs/03-engineering/WHATSAPP_CONFIRMATION_MEETING_DETAILS.md`

### Rules

1. **Slot separation** — Confirmation/details BODY: `{{1}}` name, `{{2}}` when, `{{3}}` meeting type, `{{4}}` meeting details. Never duplicate meeting type into `{{4}}`.
2. **Zoom confirmation** — `{{3}}` = `Zoom`. `{{4}}` EN = `Your Zoom link will be provided separately`; ES = `Tu enlace de Zoom será enviado por separado`. Never put the Zoom URL into confirmation/details.
3. **Zoom invitation remains separate** — Actionable join uses `atlas_zoom_invitation_*` + BR-092 meeting-id button parameter.
4. **In-person / public location** — `{{4}}` = canonical meeting address (BR-077 completeness). Incomplete address fails closed at template resolve.
5. **Language** — Use prospect preferred language for Zoom details copy. No silent EN↔ES template locale fallback.
6. **Boundaries** — Does not activate templates, change Railway variables, send WhatsApp, enable Recruit AI v2 execution, or mutate appointments/Calendar/BR-080.

---

## BR-092 — WhatsApp Zoom Template Dynamic URL Parameter Normalization

**Implements:** Normalize BR-076 canonical Zoom URLs into the Meta dynamic URL button suffix for `atlas_zoom_invitation_en` / `atlas_zoom_invitation_es`  
**Domain:** Communications / WhatsApp Templates  
**Depends on:** BR-075, BR-076, BR-078  
**Related:** Meta WABA audit (approved URL pattern `https://zoom.us/j/{{1}}`), BR-093 (confirmation meeting details)  
**Status:** Implemented in code — templates remain inactive until explicit `WHATSAPP_APPROVED_TEMPLATES_JSON` authorization  
**Engine target:** `whatsappTemplateVariableBuilder.js` (`normalizeZoomDynamicUrlButtonParameter` / `buildZoomInvitationVariables`), `whatsappApprovedTemplateRegistry.js`, `whatsappOutboundPipeline.js`  
**Tests:** `backend/test/whatsappZoomTemplateButtonParamBr092.test.js`  
**Docs:** `docs/03-engineering/WHATSAPP_ZOOM_TEMPLATE_BUTTON_PARAM.md`

### Rules

1. **Meta button contract** — Approved Zoom invitation templates use dynamic URL button base `https://zoom.us/j/{{1}}`. The button parameter is only the suffix after that base (typically the meeting id, plus query when present on the canonical join path).
2. **Canonical storage unchanged** — BR-076 persisted `virtual_meeting_url` values remain full approved HTTPS Zoom URLs. Adaptation happens only at the WhatsApp template variable-builder / send boundary.
3. **Normalization** — `https://zoom.us/j/123456789`, `j/123456789`, `/j/123456789`, and already-normalized `123456789` all yield button parameter `123456789`. Never emit `j/{id}` into Meta’s base (no `…/j/j/{id}`).
4. **Fail closed** — Empty, malformed, non-Zoom, or unsupported-host values must not authorize or send a Zoom invitation template button. Do not silently ship a broken URL.
5. **Body vs button** — BODY `{{1}}` remains prospect/name (`prospect_first_name`). BUTTON `{{1}}` is the separate Zoom dynamic URL suffix. Namespaces stay distinct.
6. **EN/ES** — `atlas_zoom_invitation_en` and `atlas_zoom_invitation_es` use the same suffix normalization. No silent language fallback.
7. **Boundaries** — Does not activate templates, change Railway variables, send WhatsApp, enable Recruit AI v2 execution, write appointments/Calendar, or mutate BR-080.

---

## BR-091 — Recruit AI Direct Lack-of-Interest Withdrawal Recognition

**Implements:** Recognize clear direct lack-of-interest phrases (EN/ES) as `withdraw_interest` without requiring modifiers like “ya”; keep withdraw distinct from opt-out, fixed-employment preference, current_not_fit, cancel, and compensation FAQ; terminal respectful closure  
**Domain:** Recruit AI / Conversation / Withdrawal  
**Depends on:** BR-085, BR-086, BR-087, BR-090, BR-081, BR-049  
**Related:** BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/interpreter.js` (`looksLikeDirectLackOfInterest` / `classifyCancellationIntent`), decisionEngine, responseRenderer  
**Tests:** `backend/test/recruitAiV2DirectNoInterestWithdrawal.test.js`  
**Simulator:** `direct-no-interest-withdrawal`  
**Docs:** `docs/03-engineering/recruit-ai-v2/21_DIRECT_NO_INTEREST_WITHDRAWAL.md`

### Rules

1. **Spanish coverage** — Recognize at least: `No me interesa`, `No estoy interesado/a`, `No me interesa esto`, `No estoy interesado/a en esto`, `No gracias, no me interesa`, `Gracias, pero no me interesa`, `Esto no me interesa`, `No quiero seguir`, `No quiero continuar`.
2. **English coverage** — Recognize at least: `I'm not interested`, `I am not interested`, `Not interested`, `I'm not interested in this`, `No thanks, I'm not interested`, `I don't want to continue`, `I don't want to proceed`.
3. **State separation** — Direct lack-of-interest ≠ fixed-employment preference ≠ current_not_fit ≠ appointment cancel ≠ communication opt-out ≠ compensation FAQ.
4. **Priority** — Clear lack-of-interest outranks scheduling, FAQ, location correction, name extraction, and generic clarification. Never map to `unknown` / `clarify_once` / scheduling / compensation.
5. **Behavior** — Mark withdrawn, stop qualification/scheduling, no next recruiting question, no handoff, no appointment proposal, no opt-out unless explicitly requested. Side-effect proposals remain denied while execution is OFF.
6. **Renderer** — Short respectful closure (e.g. “Entiendo. Gracias por avisarnos. Te deseo mucho éxito.”). No continued selling, why-ask, companion-contact, or opt-out implication.
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no production opt-out mutation, no ads/templates/Meta Review changes.

---

## BR-090 — Recruit AI Puerto Rico Work Authorization and Fixed-Employment Preference

**Implements:** Normalize explicit Puerto Rico origin/citizenship statements as sufficient work-authorization context; keep job FAQ interrupt behavior; recognize fixed-employment preference as distinct from compensation FAQ / withdraw / opt-out; acknowledge without pressure; polite current-not-fit closure on reinforcement  
**Domain:** Recruit AI / Conversation / Qualification / Fit  
**Depends on:** BR-083, BR-088, BR-086, BR-085, BR-081, BR-049  
**Related:** BR-089 (license FAQ), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/employmentFit.js`, qualificationFacts, interpreter, decisionEngine, responseRenderer, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2PuertoRicoFixedEmployment.test.js`  
**Simulator:** `puerto-rico-fixed-employment-real-world`  
**Docs:** `docs/03-engineering/recruit-ai-v2/20_PUERTO_RICO_FIXED_EMPLOYMENT_PREFERENCE.md`

### Rules

1. **Puerto Rico work-auth** — Explicit origin/citizenship phrases (`Soy de PR`, `Soy de Puerto Rico`, `Nací en Puerto Rico`, `Soy puertorriqueño/a`, EN equivalents) satisfy work authorization for this recruiting flow. Do not re-ask work permit/documentation. Do not treat Puerto Rico as a foreign country. Conservative: only these explicit statements — not generic Caribbean/Latino/geographic phrases.
2. **Job FAQ interrupt** — After auth resolves, “De q trata el trabajo?” (and BR-088 job/opportunity questions) answer directly and outrank pending workflow questions.
3. **Fixed-employment preference** — Seeking fixed/salaried/hourly/traditional employment (`Estoy buscando empleo fijo`, `Quiero un sueldo fijo`, `I'm looking for a salaried job`, etc.) is `fixed_employment_preference`. Not opt-out, withdraw, cancel, compensation FAQ, or handoff.
4. **First response** — Acknowledge accurately: opportunity is not a guaranteed salaried/hourly position; may note some people evaluate it alongside current employment. No argument, no earnings guarantees, no forced scheduling/day-part ask.
5. **Reinforced non-fit** — After opportunity/preference explained, “Por el momento mi enfoque es encontrar trabajo” (or repeated fixed-employment preference) → `current_fit = not_now`, stop recruiting pressure, polite terminal closure. No morning/afternoon, licensing push, handoff, or communication opt-out unless separately requested.
6. **State separation** — Keep distinct: fixed-employment preference; withdraw (“No me interesa”); cancel; opt-out (“No me escribas más”); compensation question (“Esto paga salario?”).
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no production opt-out mutation, no ads/templates/Meta Review changes.

---

## BR-089 — Recruit AI License Requirement Intent Precision

**Implements:** Distinguish license-requirement FAQ questions from license status statements and ambiguous generic license fragments; preserve pending scheduling/day-part when answering requirement FAQs  
**Domain:** Recruit AI / Conversation / Qualification FAQ  
**Depends on:** BR-083, BR-088, BR-081, BR-049  
**Related:** BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/qualificationFacts.js`, interpreter, decisionEngine  
**Tests:** `backend/test/recruitAiV2LicenseRequirementIntent.test.js`  
**Simulator:** `license-requirement-preserves-day-part`  
**Docs:** `docs/03-engineering/recruit-ai-v2/19_LICENSE_REQUIREMENT_INTENT_PRECISION.md`

### Rules

1. **Requirement questions** — EN/ES phrases asking whether a license is required/mandatory (`¿Tengo que tener licencia?`, `Do I need a license?`, etc.) are `license_requirement_question`. Never `ambiguous_license_statement`.
2. **Status statements** — Possession/absence (“Tengo licencia” / “No tengo licencia”) describe prospect status. Unclear type (“Tengo licencia”) → clarify professional vs driver’s license (BR-083). Clear absence → status `none` without type clarify when grammar is unambiguous.
3. **Ambiguity reserved** — `ambiguous_license_statement` is for fragments like “licencia”, “lo de la licencia”, “the license thing” — not for clear requirement grammar.
4. **Priority** — Requirement FAQ outranks scheduling, date/day-part parsing, and generic ambiguity. After answering, resume the pending day-part question.
5. **Florida path knowledge (do not volunteer)** — Canonical Team Vision background: primary path **2-14**; if not successfully completed/passed, Team Vision may offer **2-15**. Ordinary requirement FAQ stays simple and must not mention 2-14/2-15. Surface path detail only for explicit asks (`license_path_detail_question`). Source: `backend/knowledge/teamVisionLicensePath.json`.
6. **Renderer** — Use canonical licensing FAQ copy; no exam-pass guarantees; no driver’s-license relevance claims; no inventing other license series.
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-088 — Recruit AI Intent Priority and Contextual Conversation Continuity

**Implements:** Job/employment/opportunity FAQ intent; FAQ/business intents outrank scheduling parsing; context-sensitive Spanish “mañana” (morning vs tomorrow); day-part answers advance to a time question; ban bare “Continuemos” dead-ends; meta-conversation clarification of the pending workflow question  
**Domain:** Recruit AI / Conversation / Intent routing  
**Depends on:** BR-081, BR-083, BR-084, BR-087, BR-049  
**Related:** BR-086 (opt-out still early), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/conversationContinuity.js`, interpreter, decisionEngine, responseRenderer, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix7.test.js`  
**Simulator:** `tampa-faq-day-part-continuity`  
**Docs:** `docs/03-engineering/recruit-ai-v2/18_PLAYGROUND_FEEDBACK_INTENT_PRIORITY.md`

### Rules

1. **Job/opportunity intent** — Recognize EN/ES job/employment/opportunity questions (with or without punctuation) as `job_opportunity_question`. Never collapse them into scheduling/time/unavailable.
2. **Canonical answer** — For employment-structure asks (“is this a job?”), explain financial-services opportunity (not guaranteed salaried/hourly employment); no income guarantees; then resume the pending workflow question. First-level overview asks use short progressive-disclosure copy per BR-097.
3. **Intent priority** — Clear FAQ/business intents (job, insurance, license, compensation), opt-out/cancel/withdraw, corrections, and meeting logistics outrank time/day-part/date/availability/counteroffer parsing. Scheduling context is evidence, not permission to reinterpret unrelated language.
4. **“mañana” disambiguation** — Pending morning/afternoon ask → day-part morning (including `en la mañana`). Pending “what day” ask → date tomorrow. See BR-101 for context-priority hardening and day-part→meridiem inheritance.
5. **Day-part advances** — After morning/afternoon is captured, immediately ask for a clock time. Never reply only “Continuemos.”
6. **No dead-end continuation** — Every non-terminal reply must answer, ask the next relevant question, confirm state/action, or explain a next step.
7. **Meta-conversation** — “continuemos con qué?” / “what do you still need?” explains the pending missing fact and re-asks it (not generic clarify).
8. **Escalate remap safety** — Non-human uncertain escalate must not render scheduling “time unavailable” copy.
9. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-087 — Recruit AI Scheduling Memory and Meeting Logistics Continuity

**Implements:** Preserve independent scheduling dimensions across meeting-modality changes; ask only for missing information; Zoom-link / meeting-access logistics without fabricating URLs (BR-076); repetition/frustration acknowledgement without recapture; clean withdraw closure without companion-reopen copy  
**Domain:** Recruit AI / Conversation / Scheduling dialogue  
**Depends on:** BR-081, BR-083, BR-084, BR-085, BR-076, BR-049  
**Related:** BR-086 (opt-out distinct from withdraw), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/schedulingMemory.js`, interpreter, decisionEngine, responseRenderer, sideEffectAuthorizer  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix6.test.js`  
**Simulator:** `long-scheduling-memory-modality-zoom-link`  
**Docs:** `docs/03-engineering/recruit-ai-v2/17_PLAYGROUND_FEEDBACK_SCHEDULING_MEMORY.md`

### Rules

1. **Independent dimensions** — Treat location, coverage, meeting type, availability constraints, proposed date, proposed time, confirmed date/time, and scheduling stage as separate. Changing meeting type must not erase availability / proposed date / proposed time unless the modality change invalidates the slot.
2. **Post-modality resume** — After in-person travel confirm or Zoom reselection, confirm the existing candidate slot (or ask only for the next missing fact). Never reset to morning/afternoon when after-5 / date / time are already known and still applicable.
3. **Zoom clears office** — Explicit Zoom restores virtual modality and clears office location; retain date/time candidates.
4. **Ask only for missing information** — Before rendering a scheduling question, check durable context. Do not re-ask day-part, time, date, or modality when known with sufficient certainty.
5. **Meeting-access / Zoom-link intent** — Recognize EN/ES link/join requests. Never fabricate a URL. Unconfirmed appointment: explain link is shared after confirmation and resume scheduling. Confirmed + canonical URL: propose BR-076 approved URL (side effect denied). Confirmed but unavailable: pending/unavailable copy.
6. **Repetition signals** — “ya te dije” / “I already told you” → inspect context, acknowledge briefly, reuse known facts; do not escalate solely for mild frustration.
7. **Clean withdrawal** — Explicit withdraw/cancel-of-process gets a concise terminal acknowledgement without companion-reopen or continued-outreach copy. Withdraw ≠ STOP unless stated (BR-086).
8. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-086 — Recruit AI Natural-Language Communication Opt-Out Resolution

**Implements:** Deterministic natural-language stop-contact / opt-out detection (EN/ES) with priority over location correction, name extraction, FAQ, and scheduling; keep opt-out distinct from appointment cancel and withdraw interest; combined cancel+opt-out may propose both denied side effects  
**Domain:** Recruit AI / Conversation / Communications consent  
**Depends on:** BR-081, BR-085, BR-049  
**Related:** BR-080 (read-only; no mutation from v2), Meta Review isolation  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/interpreter.js` (`looksLikeCommunicationOptOut` / `classifyCancellationIntent`), decisionEngine, sideEffectAuthorizer, responseRenderer  
**Tests:** `backend/test/recruitAiV2NaturalLanguageOptOut.test.js`  
**Simulator:** `natural-language-opt-out`  
**Docs:** `docs/03-engineering/recruit-ai-v2/16_NATURAL_LANGUAGE_OPT_OUT.md`

### Rules

1. **Opt-out phrases** — Recognize common EN/ES stop-contact language (`no more messages`, `stop texting me`, `no me escribas más`, `unsubscribe`, `STOP`, etc.) as `opt_out_request`.
2. **Priority** — Opt-out runs before location correction, name extraction, generic clarification, FAQ routing, and scheduling parsing. Never map clear stop-contact to `correct_location` / `provide_name` / `clarify_once`.
3. **Taxonomy** — Keep `cancel_request`, `withdraw_interest`, and `opt_out_request` distinct. Combined cancel+opt-out may set both denied proposals (`cancel_appointment` + `communication_opt_out`) without collapsing STOP into appointment cancel.
4. **Renderer** — Acknowledge briefly; do not continue qualification, ask another question, resume scheduling, or offer alternatives.
5. **Execution** — Propose `communication_opt_out` only; SideEffectAuthorizer denies. No production opt-out mutation from v2 until cutover.
6. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-085 — Recruit AI Date Resolution, Cancellation, and Meeting-Mode Confirmation

**Implements:** Weekday/date-only proposals (never midnight); preserve prior active time with date changes; relative date exclusions; organization-local calendar resolution (BR-079); cancel vs withdraw vs STOP; OUTSIDE/remote explicit in-person requires Doral travel confirmation before office modality  
**Domain:** Recruit AI / Conversation / Scheduling dialogue  
**Depends on:** BR-081, BR-082, BR-083, BR-084, BR-079, BR-018–021  
**Related:** BR-049 (Conversation Engine), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/dateResolution.js`, interpreter, decisionEngine, contextTurnUpdate, responseRenderer, sideEffectAuthorizer, `scheduleLanguageParser.js`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix5.test.js`  
**Simulator:** `orlando-scheduling-date-change-cancellation`  
**Docs:** `docs/03-engineering/recruit-ai-v2/15_PLAYGROUND_FEEDBACK_DATE_CANCEL_MEETING_MODE.md`

### Rules

1. **Date-only proposals** — Weekday / relative-day phrases without a clock time set `dateCandidate` only. Never invent `00:00` / “12:00 AM” unless the prospect explicitly says midnight / 12 AM / medianoche.
2. **Prior time preservation** — When an active candidate time exists (e.g. 7 PM) and the prospect proposes a new day (“el lunes”), keep the time and confirm “¿El lunes a las 7:00 PM te funciona?”
3. **Date replacement** — One active `proposedDate`; Monday → Tuesday replaces the date and keeps coherent time; prior dates are history only.
4. **Relative exclusions** — “No puedo hoy ni mañana, ¿puede ser el lunes?” captures unavailable today/tomorrow **and** Monday as the candidate.
5. **Org-local resolution** — Resolve today/tomorrow/weekday/next week in the organization timezone (BR-079 / Team Vision America/New_York). Do not use Railway UTC calendar boundaries.
6. **Cancellation taxonomy** — Distinguish `cancel_request` (appointment cancel), `withdraw_interest` (change of mind / stop recruiting), and `opt_out_request` (STOP). Clear cancel/withdraw never falls into generic clarification.
7. **Denied side-effect proposals** — V2 may propose `cancel_appointment` / `withdraw_prospect` / `communication_opt_out` for audit; authorizer always denies execution.
8. **OUTSIDE → in-person** — Explicit “prefiero en persona” from OUTSIDE/Zoom requests Doral travel confirmation first (`meetingTypeRequested=in_person`, `meetingTypeConfirmed=false`). Only after confirmation set confirmed in-person. Explicit Zoom clears office immediately.
9. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-084 — Recruit AI Scheduling Constraint and Direct-Time Resolution

**Implements:** Availability constraints vs appointment candidates; direct clock-time proposals that override pending day-part; AM/PM clarification without handoff; single active candidate with replacement history; unavailable-slot alternatives without human escalation  
**Domain:** Recruit AI / Conversation / Scheduling dialogue  
**Depends on:** BR-081, BR-082, BR-083, BR-018–021  
**Related:** BR-049 (Conversation Engine), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/schedulingConstraints.js`, interpreter, decisionEngine, contextTurnUpdate, responseRenderer, shadowDivergence  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix4.test.js`  
**Simulator:** `work-until-5-direct-time-negotiation`  
**Docs:** `docs/03-engineering/recruit-ai-v2/14_PLAYGROUND_FEEDBACK_SCHEDULING_CONSTRAINTS.md`

### Rules

1. **Availability constraints** — Phrases like “Trabajo hasta las 5” / “After 5 works” / “evenings only” are constraints (`earliestTime` / dayPart), not appointment proposals. Do not overwrite `proposedTime` from a constraint alone.
2. **Direct time overrides day-part** — Bare times (`6?`, `6:30?`, `Mejor 7`) during pending day-part are scheduling counteroffers. Day-part is context, not a hard gate.
3. **Contextual AM/PM** — After-5 / evening context disambiguates `6` → 18:00. Without context, ask morning vs afternoon for genuinely ambiguous hours; do not escalate.
4. **Candidate replacement** — Latest valid candidate is active; prior values are history only. Replacing times must not escalate.
5. **Unavailable slots** — Offer alternatives and remain in scheduling. Ordinary negotiation never emits companion/handoff copy unless `requiresHuman=true`.
6. **Independent scheduling facts** — Preserve dayPart, availabilityConstraint, proposedTime/date, meeting type, and confirmation/reschedule state separately.
7. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

---

## BR-083 — Recruit AI Qualification Fact Separation and Specific FAQ Resolution

**Implements:** Independent work-authorization vs financial-license facts; ambiguous “tengo licencia” clarification (driver vs professional); specific insurance / license-requirement / compensation FAQ intents with approved Team Vision copy; location-aware meeting modality (OUTSIDE → Zoom before day-part); mid-flow direct questions answered before resuming pending qualification  
**Domain:** Recruit AI / Conversation / Qualification dialogue  
**Depends on:** BR-081, BR-082, BR-018–021, BR-019/020 (coverage / meeting mode)  
**Related:** BR-049 (Conversation Engine), BR-080 (read-only; no mutation from v2)  
**Status:** Implemented in code (flags unchanged: context capture / shadow rates not modified; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/*` (`qualificationFacts.js`, interpreter, decisionEngine, contextTurnUpdate, responseRenderer), `teamVisionWorkflowCopy.js`, `backend/knowledge/faq.json`  
**Tests:** `backend/test/recruitAiV2PlaygroundFeedbackFix3.test.js`  
**Simulator:** `license-confusion-orlando-faq-flow`  
**Docs:** `docs/03-engineering/recruit-ai-v2/13_PLAYGROUND_FEEDBACK_LICENSE_FAQ_MEETING_MODE.md`

### Rules

1. **Fact separation** — `workAuthorization*` and `financialLicense*` are independent. Never infer work authorization from a license statement, or a financial license from work authorization.
2. **Ambiguous license** — Generic “tengo licencia” / “I have a license” is ambiguous (often driver’s license). Clarify professional insurance/financial-services license vs driver’s license before storing `financialLicenseStatus=licensed`.
3. **Pending work-auth + license wording** — If Atlas asked for work authorization and the prospect answers with license-only wording, leave work authorization unresolved and clarify.
4. **Specific FAQ intents** — “Is this insurance?”, “Do I need a license?”, and compensation/pay/salary/commission questions have dedicated intents and approved copy. Do not answer only with generic “servicios financieros” value-prop text when a specific FAQ applies. Do not invent income figures or guarantee income.
5. **Location-aware meeting mode** — After work authorization is established, use canonical coverage evaluation: OUTSIDE/remote (e.g. Orlando) defaults to Zoom before day-part; LOCAL (e.g. Doral) may lead with office. Do not force Doral office copy on clearly out-of-area prospects.
6. **Meeting mode before time** — For out-of-area prospects, resolve meeting modality before morning/afternoon when business rules require it.
7. **Mid-flow questions** — Direct prospect questions are interpreted before blindly repeating the pending question: answer → preserve state → resume pending workflow.
8. **Boundaries** — No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review changes.

---

## BR-082 — Recruit AI Conversational Clarification and Partial-Fact Resolution

**Implements:** Greeting recognition; partial location (city-only) with proposed≠confirmed state; fact certainty metadata; adaptive conversation language; fragment/typo guardrails; last-question contextual interpretation; day-part clarification; recoverable-ambiguity before escalation; capture-only sanitized diagnostics; narrow live CE safety guards while CE remains authoritative  
**Domain:** Recruit AI / Conversation / Qualification dialogue  
**Depends on:** BR-081, BR-049, BR-039, BR-075, BR-078  
**Related:** BR-080 (attention on repeated unresolved ambiguity), BR-018–021 (workflow copy), first production feedback case (Hola / Miami / La or)  
**Status:** Implemented in code (flags unchanged: capture/shadow rates not modified by this rule; v2 execution remains off)  
**Engine target:** `backend/core/recruitAiV2/*` (interpreter, decisionEngine, languagePolicy, locationFacts, contextTurnUpdate, responseRenderer, advisoryTurnRunner); narrow live CE: `informationExtractor.js`, `qualificationCaptureState.js`, `semanticConversationEngine.js`, `teamVisionWorkflowCopy.js`  
**Tests:** `backend/test/recruitAiV2FirstProductionFeedback.test.js`  
**Fixture:** `backend/test/fixtures/recruitAiV2/first-production-feedback.json`  
**Docs:** `docs/03-engineering/recruit-ai-v2/09_FIRST_PRODUCTION_FEEDBACK.md`

### Rules

1. **Greeting intent** — Deterministic greetings (`hi`/`hello`/`hola`/…) are `greeting`. They must not trigger low-confidence human escalation; continue canonical qualification (ask city/state).
2. **Partial location** — City-only answers (e.g. `Miami`) are `provide_location` with `completeness=partial`. Do **not** invent a confirmed state. A geographically likely state may be **proposed** for confirmation only.
3. **Fact certainty** — Distinguish `confirmed` / `proposed` / `partial` / `unknown`. Inferred location is never confirmed prospect data until confirmation or an approved deterministic complete parse (`Miami, FL` / `Florida` after city).
4. **Language adaptation** — Preferred language is sticky but not immutable when the prior value was only default/inferred. Clear active-conversation Spanish evidence (e.g. greeting `Hola`) may adopt Spanish. Explicit preferences stay sticky. No bilingual replies. Do not flip on a single ambiguous token.
5. **Fragments are not names** — Short ambiguous scraps (`La or`, `afte`, `maña`) must not classify as `provide_name`. Prefer `ambiguous_fragment` / `incomplete_day_part` constrained by last question asked.
6. **Last-question context** — Ambiguous replies are interpreted relative to `lastQuestionAsked` / last outbound (e.g. day-part question → incomplete day-part, not name).
7. **Day-part clarification** — Recognize morning/afternoon (EN/ES). Incomplete replies clarify once with non-identical copy; repeated misunderstanding may escalate per BR-080 policy.
8. **Escalation threshold** — Ordinary recoverable ambiguity (greeting, city-only, typo, partial day-part) clarifies first. Escalate after repeated unresolved ambiguity, unsupported requests, safety boundaries, or genuine low confidence after reasonable clarification.
9. **Live CE safety (temporary authority)** — Live CE must not persist city→state inventions without confirmation and must not advance city-only partial location to `DAY_PART`. Day-part fragments clarify without identical infinite loops.
10. **Capture diagnostics** — Capture-only turns log sanitized intent/confidence/language/stage/clarification/reasonCodes/elapsedMs. No raw message bodies, phones, provider payloads, secrets, or stack traces. Does not convert capture-only turns into full shadow rows.
11. **Boundaries** — No v2 cutover, no shadow sample increase, no v2 WhatsApp/appointment/Calendar/BR-080 writes, no ads/templates/Meta Review auth changes.
12. **Simulator regression** — Every confirmed production Recruit AI defect must be added as a deterministic Workflow Simulator (Recruit AI v2 Scenarios) case before the defect is considered closed. Simulator runs are ephemeral and must never write production context/shadow tables or execute side effects.
13. **Fact correction & mid-flow questions** — Correction language (`digo` / `actually` / `vivo en`…) must overwrite the active city fact (no competing stale city). Pending questions are context, not a prison: interpret the new message first. After a valid authorization answer, ask the next canonical Team Vision step in the same reply. Direct opportunity/FAQ questions must be answered with approved copy and resume qualification — never human-handoff copy unless an explicit escalate condition exists. A single foreign-language digression must not flip established conversation language.

---

## BR-081 — Recruit AI v2 Structured Context and Decision Engine

**Implements:** Canonical conversation context → structured interpretation → auditable business decision → response plan → rendered copy → side-effect proposal → authorization gate → durable context persistence (Phase 2) → production shadow evaluation (Phase 3) → continuous context capture separate from shadow sampling (Phase 3B)  
**Domain:** Recruit AI / Conversation / Scheduling dialogue  
**Depends on:** BR-049, BR-039, BR-041, BR-075, BR-078  
**Related:** BR-034 (escalation), BR-024 (needsHumanCoordinator), BR-080 (attention read-only input), forensic case TV-000028  
**Status:** In progress (decisions + durable context + shadow active at TV 10% when configured; continuous context capture implemented flag-gated default off; customer-facing execution disabled; production CE remains authoritative)  
**Engine target:** `backend/core/recruitAiV2/*` (`conversationContext`, `contextLoader`, `interpreter`, `decisionEngine`, `responsePlan`, `responseRenderer`, `sideEffectAuthorizer`, `orchestrator`, `contextPersistenceService`, `contextRepository`, `shadowModeRunner`, `shadowEvaluationService`, `contextCaptureService`, `advisoryTurnRunner`)  
**Migration:** `032_br081_recruit_ai_conversation_contexts.sql` (additive; backend-only RLS; no prospect backfill)  
**Tests:** `backend/test/recruitAiV2StructuredContextDecision.test.js`, `backend/test/recruitAiV2DurableContext.test.js`, `backend/test/recruitAiV2ShadowMode.test.js`, `backend/test/recruitAiV2ContinuousContextCapture.test.js`, `backend/test/recruitAiV2Tv000028ReplayContract.test.js`  
**Fixture:** `backend/test/fixtures/recruitAiV2/tv000028-scheduling-replay.json`  
**Docs:** `docs/03-engineering/recruit-ai-v2/07_SHADOW_MODE.md`, `08_CONTINUOUS_CONTEXT_CAPTURE.md`

### Rules

1. **Structured path required** — Inbound Recruit AI turns must produce a StructuredDecision before customer copy or any side-effect proposal. Raw LLM/copy must not directly book or send.
2. **Canonical context** — Preserve preferred language, stage, known facts, appointment proposed vs confirmed vs reschedule-requested, last question/offer, counteroffer mismatch count, confirmation versions, and human-attention flags.
3. **Durable context** — Persist one active sanitized context per organization + prospect + channel with optimistic `context_version` compare-and-set. Duplicate inbound message IDs must not double-advance. Stale writers return conflict. Archive on close/supersede; do not hard-delete audit history automatically.
4. **Counteroffers are first-class** — Messages like `6?`, `6:30?`, `I prefer at 6` are `scheduling_counteroffer` intents. Do not ignore them or re-offer an identical rejected slot menu without a new availability result.
5. **Proposed ≠ confirmed** — Tentative time discussion does not create appointments. `mayCreateAppointment` requires explicit confirmation rules and authorized execution (disabled until cutover).
6. **Reschedule after confirm** — Post-confirmation time counteroffers become `reschedule_request` / reschedule flow; conversations must not permanently lock.
7. **No diagnostic leakage** — Customer copy and persisted `context_json` / shadow metadata must never include internal agent/persistence/error identifiers, tokens, stack traces, or hidden reasoning.
8. **Language sticky** — Preferred language drives automated copy for the turn; do not mix English/Spanish confirmations.
9. **Escalate when uncertain / repeated mismatch** — Low confidence or ≥2 counteroffer mismatches → human attention path with sanitized reason.
10. **Customer-facing side effects disabled** — SideEffectAuthorizer denies WhatsApp send, appointment create/reschedule, and BR-080 attention writes from the v2 orchestrator until an explicit cutover sprint. Authorized v2 writes are durable context rows and (when shadow flags are enabled) `recruit_ai_v2_shadow_evaluations` comparison rows only.
11. **BR-080 read-only** — v2 may read assignment/attention signals into context; persistence must not mutate BR-080 prospect attention/ownership fields.
12. **BR-049 delegation** — Conversation Engine orchestrates; scheduling/appointment/outbound engines execute later. Do not reimplement booking inside `semanticConversationEngine.js` or v2 decision JSON. Production turns remain on the existing CE until a dedicated cutover sprint.
13. **Production shadow mode (Phase 3)** — When explicitly enabled via `RECRUIT_AI_V2_SHADOW_ENABLED` **and** a non-empty org allowlist **and** `sampleRate > 0`, v2 may evaluate asynchronously after the live CE response. Empty allowlist means no organizations are eligible. Malformed config fails closed. Live CE remains the only source of customer-visible copy, WhatsApp sends, appointment execution, BR-080 attention writes, and workflow advancement. Shadow failures must never interrupt the live turn.
14. **Continuous context capture (Phase 3B)** — Context capture is a separate flag family (`RECRUIT_AI_V2_CONTEXT_CAPTURE_*`), default off. When enabled at 100% for an allowlisted org, every eligible inbound turn may update durable v2 context without writing a shadow row. Shadow sampling remains independent (e.g. 10%). A single inbound message advances context exactly once (sampled shadow path OR capture-only path). **100% capture ≠ 100% shadow evaluation** and does **not** mean v2 owns the conversation.
15. **Boundaries** — No live WhatsApp from v2, no appointment writes from v2, no Meta Review auth changes, no template activation, no ad connection, no CE cutover without an explicit sprint.

---

## BR-080 — Canonical New Lead Assignment and Attention Lifecycle

**Implements:** Deterministic owner or durable Unassigned queue; New Lead mission; human acknowledgement; failure escalation  
**Domain:** Lead intake / Assignment / Mission Control / Prospect Center  
**Depends on:** BR-034, BR-036, BR-048, BR-049, BR-075, BR-078, BR-079  
**Related:** BR-015–017 (human takeover), BR-024 (needsHumanCoordinator), BR-025–031 (missions)  
**Status:** Implemented  
**Engine target:** `newLeadAssignmentEngine.js`, `newLeadAttentionEngine.js`, WhatsApp/Quick Capture create paths, Mission `NewLeadAttention`, Prospect Center badges/filters, escalation poller  
**Migration:** `031_br080_new_lead_attention.sql` (additive; no ownership backfill)  
**Tests:** `backend/test/br080NewLeadAssignmentAttention.test.js`, `backend/test/newLeadAssignmentAttentionAudit.test.js`, `backend/test/br080SlaMustNotSilenceHealthyAtlas.test.js`, `backend/test/br080FirstResponseSlaSatisfied.test.js`, `backend/test/br080OperationalAcknowledgePresentation.test.js`

### Rules

1. **Deterministic owner or durable Unassigned** — Every new canonical prospect receives either an eligible `owner_user_id` at create or `assignment_status = unassigned` visible to Admin/RVP (and Division Leader when hierarchy permits).
2. **Create-time assignment precedence** — (1) valid explicit same-org agent, (2) campaign/form mapping when provided, (3) organization `defaultRecruiterUserId`, (4) active organization RVP fallback, (5) authenticated creator when preferred (Quick Capture/manual), (6) Unassigned queue. Reject disabled, deleted, wrong-org, operations/support, and Meta Review fixtures. Never use ATLAS workflow ownership as CRM ownership. Never pick an arbitrary first user.
3. **AI ownership ≠ human CRM ownership** — `workflowOwnership = ATLAS` and Recruit AI replies do not assign `owner_user_id` and do not acknowledge.
4. **New persists until acknowledgement** — `attention_status` remains new/ai_responding/waiting/human_required until explicit Acknowledge or Claim & Acknowledge. Page open, card render, dashboard load, AI reply, prospect inbound, and workflow read-model rebuild do **not** clear New or silently resolve `human_required`. BR-080 attention is not a BR-034 stall and must not be cleared by stall-clearance / `WorkflowResumed` logic.
5. **New Lead mission** — Mission type `NewLeadAttention` surfaces for unassigned, assigned-unacknowledged, and human-required leads. Priority: Unassigned new and unresolved Update Outcome share CRITICAL rank 1 (Update Outcome not weakened); Human Attention / assigned-unacknowledged at rank 2.
6. **Blocked/failed AI creates human-visible attention** — Conversation engine failure and humanAssist paths set Human Attention Required with sanitized reason and durable mission visibility. BR-075/078 blocked sends remain fail-closed and must not mark sent/handled.
7. **Escalation** — Elapsed UTC SLA: 5 minutes unassigned → escalation level 1; 15 minutes unassigned or unacknowledged → level 2 + Human Attention Required (CRM: `escalation_level`, `last_escalated_at`, `attention_status=human_required`, `human_attention_reason`). Idempotent. Acknowledged/closed leads stop escalating. No email/SMS/Slack/browser push in v1. **A successfully delivered Atlas reply to an eligible new lead satisfies the first-response SLA.** After that delivery, the 15-minute unacknowledged/unassigned timer must not set `needsHumanAttention`, must not move `workflowOwnership` off ATLAS, and must not write `human_required` / `unacknowledged_sla_15m` solely because New is still unacknowledged. `markAiResponding` persists `waiting_for_prospect` using durable recruiting eligibility (including workflow-state CTWA/QR proof when `entry_method`/`source` are blank). Real AI/provider/humanAssist/policy/scheduling hard-fail still use `markHumanAttentionRequired`. TAKE OVER and BR-034 24h stall are unchanged.
8. **Claim is compare-and-set** — Claim only when `owner_user_id IS NULL`; concurrent claims return conflict. Claim assigns and acknowledges.
9. **No lead disappears because owner is null** — Unassigned leads remain visible to Admin/RVP filters (`unassigned`, `new-unacknowledged`, `human-attention`). Agents see owned leads immediately after assignment.
10. **Tenant isolation** — Cross-org denial unchanged. Assignments, claims, acknowledgements, and escalations write sanitized audit events.
11. **Boundaries** — No ads connect, no template activation, no live WhatsApp sends from this rule, no production ownership backfill, no Meta Review auth changes.

### Automatic acknowledgement triggers (v1)

Only these clear New:

- Explicit **Acknowledge** API action by an authorized owner/Admin/RVP/DL
- Explicit **Claim & Acknowledge** on an unassigned lead by Admin/RVP/DL
- Explicit Conversations **TAKE OVER** (acknowledges the current episode via canonical `acknowledgeLead`; does not Return to Atlas; sticky HUMAN remains)

Not automatic in v1: page open, AI reply, prospect inbound, mission list render, Mission Control / dashboard / Prospect Center / Follow-ups / queue reads, schedule booking (booking may stamp owner if null but does not acknowledge).

A delivered Atlas reply **satisfies first-response SLA only**. It does not call `acknowledgeLead` and does not clear the New lifecycle.

**Operational acknowledgement (Prospect Center):** If Atlas or a human has already successfully responded (`attention_status` is `ai_responding` / `waiting_for_prospect`, or `acknowledged_at` is set), the lead is operationally acknowledged. Prospect Center must hide Acknowledge / Claim & Acknowledge. Lifecycle may remain New. Manual Acknowledge stays only for truly unattended leads (`attention_status=new` or real `human_required` failure). Provider send failure is not operationally acknowledged.

---

## BR-074 — Firm-Verified Securities Content Access

**Implements:** RC4 Milestone 1 — Firm-Verified Securities Access Foundation
**Domain:** Security / Financial Intelligence / Knowledge
**Depends on:** BR-066
**Status:** Approved
**Engine target:** `securitiesAccessService.js`, `explicitUserPermissionService.js`

### Rules

1. **Operational roles are not securities authorization** — Atlas roles (`administrator`, `rvp`, `division_leader`, `agent`, `recruiter`, `operations`, `support`, and SaaS equivalents) do not authorize named securities-content access.
2. **Insurance licensing is not securities authorization** — An insurance license or insurance-only representative status does not unlock securities-specific content.
3. **Exams are not access** — Passing or recording Series 6, Series 7, Series 24, or another examination does not by itself authorize securities-content access.
4. **Named securities require firm verification** — Fund names, ticker symbols, SB-72, allocation guides, model portfolios, securities-restricted training, downloads, search results, AI retrieval of securities materials, and exports containing named securities require firm-verified active authorization.
5. **Only VERIFIED_ACTIVE unlocks** — Securities-specific content is available only when `securities_access_status = VERIFIED_ACTIVE`, the authorization is within its effective window, and verification metadata is complete (`verification_source`, `verified_by`, `verified_at`).
6. **Fail closed** — `UNKNOWN`, `NOT_REGISTERED`, `PENDING_VERIFICATION`, `RESTRICTED`, `SUSPENDED`, `EXPIRED`, and `TERMINATED` receive no securities-specific content. Missing authorization rows resolve as `UNKNOWN`.
7. **Backend enforcement is mandatory** — Frontend navigation and display hiding are supplemental. APIs, downloads, search, print/export, and AI retrieval must re-evaluate authorization on each protected request.
8. **No self-verification** — Representatives and administrators cannot create, approve, verify, reactivate, or extend their own securities authorization (`actor.userId !== target.userId`).
9. **Explicit verify permission** — Changing another user’s securities authorization requires an active organization-scoped user-level grant of `securities:verify`.
10. **No role/admin wildcard for verify** — Administrator, SUPER_ADMIN, and other role wildcards do not satisfy `securities:verify`. Evaluation uses only explicit `user_permissions` grants via a dedicated resolver.
11. **Audit** — Authorization creates/updates/verifications/revocations/expirations and denied securities-content access must write metadata-only audit events. Do not log documents, registration numbers, tokens, credentials, or unnecessary personal licensing data.
12. **Immediate loss of access** — Expiration, suspension, restriction, termination, or revocation removes securities-content access immediately at request evaluation time.
13. **Generic FI remains available** — Users without verified securities access may still use insurance premium, proposed term premium, Invest-the-Difference amount, hypothetical 4% / 7% / 10% projections, non-guarantee disclosures, and handoff language to a properly registered representative — without named securities.
14. **Preserve BR-066** — Atlas informs; representatives recommend; clients decide. Securities access does not authorize suitability determinations or product recommendations by Atlas.
15. **Manual firm verification (v1)** — Atlas records firm verification (`MANUAL_FIRM_VERIFICATION`). Atlas does not independently certify FINRA, CRD, or Primerica registration status.
16. **Initial authority bootstrap (ops only)** — When an organization has no securities verifier, a controlled one-time operations script may establish the first authority using `INITIAL_FIRM_AUTHORITY_BOOTSTRAP`, documented firm evidence, an explicit `securities:verify` grant, history/audit metadata, and an organization bootstrap lock. This is not a normal Admin Users or HTTP action. After bootstrap, the authority still cannot self-modify via application routes.

### Jurisdiction (v1 limitation)

`jurisdiction_scope` may be null. A missing jurisdiction must not be interpreted as unrestricted authorization. For v1, jurisdiction is informational unless a specific securities resource declares explicit jurisdiction restrictions.

### Content classification (future)

Knowledge / Content Center materials must support access classes: `GENERAL`, `INSURANCE`, `SECURITIES_REGISTERED_ONLY`, `SECURITIES_PRINCIPAL_ONLY`, `COMPLIANCE_ONLY`, `ADMIN_ONLY`. Future SB-72 content defaults to `SECURITIES_REGISTERED_ONLY` and `INTERNAL_ONLY`.

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
**Related:** BR-080 (attention ≠ stall), BR-135 (sticky HUMAN seal)

### Trigger (all required)

1. No **inbound prospect** response for **24 hours** after Atlas's **last outbound** message.
2. Workflow is incomplete (not Closed, not Do Not Contact).
3. Prospect is not awaiting a scheduled event where `WAITING_EVENT` applies.
4. Milestone is not terminal.

### Durable stall episode

Canonical evidence is `stalledAt` and/or `stallEpisodeKey` on `prospects.workflow_state`. Detector `cleared: true` (inbound after outbound) is not authorization to clear. Only a real durable stall episode may execute stall clearance / `WorkflowResumed`. BR-080 `needsHumanAttention` / `human_required` alone is not a stall.

### Read vs write

Mission Control, Dashboard, Prospect Center, Follow-ups, Executive dashboard, and prioritized queue builders are **read-only**. They must not persist ownership/stall transitions or emit stall-clear events merely by being opened. Inbound prospect reply may clear a **real** stall via `reconcileStallAfterProspectReply`.

### Behavior

- Pause automated progression.
- Set `workflowOwnership = AGENT`.
- Set `needsHumanAttention = true`.
- Persist `stalledAt` / `stallEpisodeKey`.
- Create Mission Control priority item **after** Pending Interview Results (rank 2).
- Recommend appropriate human action (early milestones → phone call).
- Preserve current milestone and collected data.
- Resume automatically after agent records interaction and advances milestone (BR-035), or after prospect inbound **when a durable stall episode exists**. No separate "Resume Atlas" button.
- Conversations **HUMAN** requires sticky TAKE OVER (`manualAgentOwnership=true` + `humanTakenOverAt`). Stall-only AGENT ownership presents as **NEEDS_ATTENTION**.

### Events

`ConversationStalled`, `WorkflowOwnershipChanged`, `WorkflowPaused`  
Clearance (real episode + prospect reply): `WorkflowOwnershipChanged` (`reason=prospect_reply`), `WorkflowResumed`

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
| `AGENT` | `ATLAS` | BR-035 human save; prospect inbound after a **durable BR-034 stall episode** (8A.2). Not BR-080 attention. |
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
6. **BR-123** — `occupation` is enrichment/optional data and is **not** a prerequisite for `INTERVIEW_READY`, `INTERVIEW_SCHEDULED`, or `INTERVIEW_DUE`.

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
| Conversation | `conversationEngine.js`, `semanticConversationEngine.js`, `recruitAiV2/` | Understand → remember → decide → **delegate** (BR-049 / BR-081); copy in separate modules |
| Appointments | `appointmentApplicationService.js`, `appointmentDomainService.js` | Persisted appointment lifecycle (BR-039, BR-050) |
| Mission execution | `missionExecutionApplicationService.js` | Atomic schedule-interview orchestration |
| Copy | `conversationCopy.js` | User-facing wording from rule decisions |
| Scheduling | `schedulingEngine.js` | Available times and slot logic |
| Capacity | `capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Agent Actions | `agentActionEngine.js` | Next Actions visibility and execution (BR-025 – BR-032); BR-139 canonical milestone SoR |
| Workflow | `milestoneMapper.js`, `workflowReadModel.js`, `workflowStateStore.js`, `stallDetectionEngine.js`, `workflowOwnershipEngine.js`, `milestoneValidationEngine.js`, `humanAdvancementEngine.js`, `missionControlMilestoneProjection.js` | Milestones, ownership, stall detection, human advancement (BR-034 – BR-037); MC projection SoR (BR-139) |
| Events | `eventEngine.js`, `workflowEventService.js` | Structured auditable workflow events; WhatsApp inbound claim (BR-138) |
| QR Channel (Phase 1–2 live) | `qrChannel/*`, `routes/qrGo.js`, `whatsappProspectResolver` (BR-128 / BR-129 / BR-130 hydrate) | Phase 1 entry + Phase 2 attribution/`conversationGoal` stamp. Phase 3 QR-aware first-turn **not** implemented. Must not bypass BR-120 or appointment mutation path |
