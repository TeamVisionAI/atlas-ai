# BR-102 — Partial-State Location + After-Time Scheduling

## Problem

Playground regressions after BR-101:

1. **State-only location** — Prospect answers `florida` to “¿en qué ciudad y estado vives?” and Atlas falls through to generic clarification instead of retaining Florida and asking only for the city.
2. **After-time constraint** — Under `ask_time` with afternoon day-part, `despues de la 5` falls through to the same generic clarification instead of an after-5 PM availability constraint.

## Root causes

| Defect | Cause | Kind |
|---|---|---|
| `despues de la 5` | `parseAvailabilityConstraint` matched `despues de las` (plural) and bare `despues de`, but **not** singular `despues de la`. Also missing `a partir de` / `luego de`. Bare `after 5` was intentionally excluded. | **Missing variants** (not a BR-084 engine regression) |
| `florida` state-only | `parseLocationAnswer` already returned `completeness=state_only`, but the interpreter only accepted state-only when a **city was already known**. Decision engine had no `ask_city` path. | **Missing context path** for state-first partial location |

## Rules

1. **State-only partial** — Valid U.S. state / DC tokens while location is pending → retain `state`, `city=null`, `stateCertainty=partial`, ask city in that state (“¿En qué ciudad de Florida vives?”).
2. **City completes state** — After state-only, a city answer that is compatible with the retained state completes `city+state` (e.g. Florida → Miami → Miami, FL).
3. **City-only unchanged** — Bare `Miami` without prior state still proposes Florida confirmation (BR-094).
4. **New York** — `New York` alone remains state-only NY; do not invent New York City.
5. **After-time variants** — At minimum recognize `despues de la 5` / `las 5` / `a partir de` / `luego de` / English `after 5` forms as `availability_constraint` with `earliestTime=17:00` (PM bias).
6. **No invent** — Constraints do not invent dates, do not ask AM/PM when PM is resolved, do not hand off, do not execute side effects.
7. **Bare affirmation** — `isAffirmative` is exact bare tokens only so `si soy ciudadano` cannot become `schedule_confirm` via a leading `si`.
8. **Acknowledgement stacking** — Renderer collapses consecutive equivalent acknowledgements (`Perfecto` / `Gracias` / `Excelente` / EN peers) to one natural opener. Informational sentences are preserved.

## Engines

- `schedulingConstraints.js` — after-time variant expansion
- `interpreter.js` — state-only provide_location; city-after-state completion; bare affirmative tighten
- `decisionEngine.js` / `contextTurnUpdate.js` / `responseRenderer.js` — `ask_city` path
- `locationFacts.js` — `stateDisplayName` for all USPS codes
- `acknowledgementStyle.js` — redundant acknowledgement collapse

## Tests

`backend/test/recruitAiV2PartialStateAfterTimeBr102.test.js`

## Boundaries

No Railway flag changes, no shadow increase, no v2 execution, no WhatsApp / appointment / Calendar / BR-080 writes.
