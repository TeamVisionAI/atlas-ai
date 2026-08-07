# Day-Part Context Priority for “mañana” + Hour Inheritance (BR-101)

## Clarification

When the local calendar day is Friday, interpreting bare “mañana” as Saturday can be mechanically correct as *tomorrow*. The defect is **context priority**, not the calendar.

## Defect

Pending:
`¿Prefieres en la mañana o en la tarde?` (`ask_day_part`)

Prospect:
`en la mañana` / `en la manana`

Incorrectly resolved as date-tomorrow (Saturday) because:
1. `parseDayPart` recognized `por la mañana` but not `en la mañana`
2. `shouldTreatAsDateOnlyProposal` only suppressed mañana→tomorrow when `parseDayPart` already completed

Also: with `preferredDayPart = morning`, bare `10` still asked AM/PM because morning was not treated as meridiem context.

## Fix

- Pending `ask_day_part` outranks generic mañana=tomorrow (unless date is the pending ask or explicit date framing).
- Recognize `en la mañana` / `por la mañana` / bare `mañana` as morning day-part.
- Confirmed day-part inherits meridiem for bare hours (`morning`+`10`→10:00, `afternoon`+`3`→15:00) without AM/PM clarification.

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all.
