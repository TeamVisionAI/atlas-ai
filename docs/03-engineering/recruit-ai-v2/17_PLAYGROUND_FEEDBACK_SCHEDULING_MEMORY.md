# Playground Feedback Fix #6 — Scheduling Memory & Meeting Logistics (BR-087)

## Root causes

1. **Modality → scheduling reset** — After `PROVIDE_MEETING_PREFERENCE` / `CONFIRM_IN_PERSON_TRAVEL`, the decision engine hard-set `lastQuestionAsked: ask_day_part` and day-part templates even when `proposedTime` / `availabilityConstraint` / `proposedDate` were already known. Context merge preserved facts; the conversational path discarded them.
2. **Zoom-link miss** — No v2 intent for meeting-access / Zoom-link logistics; “¿Me puedes mandar el link?” fell through to generic clarification.
3. **Redundant day-part ask** — Pending-question / post-modality resume did not check durable scheduling dimensions before asking morning/afternoon.
4. **Companion withdraw closure** — Withdraw templates invited a teammate to reopen the process after an explicit change-of-mind.

## Fix

- `schedulingMemory.js` — independent dimensions; post-modality resume; Zoom-link resolution via BR-076 `pickApprovedZoomUrl`; repetition / meeting-access detectors.
- Modality change preserves availability, proposed date, and proposed time; confirms existing slot instead of day-part reset.
- Explicit Zoom clears office; OUTSIDE in-person travel confirm still required (BR-085).
- Meeting-access intent: never fabricate URLs; unconfirmed → explain link after confirmation; confirmed → canonical URL proposal or pending (BR-076); share side effect denied.
- “ya te dije” / “I already told you” → acknowledge known fact; ask only for missing information.
- Clean withdraw copy — no companion-reopen sentence; still distinct from STOP (BR-086).

## Customer copy (examples)

- After Doral travel OK with known Tue 6:30: confirm office + slot (not day-part).
- After “mejor Zoom”: Zoom + confirm same slot.
- Unconfirmed Zoom link: share after confirmation + resume slot.
- Withdraw: “Entiendo. Cancelamos el proceso por ahora. Gracias por avisarnos.”

## Boundaries

Production posture unchanged: context capture / shadow / execution flags not modified; SideEffectAuthorizer deny-all; no WhatsApp / appointment / Calendar / BR-080 writes.
