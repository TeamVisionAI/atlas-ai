# Recruit AI v2 — Playground Feedback Fix #3

**Rule:** BR-083 — Recruit AI Qualification Fact Separation and Specific FAQ Resolution  
**Status:** Implemented (v2 advisory/shadow/playground pipeline only; execution OFF)  
**Simulator:** `license-confusion-orlando-faq-flow`

## Defect conversation

1. Hola → Orlando → sí  
2. sí, tengo licencia → treated as work authorization yes  
3. Office day-part in Doral despite Orlando  
4. “Is this insurance?” / “Do I need a license?” → generic value-prop only  
5. “How much money do I make?” → clarify_once  
6. Prospect had to discover Zoom manually

## Root causes

1. **Work-auth / license collision** — Auth yes heuristics treated `sí` + `tengo` as authorization even when the noun was `licencia`.
2. **Generic license ambiguity** — No clarification path for driver vs professional financial license.
3. **Insurance FAQ** — Collapsed into `opportunity_question` / generic servicios financieros copy.
4. **License FAQ** — Same collapse; no `license_requirement_question` intent.
5. **Compensation failure** — Pay/salary/commission not recognized → `clarify_once`.
6. **Orlando/Doral modality** — Post-auth always used local office day-part template; ignored BR-019/020 coverage (`OUTSIDE` → Zoom).

## Fixes

- `qualificationFacts.js` — independent workAuthorization vs financialLicense models
- Ambiguous license → `clarify_license_type`; then re-ask work auth separately
- Specific FAQ intents + canonical FAQ copy (insurance / license / compensation)
- `evaluateCoverage` after auth → `outside_zoom_day_part` vs office day-part
- Zoom preference captured without skipping unresolved work auth
- Pending FAQ resume honors `clarify_license_type` / `ask_authorization` / day-part
- Accented `sí` confirmation fixed (JS `\b` + accent bug)
- Time mentions during unresolved qualification do not escalate counteroffer loops

## Production posture (unchanged)

- Context capture 100% Team Vision  
- Shadow 10% Team Vision  
- v2 execution OFF  
- Live CE authoritative  
- sideEffectAuthorizer deny-all  
