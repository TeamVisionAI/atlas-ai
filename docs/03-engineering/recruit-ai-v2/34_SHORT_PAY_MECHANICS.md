# BR-106 — Short Pay-Mechanics Compensation Phrase Recognition

**Status:** Implemented in Recruit AI v2 engines (execution remains OFF)  
**Business rule:** BR-106  
**Intent:** existing `compensation_question` / subtype `pay_how`

## Defect

> Prospect: `como pagan?`  
> Atlas: `Gracias — eso ayuda. Continuemos.`

Root cause: short pay-mechanics phrases were absent from `looksLikeCompensationQuestion`, so two-token Spanish was misclassified as `provide_name`.

## Fix

1. Expand `pay_how` patterns (`como pagan`, `como es el pago`, `how do they pay`, pay structure, …).
2. Keep routing on existing `COMPENSATION_QUESTION` ahead of name/ack/clarify.
3. Direct production-based answer (canonical FAQ); not Continuemos / interview-only evasion.
4. Preserve `awaiting_availability` + preferred time when availability is unresolved.

## Tests / simulator

- `backend/test/recruitAiV2ShortPayMechanicsBr106.test.js`
- Scenario: `short-pay-mechanics-como-pagan`
