# License Requirement Intent Precision (BR-089)

## Root cause

`looksLikeLicenseRequirementQuestion` only matched a narrow EN/ES set (`necesito licencia`, `do I need a license`).  
Spanish **“¿Tengo que tener licencia?”** fell through to `parseLicenseStatement`, which treated any license mention as generic ambiguous possession → `ambiguous_license_statement`.

That overwrote pending day-part with `clarify_license_type`, so a later **“mañana”** could resolve as tomorrow instead of morning.

## Fix

- Expand requirement-question detection (tengo que / hay que / obligatorio / need to be licensed / etc.).
- `parseLicenseStatement` returns `null` for requirement questions.
- Clear absence (“No tengo licencia”) is a status statement (`NONE`), not type-ambiguity.
- Reserve `ambiguous_license_statement` for genuine fragments (“licencia”, “lo de la licencia”) and unclear possession (“Tengo licencia”).
- License FAQ resumes pending day-part via existing `buildFaqResumeDecision`.

## Boundaries

Production posture unchanged; SideEffectAuthorizer deny-all; no WhatsApp / appointment / Calendar / BR-080 writes.
