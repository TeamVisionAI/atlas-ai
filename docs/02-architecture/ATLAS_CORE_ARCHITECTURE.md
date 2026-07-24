# Atlas Core Architecture

## AI Summary

Atlas Core is a milestone-driven workflow engine: Atlas automates safe process execution while humans provide judgment. This document defines the target architecture (Sprint 8A) aligned with existing repo code—workflow engine, event catalog, business rules integration—without removing working production features.

**Sprint:** 8A — Atlas Core Workflow Engine  
**Status:** Documentation only — no implementation until review  
**Related:** [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md), [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md), [MILESTONE_DEFINITIONS.md](../06-business/MILESTONE_DEFINITIONS.md), [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md)

---

## Purpose

This document defines the target architecture for Atlas as a **milestone-driven workflow engine** where Atlas automates safe process execution and humans provide judgment and real-world information.

It reflects the **current repository** and the **approved Sprint 8A direction** without redesigning or removing existing working functionality.

---

## Approved Atlas Principles

1. Automate everything that does not require human judgment.
2. Atlas should never ask the agent to do something Atlas can safely do itself.
3. Humans provide decisions and real-world information; Atlas executes the process.
4. Atlas operates by **milestones**, not by individual unanswered messages.
5. A human can advance a prospect to any **valid** milestone.
6. Saving a human interaction automatically returns workflow ownership to Atlas when appropriate.
7. Atlas resumes from the **highest valid completed milestone**.
8. No separate “Resume Atlas” button should be required.
9. Workflow ownership must always be explicit: **ATLAS**, **AGENT**, **WAITING_EVENT**, or **CLOSED**.
10. **Pending Interview Results** has higher Mission Control priority than stalled conversations.
11. A conversation with no prospect response for **24 hours** after Atlas’s last message becomes a **Human Escalation** (BR-034).
12. Human Escalations appear **after** Pending Interview Results in Mission Control.
13. The recommended human action for a stalled early conversation is generally a **phone call**.
14. During the call, the agent should naturally move the prospect as far forward as possible.
15. After the call, the agent records information received and selects the resulting milestone (BR-035).
16. If the human schedules the interview, Atlas automatically sends confirmation, meeting details, reminders, timeline events, and continues the workflow.
17. Atlas should not restart previously completed qualification questions (BR-014).
18. **Closed** or **Do Not Contact** prospects must not be automatically resumed.
19. Every state transition must create an **auditable timeline event**.
20. Business rules must remain separate from UI components and communication-channel integrations.
21. **The Prospect Workspace is an execution workspace, not a record viewer** — optimized for “what do I do next?”, not passive CRM browsing (Sprint 10.2+).

---

## Prospect Workspace (Sprint 10.2+)

**Spec:** [09-releases/sprints/SPRINT_10_2_PROSPECT_WORKSPACE.md](../09-releases/sprints/SPRINT_10_2_PROSPECT_WORKSPACE.md)

### UX principle

> The Prospect Workspace is an **execution workspace**, not a record viewer.

It is the single-prospect counterpart to Mission Control (queue-first). Both surfaces prioritize workflow action over static profile display.

### Five-question layout (canonical section order)

| # | Question | Section |
|---|----------|---------|
| 1 | Who is this person? | Identity |
| 2 | Where are they in their journey? | Journey Progress |
| 3 | What should I do next? | Actions (primary CTA, gate, secondary) |
| 4 | What has happened recently? | **Activity Feed** (unified — replaces separate Notes and Timeline) |
| 5 | What additional details might I need? | Details (interview facts, status, capture metadata, Atlas Coach placeholder) |

Sections 1–3 above the fold on mobile. Activity Feed is first-class, not an accordion. Details collapses on small viewports.

### Architecture constraints

| Constraint | Detail |
|------------|--------|
| Route | `/prospect-workspace/:phone` (Sprint 10.1 — unchanged) |
| Business logic | Reuse Mission Control engines and APIs; workspace GET is additive compose |
| Sprint 10.1 lock | Quick Capture behavior and `verifySprint10_1.js` — unchanged |
| UI | Dedicated `ProspectWorkspace` page; no queue navigator |
| Read models | Milestone, ownership, priority from backend only — no UI-side business rules |

---

## Current Repository Assessment

### Monorepo layout

```
atlas-ai/
├── backend/
│   ├── core/           # Decision engines (27 modules)
│   ├── controllers/    # Mission Control, agent actions
│   ├── routes/         # API: mission-control, dashboard, timeline, webhook
│   ├── services/       # Supabase, WhatsApp, calendar, logging
│   └── data/           # capacity.json, agentActionState.json
├── frontend/
│   └── src/
│       ├── adapters/   # missionControlAdapter (normalization only)
│       ├── engines/    # contextEngine, queueEngine, workflowEngine
│       ├── pages/      # Dashboard (Agent Workspace)
│       └── services/   # missionControlService, organizationService
└── docs/
    ├── BUSINESS_RULES.md      # BR-001 – BR-032
    └── DEVELOPMENT_WORKFLOW.md
```

### What works today (preserve, extend — do not delete)

| Area | Implementation | Role |
|------|----------------|------|
| **Conversation pipeline** | `semanticConversationEngine.js`, `informationModel.js` | WhatsApp message flow, qualification, scheduling |
| **Business rules** | `businessRulesEngine.js`, `businessRulesApplicator.js` | Coverage, interview type, escalation flags |
| **Scheduling** | `schedulingEngine.js`, `interviewScheduling.js`, `schedulingState.js` | Slot selection, confirmation |
| **Capacity** | `capacityEngine.js`, `capacity.json` | BR-006, BR-007 |
| **Mission Control read** | `conversationController.js`, `GET /api/mission-control/:phone` | Prospect brain, brief, missing fields |
| **Next Actions (7.2)** | `agentActionEngine.js`, `POST …/actions` | Context-aware actions, WhatsApp sends |
| **Agent Workspace UI** | `Dashboard.jsx`, `NextActions`, `WorkflowGateModal` | Presentation layer |
| **Timeline (messages)** | `logService.js`, `conversation_logs` table | Inbound/outbound message log |
| **Organization config** | `organizationSettingsEngine.js` | Zoom URL, office location |
| **Dev simulator** | `dev/simulatorRoutes.js` | Same engines as production webhook |

### Dual models in use today (technical debt)

Atlas currently tracks progress through **parallel vocabularies**:

| Layer | Vocabulary | Location |
|-------|------------|----------|
| **Engine step** | `NEW`, `GREETING`, `WORK_AUTHORIZATION`, `OCCUPATION`, `INTERVIEW_TYPE`, `SCHEDULE`, `EMAIL`, `CONFIRMED`, `HANDOFF` | `prospects.current_step`, `deriveCurrentStep()` |
| **Agent milestone label** | New Lead, Qualifying, Interview Scheduled, … | `frontend/types/milestones.js`, `agentActionEngine.js` |
| **Interview outcome** | Recruited, No Show, Rescheduled, … | `workflowEngine.js` (localStorage), `agentActionState.json` |
| **Legacy pipeline UI** | NEW, QUALIFIED, SCHEDULED, … | `PipelineCard.jsx` (unused in Dashboard) |

Sprint 8A introduces a **canonical milestone enum** (see [MILESTONE_DEFINITIONS.md](../06-business/MILESTONE_DEFINITIONS.md)) while **mapping** to existing fields during migration.

### Split workflow storage (gap)

| Store | Contents | Scope |
|-------|----------|-------|
| `prospects` (Supabase) | Profile, `current_step`, interview fields, `notes` | Persistent |
| `agentActionState.json` | Action flags, outcome, follow-up dates | Backend file |
| `localStorage` (`atlas-workflow:{phone}`) | Workflow Gate outcomes | Browser only |

There is **no** `workflowOwnership` field anywhere today.

### Human escalation today vs Sprint 8A

| Concept | Today | Sprint 8A |
|---------|-------|-----------|
| Coordinator handoff | `needsHumanCoordinator` → `HANDOFF` reply (BR-024) | Distinct from 24h stall |
| 24h no response | **Not implemented** | **BR-034** Human Escalation |
| Agent ownership | **Not implemented** | `workflowOwnership = AGENT` |
| Auto-resume Atlas | **Not implemented** | After BR-035 human save |

---

## Target Architecture (Sprint 8A+)

```
                    ┌─────────────────────────────────────┐
                    │         Mission Control API          │
                    │  milestone, ownership, priority,   │
                    │  availableActions, atlasBrief        │
                    └─────────────────┬───────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          ▼                           ▼                           ▼
┌─────────────────┐       ┌─────────────────────┐       ┌─────────────────┐
│ Workflow Engine │       │  Business Rules      │       │  Event / Timeline│
│ (NEW — core)    │◄─────►│  Engine (existing)   │──────►│  Engine (extend) │
│ ownership       │       │  BR-001 – BR-035     │       │  structured events│
│ milestones      │       └─────────────────────┘       └─────────────────┘
│ transitions       │
└────────┬──────────┘
         │
    ┌────┴────┬──────────────┬─────────────┐
    ▼         ▼              ▼             ▼
Conversation  Scheduling   Agent Action   Reminder
Engine        Engine       Engine (7.2)   Service (future)
(existing)    (existing)   (existing)
```

### Layer responsibilities

| Layer | Module (current / proposed) | Responsibility |
|-------|----------------------------|----------------|
| **Workflow Engine** | `workflowEngineCore.js` *(proposed)* | Milestone, ownership, transitions, stall detection, priority |
| **Business Rules** | `businessRulesEngine.js` | Decisions only — no UI, no channel wording |
| **Conversation** | `semanticConversationEngine.js` | Automated WhatsApp when `ownership = ATLAS` |
| **Agent Actions** | `agentActionEngine.js` | Human-triggered execution; defers to workflow engine for visibility |
| **Events** | `eventEngine.js` *(proposed)* | Append-only audit log; superset of message logs |
| **Mission Control** | `conversationController.js` + workflow | Read model for agent UI |
| **Frontend** | Adapters + presentation only | No business-rule decisions |

### Workflow ownership (formalized)

| Value | Meaning |
|-------|---------|
| `ATLAS` | Atlas may send messages and advance workflow automatically |
| `AGENT` | Automated progression paused; human must act (BR-034, BR-035, manual takeover BR-015) |
| `WAITING_EVENT` | Atlas waiting on external condition (scheduled interview time, reminder fire time, prospect reply within SLA) |
| `CLOSED` | Terminal — no automatic resume (Closed, Do Not Contact) |

---

## Mission Control Priority Order (Target)

Replaces/extends frontend-only `queueEngine.js` priorities:

| Rank | Category | Current partial equivalent |
|------|----------|---------------------------|
| 1 | **Pending Interview Results** | `WORKFLOW_GATE` — confirmed, interview past, no outcome |
| 2 | **Human Escalations** | *Not implemented* — BR-034 |
| 3 | **Interviews requiring immediate action** | `INTERVIEW_SOON` — within 2 hours |
| 4 | **Follow-ups due** | `FOLLOW_UP_DUE` |
| 5 | **Normal Atlas-owned workflows** | Active qualification, scheduling in progress |
| 6 | **Monitoring / completed** | Confirmed future interviews, closed, passive watch |

---

## Reusable Building Blocks

- `deriveCurrentStep()` / `getMissingFields()` — qualification completeness
- `agentActionEngine.resolveAvailableActions()` — action matrix (extend for ownership)
- `WorkflowGateModal` + `applyOutcome()` — interview result capture (extend to full milestone advancement)
- `logConversation()` — extend or parallel **structured events**
- `needsHumanCoordinator` — special-case escalation (keep separate from BR-034)
- Mission Control API shape: `brain`, `agentState`, `availableActions`
- Organization settings for automated confirmation content

---

## Gaps: Current → Sprint 8A

| Gap | Severity | Notes |
|-----|----------|-------|
| No canonical milestone on prospect record | High | Map from `current_step` + outcomes |
| No workflow ownership | High | Required for principles 8–9 |
| No 24h stall detector | High | BR-034 |
| No human milestone advancement API | High | BR-035 |
| No structured event catalog | High | Message logs insufficient for audit |
| Queue priority frontend-only | Medium | Move to backend workflow engine |
| Split workflow state (3 stores) | Medium | Consolidate incrementally |
| `DO_NOT_CONTACT` state missing | Medium | Proposed milestone |
| LICENSING / FAST_START | Low | Post-recruit; journey packages placeholder |
| Reminder automation | Low | Event hooks defined; service TBD |
| BR-016 Human Mode flag | Medium | Documented, not in code |

---

## Recommended Implementation Phases

### Phase 8A.1 — Foundation (no UI redesign)

- Add BR-034, BR-035 to `BUSINESS_RULES.md`
- Create `workflowEngineCore.js` with ownership + milestone enums
- Extend prospect/workflow persistence (Supabase column or `workflow_state` JSON)
- Structured event writes alongside existing message logs
- `GET /mission-control` returns `workflowOwnership`, `milestone`, `needsHumanAttention`

### Phase 8A.2 — Stall detection & priority

- Background or message-hook evaluation: 24h since last Atlas outbound
- Set `ownership = AGENT`, emit `ConversationStalled`
- Backend-driven Mission Control queue priority

### Phase 8A.3 — Human advancement (BR-035)

- `POST /workflow/advance` with milestone + captured fields
- Validate required data; trigger automated follow-up (confirmation, reminders)
- Auto-return `ownership = ATLAS` after save

### Phase 8A.4 — Consolidation

- Migrate localStorage workflow to backend
- Unify `current_step` display with canonical milestone
- Deprecate duplicate mappings in frontend (keep adapters)

---

## Risks & Migration Considerations

1. **Breaking Mission Control contract** — extend additively; keep `brain`, `availableActions` stable.
2. **localStorage workflow state** — agents may lose in-progress outcomes if migrated abruptly; require sync script.
3. **Mock queue** — keep for dev; priority engine must support test fixtures.
4. **HANDOFF vs AGENT** — `HANDOFF` is coordinator escalation inside conversation; `AGENT` is workspace ownership. Do not merge.
5. **24h clock start** — must use last **Atlas outbound** timestamp, not last message overall.
6. **WhatsApp-only today** — event catalog is channel-agnostic; implementations stay in services layer.

---

## No-Code Recommendation

**Do not implement backend or frontend changes until:**

1. Product owner approves milestone mapping and open questions (see [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md)).
2. BR-034 and BR-035 are added to `BUSINESS_RULES.md`.
3. Event catalog review confirms audit requirements.

Existing Sprint 7.1 / 7.2 functionality remains the production path during documentation review.

---

## Document Index

| Document | Contents |
|----------|----------|
| [WORKFLOW_ENGINE_SPEC.md](./WORKFLOW_ENGINE_SPEC.md) | State machine, ownership, BR-034/035, transitions |
| [MILESTONE_DEFINITIONS.md](../06-business/MILESTONE_DEFINITIONS.md) | Per-milestone specification |
| [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md) | Auditable events and payloads |
