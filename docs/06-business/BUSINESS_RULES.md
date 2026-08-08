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
4. **Cross-date selection** — Prefer earliest slot + earliest slot on a later date when real options exist; else same-day earliest+latest (BR-107). Never invent slots.
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
**Tests:** `backend/test/recruitAiV2PartialStateAfterTimeBr102.test.js`  
**Docs:** `docs/03-engineering/recruit-ai-v2/30_PARTIAL_STATE_AFTER_TIME.md`

### Rules

1. **State-only partial** — Valid U.S. state/DC while location is pending → `completeness=state_only`, retain state, ask only for city (“¿En qué ciudad de {State} vives?”). Do not discard the state or re-ask city+state.
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
**Tests:** `backend/test/br080NewLeadAssignmentAttention.test.js`, `backend/test/newLeadAssignmentAttentionAudit.test.js`

### Rules

1. **Deterministic owner or durable Unassigned** — Every new canonical prospect receives either an eligible `owner_user_id` at create or `assignment_status = unassigned` visible to Admin/RVP (and Division Leader when hierarchy permits).
2. **Create-time assignment precedence** — (1) valid explicit same-org agent, (2) campaign/form mapping when provided, (3) organization `defaultRecruiterUserId`, (4) active organization RVP fallback, (5) authenticated creator when preferred (Quick Capture/manual), (6) Unassigned queue. Reject disabled, deleted, wrong-org, operations/support, and Meta Review fixtures. Never use ATLAS workflow ownership as CRM ownership. Never pick an arbitrary first user.
3. **AI ownership ≠ human CRM ownership** — `workflowOwnership = ATLAS` and Recruit AI replies do not assign `owner_user_id` and do not acknowledge.
4. **New persists until acknowledgement** — `attention_status` remains new/ai_responding/waiting/human_required until explicit Acknowledge or Claim & Acknowledge. Page open, card render, dashboard load, and AI reply do **not** clear New.
5. **New Lead mission** — Mission type `NewLeadAttention` surfaces for unassigned, assigned-unacknowledged, and human-required leads. Priority: Unassigned new and unresolved Update Outcome share CRITICAL rank 1 (Update Outcome not weakened); Human Attention / assigned-unacknowledged at rank 2.
6. **Blocked/failed AI creates human-visible attention** — Conversation engine failure and humanAssist paths set Human Attention Required with sanitized reason and durable mission visibility. BR-075/078 blocked sends remain fail-closed and must not mark sent/handled.
7. **Escalation** — Elapsed UTC SLA: 5 minutes unassigned → escalation level 1; 15 minutes unassigned or unacknowledged → level 2 + Human Attention Required. Idempotent. Acknowledged/closed leads stop escalating. No email/SMS/Slack/browser push in v1.
8. **Claim is compare-and-set** — Claim only when `owner_user_id IS NULL`; concurrent claims return conflict. Claim assigns and acknowledges.
9. **No lead disappears because owner is null** — Unassigned leads remain visible to Admin/RVP filters (`unassigned`, `new-unacknowledged`, `human-attention`). Agents see owned leads immediately after assignment.
10. **Tenant isolation** — Cross-org denial unchanged. Assignments, claims, acknowledgements, and escalations write sanitized audit events.
11. **Boundaries** — No ads connect, no template activation, no live WhatsApp sends from this rule, no production ownership backfill, no Meta Review auth changes.

### Automatic acknowledgement triggers (v1)

Only these clear New:

- Explicit **Acknowledge** API action by an authorized owner/Admin/RVP/DL
- Explicit **Claim & Acknowledge** on an unassigned lead by Admin/RVP/DL

Not automatic in v1: page open, AI reply, mission list render, schedule booking (booking may stamp owner if null but does not acknowledge).

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
| Conversation | `conversationEngine.js`, `semanticConversationEngine.js`, `recruitAiV2/` | Understand → remember → decide → **delegate** (BR-049 / BR-081); copy in separate modules |
| Appointments | `appointmentApplicationService.js`, `appointmentDomainService.js` | Persisted appointment lifecycle (BR-039, BR-050) |
| Mission execution | `missionExecutionApplicationService.js` | Atomic schedule-interview orchestration |
| Copy | `conversationCopy.js` | User-facing wording from rule decisions |
| Scheduling | `schedulingEngine.js` | Available times and slot logic |
| Capacity | `capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Agent Actions | `agentActionEngine.js` | Next Actions visibility and execution (BR-025 – BR-032) |
| Workflow | `milestoneMapper.js`, `workflowReadModel.js`, `workflowStateStore.js`, `stallDetectionEngine.js`, `workflowOwnershipEngine.js`, `milestoneValidationEngine.js`, `humanAdvancementEngine.js` | Milestones, ownership, stall detection, human advancement (BR-034 – BR-037) |
| Events | `eventEngine.js`, `workflowEventService.js` | Structured auditable workflow events |
