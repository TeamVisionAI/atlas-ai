# Playground Feedback Fix #10 — FAQ Routing Priority (BR-098)

## Root causes

1. **Experience → location** — No `experience_question` intent. BR-095 comparison text `necesito experiencia` fell through to permissive multi-word city parsing → `city = "Necesito Experiencia"`.
2. **Insurance detector → routing miss** — `looksLikeInsuranceQuestion` required a literal `?` for Spanish `seguros` matches, but the interpreter matches on BR-095 `comparisonText` with punctuation stripped (`es de seguros`). Detector returned true on raw text and false on the text used for routing.

## Fix

- Add `experience_question` + concise experience FAQ copy; resume pending workflow question.
- Make insurance detection punctuation-tolerant and expand Spanish/English insurance FAQ shapes.
- Keep FAQ/business intents ahead of location/name/fragment handling; block FAQ vocabulary in `parseLocationAnswerCore`.
- Simulator scenario: `faq-priority-experience-insurance`.

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all; no WhatsApp / appointment / Calendar / BR-080 writes.
