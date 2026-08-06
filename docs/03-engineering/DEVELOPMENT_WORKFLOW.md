# Atlas Development Workflow

## AI Summary

Atlas evolves through documented Business Rules and a fixed engineering pipeline: Idea → Discussion → Approval → Implementation → Documentation → Knowledge Hub → Release. Read `BUSINESS_RULES.md` before behavioral changes, reuse core engines, cite BR-XXX in code, and update `CURRENT_STATE.md` after each sprint.

This document defines how Atlas should evolve. The official behavior contract lives in **[BUSINESS_RULES.md](../06-business/BUSINESS_RULES.md)**. Code should reflect those rules; when they diverge, **the business rule wins**.

---

## Official engineering process

Every feature or significant change follows this pipeline:

```
Idea
  ↓
Discussion
  ↓
Approval
  ↓
Implementation
  ↓
Documentation
  ↓
Knowledge Hub
  ↓
Release
```

| Stage | Output |
|-------|--------|
| **Idea** | Problem statement, optional backlog entry |
| **Discussion** | Trade-offs, BR alignment, sprint scope |
| **Approval** | Sprint spec or explicit sign-off |
| **Implementation** | Code in `backend/` / `frontend/` |
| **Documentation** | Markdown in `/docs` per [DOCUMENTATION_STANDARD.md](./DOCUMENTATION_STANDARD.md) |
| **Knowledge Hub** | Verify in `/app/knowledge`; update [CURRENT_STATE.md](../CURRENT_STATE.md) |
| **Release** | Changelog, deploy, sprint record in `docs/09-releases/` |

---

## Business Rules as architecture

`docs/06-business/BUSINESS_RULES.md` is not optional reference material. It is the primary source of truth for:

- Scheduling (BR-001 – BR-007)
- Recruiter presence (BR-008 – BR-010)
- Conversation style (BR-011 – BR-014)
- Human takeover (BR-015 – BR-017)
- Design philosophy (closing section)

New rules should be added as **BR-018**, **BR-019**, etc., in the same document—not scattered across code comments alone.

---

## Workflow for every feature

### 1. Read before you decide

Before architectural decisions, read `docs/06-business/BUSINESS_RULES.md`.

### 2. Map the feature to existing rules

| Step | Action |
|------|--------|
| 1 | Check whether an existing Business Rule already covers the behavior |
| 2 | If **yes** → implement in alignment with that rule |
| 3 | If **no** → recommend a new **BR-XXX** in `BUSINESS_RULES.md` instead of inventing ad-hoc behavior |

### 3. Propose new rules when behavior changes

Whenever a feature **changes** Atlas behavior, recommend adding or updating a Business Rule.

**Example:** *"Recommend adding BR-018 describing Human Presence behavior."*

### 4. Reference rules in code and docs

When comments or documentation explain *why* something works a certain way, cite the rule:

```javascript
// Implements BR-004 — working prospects are asked before/after 5 PM.
```

```javascript
// Implements BR-006 — max 2 interviews per slot (see capacityEngine.js).
```

### 5. Surface conflicts early

If a requested feature conflicts with an existing rule, **identify the conflict before writing code**.

**Example:** *"This request conflicts with BR-008 (Recruiter Presence overrides calendar availability)."*

Resolve by changing the feature, updating the rule (with team approval), or explicitly documenting an exception.

### 6. Reuse engines—do not duplicate logic

Prefer extending existing engines over copying business logic into routes or handlers.

| Engine | Location | Responsibility |
|--------|----------|------------------|
| **Business Rules Engine** | `backend/core/businessRulesEngine.js` | Team Vision operational decisions (coverage, interview type, escalation) — **decisions only** |
| Business Rules Applicator | `backend/core/businessRulesApplicator.js` | Apply rule decisions to prospect profile |
| **New Lead Assignment (BR-080)** | `backend/core/newLeadAssignmentEngine.js` | Create-time CRM owner or Unassigned — never use ATLAS workflow ownership as CRM ownership |
| **New Lead Attention (BR-080)** | `backend/core/newLeadAttentionEngine.js` | Acknowledge/claim/escalate; AI success ≠ human acknowledgement |
| **Conversation Engine** | `backend/core/conversationEngine.js` | Thin entry; understand → remember → decide → **delegate** (BR-049) |
| Semantic Conversation Engine | `backend/core/semanticConversationEngine.js` | Turn orchestration; **must not** duplicate qualification/scheduling/appointment/workflow logic |
| Conversation Copy | `backend/core/conversationCopy.js` | User-facing wording (not business logic) |
| **Appointment Application** | `backend/application/appointmentApplicationService.js` | Persisted appointment lifecycle execution (BR-039, BR-050) |
| Mission Execution | `backend/application/missionExecutionApplicationService.js` | End-to-end schedule interview (atomic booking path) |
| Scheduling Engine | `backend/core/schedulingEngine.js` | Scheduling **options** and turn handling (conversation + UI) |
| Interview scheduling | `backend/core/interviewScheduling.js` | Slot/day/period/time logic |
| Capacity Engine | `backend/core/capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Human Advancement | `backend/core/humanAdvancementEngine.js` | Workflow milestone execution (BR-035) |
| Communication Hub | `backend/core/communicationHub.js` | Channel-agnostic inbound/outbound routing |
| Validation Engine | `backend/core/validationEngine.js` | Step validation + recovery |
| Response Builder | `backend/core/responseBuilder.js` | Message structure, one question per turn |
| Personality Engine | `backend/core/personalityEngine.js` | Tone and short acknowledgments (BR-011 – BR-013) |
| Presence Engine | *planned* | Recruiter presence (BR-008 – BR-010) |
| **Policy Intelligence** | `backend/modules/policy-intelligence/` | Frozen analysis pipeline (Facts, Rules, Annual Values, Comparison) — BR-051–BR-061 |
| **Financial Intelligence** | `backend/modules/financial-intelligence/` | Invest-the-Difference Strategy Evaluation (consumes PI; never mutates PI) — BR-062–BR-073 / BR-066 |

### 7. Recommend refactors when logic repeats

If the same rule appears in multiple places, propose consolidating into the appropriate engine **before** adding more duplicated code.

### 8. Sprint completion summary

At the end of each sprint, include:

- **Files modified**
- **Engines affected**
- **Business Rules implemented** (e.g. BR-001, BR-004)
- **New Business Rules recommended** (e.g. BR-018 draft)
- **Technical debt created** (if any)

---

## Adding a new Business Rule

1. Open `docs/06-business/BUSINESS_RULES.md`.
2. Choose the next ID (**BR-018**, etc.).
3. Add a clear, testable statement under the right section.
4. Implement or plan implementation in the matching engine.
5. Reference the rule ID in code comments where the rule is enforced.

---

## Goal

Atlas should evolve through **documented Business Rules**, not ad-hoc coding.

The codebase reflects Team Vision’s operating principles. When in doubt, read the rules first.
