# Recruit AI v2 — First Production Feedback (BR-082)

**Rule:** BR-082  
**Status:** Implemented in code. Does **not** change Railway capture/shadow rates or enable execution.

## Trigger

First Team Vision post-activation conversation (`Hola` → `Miami` → `La or`) exposed defects in **both** live CE and v2 interpretation.

## Fixes

| Area | Change |
|---|---|
| Greeting | Deterministic `greeting` intent; no low-confidence escalate |
| Partial location | City-only → `provide_location` partial; proposed state ≠ confirmed |
| Fact certainty | `confirmed` / `proposed` / `partial` / `unknown` on knownFacts |
| Language | Inferred/default English may adopt Spanish from clear active evidence |
| Fragments | `La or` etc. → incomplete_day_part / ambiguous_fragment, never `provide_name` |
| Last question | Day-part outbound constrains fragment intent |
| Escalation | Clarify recoverable ambiguity first; escalate after repeats |
| Live CE | No Miami→FL persist without confirmation; no premature DAY_PART; alt day-part clarify |
| Capture diagnostics | Sanitized intent/confidence/language/stage/clarification/reasonCodes/elapsedMs |

## Unchanged production posture

- Context capture 100% (when configured)
- Shadow 10% (when configured)
- Execution / cutover **OFF**
- Live `semanticConversationEngine` authoritative
- SideEffectAuthorizer deny-all

## Fixture

`backend/test/fixtures/recruitAiV2/first-production-feedback.json`  
Tests: `backend/test/recruitAiV2FirstProductionFeedback.test.js`

## Simulator regression

The same conversation is also a named Ops Center scenario:

**First Production Failure** (`first-production-failure`)

See `10_WORKFLOW_SIMULATOR_SCENARIOS.md`.

**Development rule:** every confirmed production Recruit AI defect should be converted into a deterministic simulator regression scenario before the defect is considered closed.
