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
**Related:** BR-076 (Zoom URL), BR-077 (office address)  
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
