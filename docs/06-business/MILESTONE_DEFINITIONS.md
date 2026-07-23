# Milestone Definitions

**Sprint:** 8A — Atlas Core Workflow Engine  
**Status:** Specification — pending documentation review  
**Related:** [WORKFLOW_ENGINE_SPEC.md](../02-architecture/WORKFLOW_ENGINE_SPEC.md), [EVENT_CATALOG.md](../06-business/EVENT_CATALOG.md)

Each milestone uses a consistent template. **Owner** refers to default workflow ownership when entering the milestone under normal (non-escalation) flow.

---

## NEW_LEAD

| Field | Definition |
|-------|------------|
| **Purpose** | Prospect exists in Atlas; automated outreach not yet sent or not yet acknowledged |
| **Owner** | `ATLAS` |
| **Entry conditions** | Prospect record created; no qualifying conversation progress |
| **Required data** | `phone` (minimum) |
| **Automatic Atlas actions** | Send greeting / initiate qualification sequence when capacity allows |
| **Human actions allowed** | Call, WhatsApp, notes; BR-035 advance to any valid milestone |
| **Exit conditions** | First Atlas greeting sent OR human advances |
| **Allowed next milestones** | `GREETING_SENT`, `QUALIFICATION`, `DO_NOT_CONTACT`, `CLOSED` |
| **Events generated** | `ProspectCreated`, `GreetingSent`, `MessageSent` |
| **Priority behavior** | Rank 5 (normal Atlas) or rank 4 if follow-up date set |
| **Invalid transitions** | From `CLOSED` without reopen |

**Repository mapping:** Dashboard “new lead” detection; no `current_step` or earliest engine state.

---

## GREETING_SENT

| Field | Definition |
|-------|------------|
| **Purpose** | Atlas has sent initial outreach; awaiting first meaningful prospect response |
| **Owner** | `ATLAS` → `WAITING_EVENT` (awaiting reply) |
| **Entry conditions** | At least one Atlas outbound; no prospect reply yet |
| **Required data** | `phone` |
| **Automatic Atlas actions** | None until reply or BR-034 stall |
| **Human actions allowed** | Call (recommended after stall), WhatsApp, BR-035 advance |
| **Exit conditions** | Prospect inbound message OR human advancement OR stall → `AGENT` |
| **Allowed next milestones** | `QUALIFICATION`, `INTERVIEW_READY`, `CLOSED`, `DO_NOT_CONTACT` |
| **Events generated** | `GreetingSent`, `MessageSent`, `ConversationStalled` |
| **Priority behavior** | Rank 5; rank 2 after 24h stall (Human Escalation) |
| **Invalid transitions** | — |

**Repository mapping:** **Proposed** — derived from message log timestamps (last outbound Atlas, no inbound). Not a distinct `current_step` today.

---

## QUALIFICATION

| Field | Definition |
|-------|------------|
| **Purpose** | Collect work authorization, occupation, interview type, and related fields |
| **Owner** | `ATLAS` |
| **Entry conditions** | Prospect engaged; required qualification fields incomplete |
| **Required data** | Per `getMissingFields()`: work authorization, occupation, interview type, etc. |
| **Automatic Atlas actions** | Ask next missing field only (BR-014); FAQ/coverage as needed |
| **Human actions allowed** | Call, WhatsApp, send zoom/office when rules allow; BR-035 with field capture |
| **Exit conditions** | All qualification fields complete OR human jumps to later milestone |
| **Allowed next milestones** | `INTERVIEW_READY`, `INTERVIEW_SCHEDULED`, `FOLLOW_UP`, `CLOSED`, `DO_NOT_CONTACT` |
| **Events generated** | `MessageReceived`, `MessageSent`, `QualificationUpdated`, `ConversationStalled` |
| **Priority behavior** | Rank 5; rank 2 if stalled 24h |
| **Invalid transitions** | Skip required fields without human capture (BR-035 validation fails) |

**Repository mapping:** `current_step` ∈ `GREETING`, `WORK_AUTHORIZATION`, `OCCUPATION`, `INTERVIEW_TYPE`; frontend “Qualifying”.

---

## INTERVIEW_READY

| Field | Definition |
|-------|------------|
| **Purpose** | Prospect is qualified; ready to propose interview schedule |
| **Owner** | `ATLAS` |
| **Entry conditions** | Qualification complete; no confirmed interview slot |
| **Required data** | Full qualification set per business rules |
| **Automatic Atlas actions** | Offer scheduling slots (capacity engine); collect email if needed |
| **Human actions allowed** | Schedule, reschedule actions; BR-035 to `INTERVIEW_SCHEDULED` |
| **Exit conditions** | Slot selected and confirmed OR human schedules |
| **Allowed next milestones** | `INTERVIEW_SCHEDULED`, `FOLLOW_UP`, `CLOSED`, `DO_NOT_CONTACT` |
| **Events generated** | `QualificationUpdated`, `MessageSent` |
| **Priority behavior** | Rank 5 |
| **Invalid transitions** | `INTERVIEW_SCHEDULED` without datetime/email when required |

**Repository mapping:** Derived when `getMissingFields()` empty and not `CONFIRMED`.

---

## INTERVIEW_SCHEDULED

| Field | Definition |
|-------|------------|
| **Purpose** | Interview datetime captured; confirmation/reminders active |
| **Owner** | `WAITING_EVENT` (until interview window) |
| **Entry conditions** | `interview_date` / slot set; may or may not be confirmed |
| **Required data** | Interview datetime, type (virtual/in-person), email when required |
| **Automatic Atlas actions** | Confirmation message, meeting details, reminders (principle 16) |
| **Human actions allowed** | Reschedule, send zoom link, send office location, notes |
| **Exit conditions** | Interview time reached OR rescheduled OR cancelled |
| **Allowed next milestones** | `INTERVIEW_DUE`, `FOLLOW_UP`, `CLOSED`, `DO_NOT_CONTACT` |
| **Events generated** | `InterviewScheduled`, `InterviewRescheduled`, `ReminderScheduled`, `ReminderSent`, `MessageSent` |
| **Priority behavior** | Rank 5–6 (monitoring until within 2h) |
| **Invalid transitions** | — |

**Repository mapping:** `current_step` ∈ `SCHEDULE`, `EMAIL`; frontend “Interview Scheduled” / “Interview Confirmed”.

---

## INTERVIEW_DUE

| Field | Definition |
|-------|------------|
| **Purpose** | Interview imminent (within operational window, e.g. 2 hours) |
| **Owner** | `WAITING_EVENT` |
| **Entry conditions** | Confirmed interview; start time within 2 hours |
| **Required data** | Confirmed datetime, interview type |
| **Automatic Atlas actions** | Reminder sends if configured |
| **Human actions allowed** | Call, WhatsApp, reschedule, send zoom/office |
| **Exit conditions** | Interview start time passed |
| **Allowed next milestones** | `INTERVIEW_COMPLETED`, `FOLLOW_UP` |
| **Events generated** | `ReminderSent`, `MessageSent` |
| **Priority behavior** | **Rank 3** — Interviews requiring immediate action |
| **Invalid transitions** | — |

**Repository mapping:** `current_step = CONFIRMED` + time heuristic (matches `queueEngine` INTERVIEW_SOON).

---

## INTERVIEW_COMPLETED

| Field | Definition |
|-------|------------|
| **Purpose** | Interview time has passed; outcome not yet recorded |
| **Owner** | `AGENT` (implicit until outcome) |
| **Entry conditions** | Current time > interview end; no outcome in workflow state |
| **Required data** | Interview occurred (implicit) |
| **Automatic Atlas actions** | None — await human outcome |
| **Human actions allowed** | Workflow Gate / outcome selection |
| **Exit conditions** | Outcome recorded |
| **Allowed next milestones** | `INTERVIEW_RESULT_PENDING` *(same beat)*, then outcome-driven |
| **Events generated** | `InterviewCompleted` |
| **Priority behavior** | Transitions immediately to result pending |
| **Invalid transitions** | — |

**Repository mapping:** Overlaps Workflow Gate detection in `workflowEngine.js` / Dashboard.

---

## INTERVIEW_RESULT_PENDING

| Field | Definition |
|-------|------------|
| **Purpose** | Interview done; agent must record result (recruited, no show, etc.) |
| **Owner** | `AGENT` |
| **Entry conditions** | Interview in past; `outcome` null in agent/workflow state |
| **Required data** | Outcome selection |
| **Automatic Atlas actions** | None until outcome saved |
| **Human actions allowed** | Workflow Gate outcomes; notes |
| **Exit conditions** | Outcome saved via gate or BR-035 |
| **Allowed next milestones** | `FOLLOW_UP`, `ORIENTATION`, `CLOSED`, `QUALIFICATION` *(reschedule path)* |
| **Events generated** | `InterviewResultRecorded`, `ProspectAdvanced`, `WorkflowOwnershipChanged` |
| **Priority behavior** | **Rank 1** — Pending Interview Results |
| **Invalid transitions** | Automated `ATLAS` resume without outcome |

**Repository mapping:** `workflowGateActive` in frontend; `agentActionState.outcome` empty.

---

## FOLLOW_UP

| Field | Definition |
|-------|------------|
| **Purpose** | Deferred engagement — needs more time, no show recovery, nurture |
| **Owner** | `ATLAS` or `WAITING_EVENT` (until follow-up date) |
| **Entry conditions** | Outcome or human set follow-up; or no-show / not ready |
| **Required data** | `followUpDate` (recommended) |
| **Automatic Atlas actions** | Message on follow-up date; re-enter qualification/scheduling as appropriate |
| **Human actions allowed** | Call, WhatsApp, schedule, BR-035 |
| **Exit conditions** | Follow-up executed OR advanced |
| **Allowed next milestones** | `QUALIFICATION`, `INTERVIEW_SCHEDULED`, `CLOSED` |
| **Events generated** | `FollowUpScheduled`, `MessageSent`, `WorkflowResumed` |
| **Priority behavior** | **Rank 4** when `followUpDate <= today` |
| **Invalid transitions** | — |

**Repository mapping:** Workflow outcomes “Needs More Time”, “No Show”; `followUpDate` in agentActionState.

---

## ORIENTATION

| Field | Definition |
|-------|------------|
| **Purpose** | Prospect recruited; orientation/onboarding scheduling |
| **Owner** | `ATLAS` / `AGENT` (mixed — TBD by journey rules) |
| **Entry conditions** | Outcome Recruited; orientation not complete |
| **Required data** | Recruit confirmation, orientation datetime *(when scheduled)* |
| **Automatic Atlas actions** | Orientation reminders, journey messaging *(future)* |
| **Human actions allowed** | Notes, schedule actions, BR-035 |
| **Exit conditions** | Orientation complete → licensing/fast start |
| **Allowed next milestones** | `LICENSING`, `FAST_START`, `CLOSED` |
| **Events generated** | `ProspectAdvanced`, `InterviewResultRecorded` |
| **Priority behavior** | Rank 5–6 |
| **Invalid transitions** | — |

**Repository mapping:** Frontend “Recruited”, “Orientation Scheduled”.

---

## LICENSING

| Field | Definition |
|-------|------------|
| **Purpose** | Post-recruit licensing milestones in journey package |
| **Owner** | `ATLAS` |
| **Entry conditions** | Orientation complete; licensing track active |
| **Required data** | Journey-specific *(TBD)* |
| **Automatic Atlas actions** | Journey automations *(future)* |
| **Human actions allowed** | BR-035, notes |
| **Exit conditions** | Licensing complete |
| **Allowed next milestones** | `FAST_START`, `CLOSED` |
| **Events generated** | `ProspectAdvanced` |
| **Priority behavior** | Rank 6 |
| **Invalid transitions** | — |

**Repository mapping:** **Proposed** — “Onboarding” partially covers; no backend enum.

---

## FAST_START

| Field | Definition |
|-------|------------|
| **Purpose** | Final pre-production onboarding in journey package |
| **Owner** | `ATLAS` |
| **Entry conditions** | Licensing complete or fast-track path |
| **Required data** | Journey-specific *(TBD)* |
| **Automatic Atlas actions** | Journey automations *(future)* |
| **Human actions allowed** | BR-035, notes |
| **Exit conditions** | Fast start complete |
| **Allowed next milestones** | `CLOSED` |
| **Events generated** | `ProspectAdvanced`, `ProspectClosed` |
| **Priority behavior** | Rank 6 |
| **Invalid transitions** | — |

**Repository mapping:** **Proposed** — no equivalent today.

---

## CLOSED

| Field | Definition |
|-------|------------|
| **Purpose** | Terminal — not interested, disqualified, completed journey |
| **Owner** | `CLOSED` |
| **Entry conditions** | Explicit close reason or terminal outcome |
| **Required data** | Closure reason (recommended) |
| **Automatic Atlas actions** | **None** — no auto-resume (principle 18) |
| **Human actions allowed** | Notes only; reopen out of scope for 8A |
| **Exit conditions** | — |
| **Allowed next milestones** | None *(reopen = product decision)* |
| **Events generated** | `ProspectClosed`, `WorkflowOwnershipChanged` |
| **Priority behavior** | Rank 6 — monitoring only |
| **Invalid transitions** | Automated resume to `ATLAS` |

**Repository mapping:** “Not Interested”, “Closed” milestone; BR-008.

---

## DO_NOT_CONTACT

| Field | Definition |
|-------|------------|
| **Purpose** | Legal/compliance terminal — no outreach permitted |
| **Owner** | `CLOSED` |
| **Entry conditions** | Explicit DNC request or compliance flag |
| **Required data** | DNC reason, timestamp |
| **Automatic Atlas actions** | **None** |
| **Human actions allowed** | Compliance review only |
| **Exit conditions** | — |
| **Allowed next milestones** | None |
| **Events generated** | `DoNotContactApplied`, `WorkflowOwnershipChanged` |
| **Priority behavior** | Excluded from active queue |
| **Invalid transitions** | Any automated message |

**Repository mapping:** **Proposed** — not distinct from CLOSED today.

---

## Milestone × Ownership Matrix (Default)

| Milestone | Default ownership |
|-----------|-------------------|
| NEW_LEAD | ATLAS |
| GREETING_SENT | WAITING_EVENT |
| QUALIFICATION | ATLAS |
| INTERVIEW_READY | ATLAS |
| INTERVIEW_SCHEDULED | WAITING_EVENT |
| INTERVIEW_DUE | WAITING_EVENT |
| INTERVIEW_COMPLETED | AGENT |
| INTERVIEW_RESULT_PENDING | AGENT |
| FOLLOW_UP | WAITING_EVENT / ATLAS |
| ORIENTATION | ATLAS |
| LICENSING | ATLAS |
| FAST_START | ATLAS |
| CLOSED | CLOSED |
| DO_NOT_CONTACT | CLOSED |

**Override:** BR-034 sets `AGENT` regardless of milestone. BR-035 sets ownership on save.

---

## Human Escalation (Cross-Cutting)

When BR-034 fires at any non-terminal milestone:

- **Owner** → `AGENT`
- **Milestone** → unchanged
- **Recommended action** → phone call for early milestones (`NEW_LEAD`, `GREETING_SENT`, `QUALIFICATION`); context-specific for later stages
- **Priority** → rank 2 (after Pending Interview Results)
