# BR-105 — Constraint-Preserving Workflow Resume + Direct Compensation Answers

**Status:** Implemented in Recruit AI v2 engines (execution remains OFF)  
**Business rule:** BR-105

## Defects

1. After `despues de las 5` (`earliestTime=17:00`), FAQ interruptions resumed with generic  
   “¿Qué hora en la tarde…?” — discarding the after-5 constraint.
2. Compensation subtypes answered evasively; commission yes/no was not direct.
3. Mechanical “Por cierto,” / “By the way,” on every FAQ→resume.

## Root cause

`resolvePendingResume` preferred `acknowledge_afternoon_ask_time` from `day_part` **before** checking `availabilityConstraint.earliestTime`.

## Fix

1. Most-specific resume: when `earliestTime` is set, resume with `ask_time_after_constraint`  
   (“¿Qué hora después de las 5…?”).
2. Preserve day_part + earliestTime across FAQ/objection interruptions.
3. Direct compensation answers from canonical FAQ (`faq.json` production-based / not hourly / not guaranteed salary).
4. Default FAQ resume omits mechanical “Por cierto”.
5. Bare hour before earliestTime → `clarify_time_after_constraint` (e.g. after 5 + 4).

## Canonical commission wording

`backend/knowledge/faq.json` supports production-based compensation (not hourly, not guaranteed salary).  
Direct commission answer: yes, production-based / depends on contract level — no invented %.

## Tests / simulator

- `backend/test/recruitAiV2ConstraintPreservingResumeBr105.test.js`
- Scenario: `constraint-preserving-resume-compensation`
