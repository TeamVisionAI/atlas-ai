# Recruit AI v2 — Work Authorization Status Shorthand (BR-096)

## Problem

When Atlas asks for work authorization / legal documentation, prospects often answer with a short legal status instead of “sí”:

- `residente`
- `ciudadano` / `ciudadana`
- `residente permanente`
- `ciudadano americano` / `ciudadana americana`

These were not recognized as affirmative work-authorization answers unless phrased as fuller sentences.

## Fix

When `lastQuestionAsked === ask_authorization`, treat the status shorthand above as `AUTHORIZED` (after BR-095 normalization).

Also accept pending-auth birthplace affirmatives:

- `nací aquí` / `naci aqui` / `yo nací aquí`
- `nací en Estados Unidos` / `nací en USA`
- `born here` / `I was born here` / `I was born in the US`

These satisfy work authorization, must not re-ask for immigration documents, and must not be reinterpreted as a location answer while auth is pending.

Do **not** require `soy residente` / `soy ciudadano` when the pending question already makes the meaning clear.

Outside the pending-auth turn, bare `residente` / `ciudadano` / birthplace phrases must not invent work authorization.

## Boundaries

Does not enable Recruit AI v2 execution, change shadow/capture, cut over live CE, send WhatsApp, or mutate appointments/Calendar/BR-080.
