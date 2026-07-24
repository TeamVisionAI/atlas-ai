# Prospect Lifecycle

## AI Summary

The Prospect lifecycle is an explicit state machine from New Lead through qualification, interview, and terminal outcomes (Client, Recruit, Follow-Up, Lost). Transitions are governed by business rules (BR-XXX), may be automatic (connector events, scheduling engine) or manual (agent action), and may include AI recommendations that never bypass rules. Platform-independent: state changes do not depend on any single channel.

## Purpose

Design the **Prospect state machine** — states, allowed transitions, and governance — for the Prospect Engine.

## Status

Approved — Architecture only (Sprint 14.0)

---

## State diagram (primary path)

```
New Lead
    ↓
Contact Attempted
    ↓
Conversation Started
    ↓
Qualified
    ↓
Interview Scheduled
    ↓
Interview Completed
    ↓
    ├── Client
    ├── Recruit
    ├── Follow-Up
    └── Lost
```

Terminal states: **Client**, **Recruit**, **Follow-Up** (non-terminal — may re-enter pipeline), **Lost**.

---

## State definitions

| State | Meaning |
|-------|---------|
| **New Lead** | Prospect exists in Atlas; no outbound contact yet |
| **Contact Attempted** | Atlas or agent initiated first contact |
| **Conversation Started** | Two-way engagement confirmed |
| **Qualified** | Meets Team Vision qualification criteria (rules engine) |
| **Interview Scheduled** | Appointment on calendar with capacity check |
| **Interview Completed** | Interview occurred or marked complete |
| **Client** | Sold policy / became client (Team Vision definition) |
| **Recruit** | Joined as recruit / agent candidate success path |
| **Follow-Up** | Nurture / deferred — not lost, not yet converted |
| **Lost** | Closed negative; no active pursuit |

---

## Allowed transitions

| From | To | Type | Typical trigger |
|------|-----|------|-----------------|
| New Lead | Contact Attempted | Auto / Manual | First outbound message or call logged |
| Contact Attempted | Conversation Started | Auto | Inbound reply or two-way call completed |
| Contact Attempted | Follow-Up | Manual | No response; agent defers |
| Contact Attempted | Lost | Manual | Disqualified early |
| Conversation Started | Qualified | Auto / Manual | Rules engine + agent confirm |
| Conversation Started | Follow-Up | Manual | Not ready to qualify |
| Conversation Started | Lost | Manual | Not interested |
| Qualified | Interview Scheduled | Auto | Scheduling engine success (BR-006) |
| Qualified | Follow-Up | Manual | Qualified but timing deferred |
| Interview Scheduled | Interview Completed | Auto / Manual | Calendar event completed or agent marks |
| Interview Scheduled | Follow-Up | Manual | No-show reschedule path |
| Interview Scheduled | Lost | Manual | Cancelled permanently |
| Interview Completed | Client | Manual | Outcome recorded |
| Interview Completed | Recruit | Manual | Outcome recorded |
| Interview Completed | Follow-Up | Manual | Needs additional touch |
| Interview Completed | Lost | Manual | Did not convert |
| Follow-Up | Contact Attempted | Manual / Auto | Re-engagement campaign |
| Follow-Up | Conversation Started | Auto | Prospect re-engages |
| Lost | *(none)* | — | Terminal; reopen requires new Prospect or admin merge policy |

**Invalid transitions** must be rejected by the engine with a clear error and audit log entry.

---

## Business rules

Lifecycle transitions must align with [BUSINESS_RULES.md](../../06-business/BUSINESS_RULES.md):

| Transition area | Example rules |
|-----------------|---------------|
| Scheduling | BR-001 – BR-007 (coverage, capacity, interview type) |
| Presence | BR-008 – BR-010 (recruiter overrides) |
| Conversation | BR-011 – BR-014 (style — via conversation engine, not lifecycle store) |
| Handoff | BR-015 – BR-017 (human takeover) |

**Rule:** If a requested transition conflicts with a Business Rule, the engine **blocks** and surfaces the BR number. Agents may override only where rules explicitly allow.

New lifecycle-specific rules should be proposed as **BR-0XX** in `BUSINESS_RULES.md` during implementation sprints.

---

## Automatic transitions

Triggered by **Atlas standard events** (from connectors or internal services):

| Event | May trigger |
|-------|-------------|
| `message_sent` (first outbound) | New Lead → Contact Attempted |
| `message_received` (after outbound) | Contact Attempted → Conversation Started |
| `qualification.completed` | Conversation Started → Qualified |
| `appointment_created` | Qualified → Interview Scheduled |
| `appointment_completed` | Interview Scheduled → Interview Completed |
| `appointment_no_show` | Interview Scheduled → Follow-Up (configurable) |

Automatic transitions run through the **Business Rules Engine** — not hard-coded in connectors.

---

## Manual transitions

Agents or authorized users trigger via UI (Prospect Center, Mission Control, Quick Capture):

- Mark Lost / Follow-Up
- Record outcome: Client / Recruit
- Force Interview Completed
- Re-open from Follow-Up (policy TBD)

Manual transitions require:

- `actor` (user ID)
- `reason` (optional note)
- Timeline event appended

---

## AI recommendations

Atlas AI may **recommend** transitions (e.g. "Ready to qualify", "Suggest interview slot") but:

1. AI does **not** change lifecycle state without rule approval
2. Recommendations appear as `ai_recommendation` timeline entries
3. Agent or automatic rule execution confirms the transition

See [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md).

---

## Workflow engine alignment

Prospect lifecycle states map to workflow **milestones** in [MILESTONE_DEFINITIONS.md](../../06-business/MILESTONE_DEFINITIONS.md) but are not identical:

- Lifecycle = business-facing Prospect status
- Milestones = workflow engine execution steps

Implementation sprints must document the mapping table.

---

## Related Documents

- [PROSPECT_ENGINE.md](./PROSPECT_ENGINE.md)
- [PROSPECT_MODEL.md](./PROSPECT_MODEL.md)
- [PROSPECT_TIMELINE.md](./PROSPECT_TIMELINE.md)
- [EVENT_CATALOG.md](../../06-business/EVENT_CATALOG.md)

## Decision History

| Date | Decision |
|------|----------|
| 2026-07-24 | Lifecycle v1.0 — platform-independent state machine |
