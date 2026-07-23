# Atlas Glossary

**Sprint:** 8A — Approved terminology  
**Status:** Active reference for code, docs, and Mission Control

---

## Core Concepts

| Term | Definition |
|------|------------|
| **Atlas** | Automated recruiting workflow system. Executes process; does not replace human judgment. |
| **Agent** | Human recruiter using Mission Control / Agent Workspace. |
| **Prospect** | A candidate in the recruiting pipeline, identified by phone. |
| **Milestone** | Canonical progress marker in the workflow (e.g. `QUALIFICATION`). Atlas operates by milestones, not unanswered messages. |
| **Workflow Ownership** | Who may drive automated progression: `ATLAS`, `AGENT`, `WAITING_EVENT`, or `CLOSED`. |
| **Mission Control** | Agent-facing command center (Dashboard / Agent Workspace). |
| **Human Escalation** | BR-034: 24h stall with no prospect reply; ownership transfers to `AGENT`. |
| **Workflow Gate** | UI block when interview passed and outcome not recorded (`INTERVIEW_RESULT_PENDING`). |
| **Timeline Event** | Structured auditable record in `workflow_events` (distinct from message logs). |

---

## Workflow Ownership Values

| Value | Meaning |
|-------|---------|
| `ATLAS` | Atlas may send messages and advance workflow automatically. |
| `AGENT` | Automated progression paused; human must act. |
| `WAITING_EVENT` | Waiting on external condition (scheduled interview, reminder, prospect reply within SLA). |
| ~~`SYSTEM_WAITING`~~ | **Deprecated** — normalized to `WAITING_EVENT` on read (Sprint 8A.2). |
| `CLOSED` | Terminal — no automatic resume (Closed, Do Not Contact). |

---

## Canonical Milestones

| ID | Agent-facing label (approx.) | Description |
|----|------------------------------|-------------|
| `NEW_LEAD` | New Lead | Prospect exists; outreach not started or not engaged. |
| `GREETING_SENT` | — | Atlas sent greeting; awaiting first prospect reply. |
| `QUALIFICATION` | Qualifying | Collecting work authorization, occupation, interview type. |
| `INTERVIEW_READY` | — | Qualified; ready to schedule. |
| `INTERVIEW_SCHEDULED` | Interview Scheduled | Datetime captured; confirmations/reminders active. |
| `INTERVIEW_DUE` | Interview Confirmed (imminent) | Interview within ~2 hours. |
| `INTERVIEW_COMPLETED` | Interview Complete | Interview time passed. |
| `INTERVIEW_RESULT_PENDING` | — | Outcome not yet recorded (Workflow Gate). |
| `FOLLOW_UP` | Follow Up | Deferred engagement or no-show recovery. |
| `ORIENTATION` | Recruited / Orientation Scheduled | Post-recruit orientation phase. |
| `LICENSING` | Onboarding (partial) | Licensing track — proposed journey phase. |
| `FAST_START` | — | Final pre-production onboarding — proposed. |
| `CLOSED` | Closed | Terminal — not interested or completed. |
| `DO_NOT_CONTACT` | — | Compliance terminal — no outreach. |

Full specs: [MILESTONE_DEFINITIONS.md](../06-business/MILESTONE_DEFINITIONS.md)

---

## Legacy Terms (still in code)

| Legacy term | Location | Canonical equivalent |
|-------------|----------|---------------------|
| `current_step` | `prospects.current_step`, `deriveCurrentStep()` | Input to milestone mapper |
| `GREETING`, `SCHEDULE`, `CONFIRMED`, … | Engine steps | Mapped to milestones |
| Frontend `MILESTONES` labels | `types/milestones.js` | Presentation only |
| `agentActionState` | `agentActionState.json` | Outcomes, flags, follow-up dates |
| `needsHumanCoordinator` | BR-024 | Conversation handoff — distinct from `AGENT` ownership |
| `HANDOFF` | Conversation reply step | Not the same as workspace ownership |

---

## Mission Control Priority Tiers

| Rank | Tier | Description |
|------|------|-------------|
| 1 | Pending Interview Results | `INTERVIEW_RESULT_PENDING` |
| 2 | Human Escalations | BR-034 stall |
| 3 | Interview Immediate | Interview within 2 hours |
| 4 | Follow-up Due | Follow-up date reached |
| 5 | Atlas Active | Normal Atlas-owned workflows |
| 6 | Monitoring | Future interviews, closed, passive |

---

## Event Types (summary)

See [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md) for payloads.

`ProspectCreated`, `GreetingSent`, `MessageReceived`, `MessageSent`, `QualificationUpdated`, `ConversationStalled`, `WorkflowOwnershipChanged`, `HumanCallStarted`, `HumanCallCompleted`, `ProspectAdvanced`, `InterviewScheduled`, `InterviewRescheduled`, `InterviewCompleted`, `InterviewResultRecorded`, `FollowUpScheduled`, `ReminderScheduled`, `ReminderSent`, `WorkflowResumed`, `WorkflowPaused`, `ProspectClosed`, `DoNotContactApplied`

---

## Business Rules (Workflow)

| ID | Name |
|----|------|
| BR-034 | Conversation Stalled / Intelligent Human Escalation |
| BR-035 | Human Advancement |
| BR-036 | Workflow Ownership Transition |
| BR-037 | Milestone Validation |

See [BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md)

---

## Module Map (Sprint 8A)

| Module | Purpose |
|--------|---------|
| `workflowConstants.js` | Enums: milestones, ownership, priorities, events |
| `milestoneMapper.js` | Read-only mapping from legacy state |
| `milestoneValidationEngine.js` | BR-037 required fields + transition validation |
| `humanAdvancementEngine.js` | BR-035 advancement execution |
| `stallDetectionEngine.js` | BR-034 stall detection |
| `workflowOwnershipEngine.js` | BR-036 ownership transitions |
| `workflowStateStore.js` | Ownership persistence (`workflowState.json`) |
| `workflowReadModel.js` | Mission Control workflow read model |
| `eventEngine.js` | `emit()` infrastructure |
| `workflowEventService.js` | Supabase `workflow_events` persistence |
