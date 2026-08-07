# Playground Feedback Fix #7 — Intent Priority & Contextual Continuity (BR-088)

## Root causes

1. **Job-question miss** — `looksLikeOpportunityQuestion` did not match “Esto es un trabajo” / “¿Esto es un trabajo?” / “Is this a job?”, so intent fell through to `unknown`.
2. **Job → time-unavailable collision** — Repeated unknowns escalated to `safe_uncertain_escalate`, and the renderer remapped non-human escalate templates to `offer_alternatives_no_handoff` (“Esa hora puede no estar disponible…”).
3. **“mañana” dead-end** — Day-part was recognized correctly, but `PROVIDE_DAY_PART` rendered bare `continue_after_day_part` (“Gracias — anotado. Continuemos.”) without the next scheduling question.
4. **“continuemos con qué?” generic clarify** — No meta-conversation intent; unknown → `clarify_once`.

## Fix

- `conversationContinuity.js` — job/opportunity detector, meta-conversation detector, day-part continuation, pending-question explanation.
- FAQ/business intents outrank scheduling parsing; `job_opportunity_question` answers with non-guaranteed financial-services opportunity copy, then resumes pending state.
- Context-sensitive “mañana”: day-part ask → morning; date ask → tomorrow.
- Day-part answers advance to a time question (no empty Continuemos).
- Uncertain escalate without `requiresHuman` remaps to clarify-once, not scheduling alternatives.

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all; no WhatsApp / appointment / Calendar / BR-080 writes.
