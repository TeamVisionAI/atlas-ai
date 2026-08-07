# BR-103 — Acknowledgement Semantics + Network Objection

## Problems

1. After Atlas said it would review availability (`Voy a revisar disponibilidad…`), prospect `ok` became `schedule_confirm` + companion-finalize copy — with no concrete appointment proposal.
2. `no conozco a nadie` fell through to generic clarify while scheduling facts were already known.

## Root causes

| Defect | Cause |
|---|---|
| `ok` → confirm | Counteroffer path set `lastQuestionAsked=confirm_slot` even when copy only promised to check availability. Interpreter treated any affirmative + `proposedTime` as confirmation. |
| network fallback | No `network_objection` detector; unknown → clarify_once. |

## Rules

1. **Soft acknowledgement** — `ok` / `perfecto` / `gracias` / `está bien` / EN peers while availability is pending → `soft_acknowledgement`, not `schedule_confirm`.
2. **Confirmation object guard** — `schedule_confirm` only when `hasConfirmableAppointmentProposal` (concrete slot + confirm ask / date+offered menu). “Revisar disponibilidad” is never confirmable.
3. **Lifecycle** — Prefer `awaiting_availability` after preference capture until options are presented.
4. **Network objection** — Recognize contact/network phrases; answer briefly without promising leads/clients/success; preserve modality, day-part, preferred time; resume without re-asking location/auth/day-part/time.
5. **Opposite case** — Concrete “¿Te funciona?” + `ok`/`si` may still confirm.

## Engines

- `schedulingConfirmation.js`
- `networkObjection.js`
- `interpreter.js`, `decisionEngine.js`, `responseRenderer.js`, `teamVisionWorkflowCopy.js`

## Tests

`backend/test/recruitAiV2AckNetworkObjectionBr103.test.js`  
Scenario: `acknowledgement-not-confirmation-network-objection`

## Boundaries

No Railway flag / shadow / execution / WhatsApp / appointment / Calendar / BR-080 changes.
