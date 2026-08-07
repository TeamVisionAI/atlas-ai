# Affirmative-Prefix Work Authorization (BR-100)

## Defect

Pending `ask_authorization`, prospect says `si soy ciudadano`.

BR-096 recognized bare / `soy …` status forms, but not natural affirmative-prefix variants. Parse returned `null`, interpreter fell through to `schedule_confirm` / companion handoff copy (“Un compañero finalizará…”).

## Fix

While `ask_authorization` is pending, optional affirmative discourse markers (`sí`/`si`/`claro`/`correcto`/`yes`/`yeah`) before an already-recognized BR-096 status (or birthplace affirmative) still satisfy work authorization.

Negatives outrank superficial affirmatives (`sí, pero no tengo permiso`). Ambiguous visa (`si tengo visa`) still does not auto-authorize.

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all.
