# Playground Feedback Fix #9 — Concise First-Level Job FAQ (BR-097)

## Defect

Prospect asks a first-level question such as `de que se trata` / `what is this about`, and Recruit AI v2 answers with a stacked caveat dump (financial services + not salaried/hourly + no experience + interview decision framing) before resuming scheduling.

## Rule

Answer only the level of detail asked. First-level overview questions get a short description, then resume the pending workflow question. Specific asks (salary, experience, license, insurance, “is this a job?”) keep their dedicated FAQ copy.

## Canonical first-level copy

- **ES:** `Es una oportunidad en servicios financieros. Te explicamos todos los detalles en la entrevista.` + pending question
- **EN:** `It's an opportunity in financial services. We'll explain all the details during the interview.` + pending question

## Implementation

- `conversationContinuity.js` — `looksLikeJobOverviewQuestion` (subset of job/opportunity intent)
- `interpreter.js` — `entities.jobFaqDetailLevel = overview | employment_framing`
- `decisionEngine.js` — template `job_overview_faq_then_resume` + reason codes
- `teamVisionWorkflowCopy.js` — `getJobOverviewFaqAnswer`
- `responseRenderer.js` — compose overview + resume without “Por cierto” bridge

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all; no WhatsApp / appointment / Calendar / BR-080 writes; BR-088 FAQ priority preserved.
