# BR-090 — Puerto Rico Work Authorization + Fixed-Employment Preference

**Status:** Implemented in Recruit AI v2 (execution remains OFF)  
**Simulator:** `puerto-rico-fixed-employment-real-world`  
**Tests:** `backend/test/recruitAiV2PuertoRicoFixedEmployment.test.js`

## Problem

Real-world WhatsApp pattern (Kissimmee / Puerto Rico origin):

1. Prospect answers work-auth with “Si soy de PR” — v2 did not treat explicit Puerto Rico origin as sufficient authorization.
2. Immediate job FAQ (“De q trata el trabajo?”) must interrupt cleanly (BR-088).
3. “Estoy buscando empleo fijo” is a fit preference, not opt-out / withdraw / compensation FAQ.
4. Reinforced “Por el momento mi enfoque es encontrar trabajo” should politely close without pressure, handoff, or opt-out mutation.

## Rules (summary)

1. Explicit Puerto Rico origin/citizenship statements satisfy work authorization for this recruiting flow.
2. Do not re-ask work permit after a successful PR normalization.
3. Job FAQ outranks pending workflow questions (preserve BR-088).
4. `fixed_employment_preference` ≠ withdraw / opt-out / compensation question.
5. First preference response acknowledges without forcing scheduling.
6. Reinforced non-fit → `current_fit = not_now` + polite terminal closure.
7. No WhatsApp / appointment / Calendar / BR-080 / opt-out writes; flags unchanged.

## Canonical copy

- Preference: `getFixedEmploymentPreferenceMessage`
- Closure: `getCurrentNotFitClosureMessage`
