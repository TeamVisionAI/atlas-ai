# Recruit AI v2 — Playground Feedback: Fact Correction & Continuity

**Status:** Implemented (v2 advisory/shadow pipeline only; execution OFF)  
**Related:** BR-082, simulator scenario `fact-correction-mid-flow-question`

## Defect conversation

1. Hola  
2. Miami, florida  
3. Digo, vivo en Doral  
4. Si tengo permiso  
5. What is this about?

## Root causes

1. **Doral correction** — Location parser did not strip correction/living preambles (`digo`, `vivo en`), so intent fell through to `unknown` → `clarify_once` while pending authorization. Miami stayed active.
2. **Continuemos dead-end** — `Si tengo permiso` was misclassified as `provide_name`; `continue_qualification` template acknowledged without asking the next Team Vision canonical step (day-part).
3. **What is this about? handoff** — Opportunity regex missed the phrase; low-confidence `unknown` after prior clarification escalated to `safe_uncertain_escalate` human-handoff copy.

## Fixes

- Correction language + `vivo en` / `live in` location extraction → `correct_location`
- Compatible state retained (Doral → FL) when prior state confirmed
- `provide_authorization` intent; next reply uses canonical office day-part copy
- Expanded direct-question detection; answer via `getCanonicalFaqAnswer` then resume pending question
- Human-handoff copy reserved for explicit escalate decisions
- Single foreign-language digression does not flip established conversation language; explicit switch requests do

## Regression

Deterministic scenario: **Fact Correction + Mid-Flow Question**  
Workflow: reproduce in playground → scenario → keep green permanently.
