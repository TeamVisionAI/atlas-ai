# Team Vision Happy Path v1.0

Official source of truth for the Team Vision WhatsApp recruiting conversation flow.

**Implementation:** Semantic Conversation Engine + Qualification Brain (`informationModel.js`)

**Business rules reference:** `docs/06-business/BUSINESS_RULES.md` (BR-018–BR-024)

---

## Happy Path Flow

```
Greeting
  ↓
Ask City / State
  ↓
If city is recognized (e.g. Miami)
  → Infer state automatically (FL)
  → Do NOT ask for state
  ↓
If city is not recognized
  → Ask for state
  ↓
Ask work authorization
  "¿Tienes permiso de trabajo o documentación legal para trabajar en Estados Unidos?"
  ↓
Determine interview type (automatic — BR-019 / BR-020)
  • Local coverage → In Person (office)
  • Outside coverage → Zoom
  ↓
Ask day part preference
  "¿Prefieres en la mañana o en la tarde?"
  ↓
Retrieve available interview times (Capacity Engine)
  ↓
Prospect selects interview time (+ confirms slot)
  ↓
Ask full name
  "¿Cuál es tu nombre completo?"
  ↓
Ask email (optional)
  "¿Cuál es tu correo electrónico para enviarte la confirmación de la entrevista?"
  ↓
Create Google Calendar event
  ↓
ONLY IF calendar creation succeeds
  ↓
Send WhatsApp confirmation (always)
  ↓
If email was provided
  → Google Calendar invitation / email confirmation
  ↓
Conversation completed
```

---

## Field Order

Qualification Brain canonical order (`informationModel.FIELD_ORDER`):

```
city → state → authorization → interviewType → dayPart → schedule → name → email
```

| Field | Required | Notes |
|-------|----------|-------|
| `city` | Yes | First location question |
| `state` | Conditional | Skipped when city maps to a known state |
| `authorization` | Yes | Hard stop if denied |
| `interviewType` | Auto | Applied by business rules when location + auth complete |
| `dayPart` | Yes | Morning or afternoon |
| `schedule` | Yes | Capacity-backed slot selection |
| `name` | Yes | Collected **after** time is selected |
| `email` | No | Always offered once after name; may be skipped |

---

## Business Rules

1. **One question at a time** — Qualification Brain `nextField` drives each turn.
2. **Never ask duplicate questions** — `QUAL_CAPTURE` explicit capture flags prevent re-asking.
3. **Name after schedule** — `name` is gated until `appointment_date` and `interview_time` exist.
4. **Email after name** — `email` step begins only after name is explicitly captured.
5. **Email is optional** — Declining or skipping email does not block scheduling.
6. **WhatsApp confirmation always sent** — After successful calendar booking via `buildBookingConfirmation()`.
7. **Calendar before confirmation** — `completeInterview()` creates the calendar event first; confirmations are sent only on success.
8. **Calendar failure recovery** — Failed booking releases the capacity slot and returns the prospect to scheduling.
9. **Short, natural responses** — Avoid repetitive acknowledgements ("Entendido", "Sin problema"). Prefer "Excelente.", "Perfecto.", "Gracias.", or no acknowledgement.

---

## Confirmation Policy

| Channel | When | Condition |
|---------|------|-----------|
| Google Calendar event | Before any confirmation | Always attempted in `completeInterview()` |
| WhatsApp text | After calendar success | Always — `teamVisionWorkflowCopy.buildBookingConfirmation()` |
| Email / calendar invite | After calendar success | Only when prospect provided a valid email |

---

## Email Policy

- Email is **offered once** after full name is collected.
- Valid email → stored in `EMAIL:` notes token + calendar attendee.
- Decline patterns (`no`, `no tengo correo`, `prefiero no`, `skip`, etc.) → step marked complete, scheduling continues.
- Interview is **always scheduled** when the slot, name, and email step (provide or skip) are complete.

---

## Exception Summary

| Scenario | Behavior |
|----------|----------|
| Authorization denied | Terminal message; no scheduling |
| Ambiguous authorization | Human handoff |
| Outside-area in-person request | Human coordinator (BR-022) |
| Local prospect requests Zoom | Allowed immediately (BR-021) |
| FAQ mid-flow | Answer + re-ask current field |
| Calendar API failure | Release slot, ask to pick another time |
| Already confirmed | Static confirmation reply |
| Seeded simulator/DB data | `QUAL_CAPTURE` prevents bypassing explicit capture |

---

## Architecture Notes

- **Orchestrator:** `semanticConversationEngine.js`
- **State machine:** `informationModel.js` + `qualificationCaptureState.js`
- **Scheduling:** `interviewScheduling.js` + `capacityEngine.js` (FreeBusy deferred to future sprint)
- **Copy:** `teamVisionWorkflowCopy.js`
- **Calendar:** `calendarService.createInterview()` (WhatsApp path)
- **Workflow hooks:** Unchanged — `onConversationProgress`, `onInterviewScheduled`

---

## Related Verification

```bash
node backend/dev/verifySprint21_4.js
node backend/dev/verifySprint21_3.js
```
