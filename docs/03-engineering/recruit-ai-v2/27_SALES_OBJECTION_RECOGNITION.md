# Playground Feedback Fix #11 — Sales Objection Recognition (BR-099)

## Root cause

`no se vender` / `no sé vender` matched the location-correction opener `^no\s+`.  
`extractLocationCandidateText` stripped `no`, leaving `vender` / `se vender`, which became partial city `Vender` → “¿En qué estado está Vender?”.

## Fix

- New `sales_objection` intent with kinds: `skill` | `experience` | `aversion`
- Detected before experience FAQ, correction handling, and location parsing
- Concise skill/experience training reassurance; natural aversion acknowledgement (never “esto no es ventas”)
- Resume pending workflow question (e.g. `ask_day_part`)
- Block sales vocabulary in `parseLocationAnswerCore`

## Scenario

`sales-objection-not-location`

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all.
