# BR-104 — Compensation / Earnings FAQ Routing During Scheduling

**Status:** Implemented in Recruit AI v2 engines (execution remains OFF)  
**Business rule:** BR-104  
**Intent:** existing `compensation_question` (no parallel intent)

## Defect

With pending `ask_time` (afternoon) after Miami / work-auth / overview / network objection:

> Prospect: `entonces como voy a ganar dinero?`  
> Atlas: generic clarify (“dato que te acabo de pedir…”)

Root cause: `looksLikeCompensationQuestion` only covered narrow “cuánto pagan / salary / commission” shapes, missing “cómo voy a ganar dinero / cómo me pagan / how do I make money” etc. → `unknown` → `clarify_once`.

## Fix

1. Expand recognition in `compensationQuestion.js` (accent/case folded; BR-095), including short-forms (`a como la hora`, `es por salario`, `es pago fijo`, …).
2. Keep routing on existing `COMPENSATION_QUESTION` ahead of scheduling/location/fragment/clarify.
3. Progressive disclosure via `compensationDetailKind`:
   - `hourly_pay_question`
   - `salary_question`
   - `fixed_pay_question`
   - `commission_question`
   - plus `how_much` / `pay_how` / `source` / `general`
4. Answer only the asked subtype; no stacked full compensation dump.
5. Concise canonical answers; no income guarantees / invented amounts.
6. Resume exact pending question (e.g. afternoon `ask_time_preference`).

## Safety

- No guaranteed income, unsupported earnings quotes, “unlimited income”, or fabricated commission %.
- Prefer short truthful structure: production + contract level; details in interview.

## Boundaries

No Railway var changes, no shadow increase, no v2 execution, no WhatsApp/appointment/Calendar/BR-080 writes.

## Tests / simulator

- `backend/test/recruitAiV2CompensationFaqBr104.test.js`
- Scenario: `compensation-faq-during-ask-time`
