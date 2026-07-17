# Atlas Development Workflow

This document defines how Atlas should evolve. The official behavior contract lives in **[BUSINESS_RULES.md](./BUSINESS_RULES.md)**. Code should reflect those rules; when they diverge, **the business rule wins**.

---

## Business Rules as architecture

`docs/BUSINESS_RULES.md` is not optional reference material. It is the primary source of truth for:

- Scheduling (BR-001 – BR-007)
- Recruiter presence (BR-008 – BR-010)
- Conversation style (BR-011 – BR-014)
- Human takeover (BR-015 – BR-017)
- Design philosophy (closing section)

New rules should be added as **BR-018**, **BR-019**, etc., in the same document—not scattered across code comments alone.

---

## Workflow for every feature

### 1. Read before you decide

Before architectural decisions, read `docs/BUSINESS_RULES.md`.

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
| Conversation Copy | `backend/core/conversationCopy.js` | User-facing wording (not business logic) |
| Conversation Engine | `backend/core/conversationEngine.js` | Thin entry; delegates to semantic engine |
| Semantic Conversation Engine | `backend/core/semanticConversationEngine.js` | Message flow, FAQ, handoff orchestration |
| Scheduling Engine | `backend/core/schedulingEngine.js` | Scheduling decisions entry point |
| Interview scheduling | `backend/core/interviewScheduling.js` | Slot/day/period/time logic |
| Capacity Engine | `backend/core/capacityEngine.js` | Per-slot capacity (BR-006, BR-007) |
| Validation Engine | `backend/core/validationEngine.js` | Step validation + recovery |
| Response Builder | `backend/core/responseBuilder.js` | Message structure, one question per turn |
| Personality Engine | `backend/core/personalityEngine.js` | Tone and short acknowledgments (BR-011 – BR-013) |
| Presence Engine | *planned* | Recruiter presence (BR-008 – BR-010) |

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

1. Open `docs/BUSINESS_RULES.md`.
2. Choose the next ID (**BR-018**, etc.).
3. Add a clear, testable statement under the right section.
4. Implement or plan implementation in the matching engine.
5. Reference the rule ID in code comments where the rule is enforced.

---

## Goal

Atlas should evolve through **documented Business Rules**, not ad-hoc coding.

The codebase reflects Team Vision’s operating principles. When in doubt, read the rules first.
