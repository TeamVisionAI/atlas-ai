# Recruit AI v2 — City-State Abbreviation Normalization (BR-094)

## Problem

Playground / pending-location replies like `miami fl` were classified as `ambiguous_fragment` (short two-word scrap) before city/state parsing ran. Atlas then rendered the generic Spanish clarify copy instead of confirming Miami, Florida and advancing to work authorization.

## Root cause

1. `looksLikeAmbiguousFragment` treated length ≤ 8 two-word phrases as fragments.
2. `miami fl` is exactly length 8, so it never reached `parseLocationAnswer` in the interpreter branch order.
3. The space-separated state regex only listed a small subset of USPS codes / names.

## Fix (BR-094 + BR-095)

- Canonical USPS name/abbreviation map in `locationFacts.js` (`US_STATE_NAME_TO_ABBR`).
- `normalizeStateToken` accepts only known postal codes / state names (not arbitrary two-letter scraps).
- `parseCityStatePhrase` handles comma/no-comma, multi-word cities, and multi-word state names.
- Interpreter / fragment guard skips complete city+state phrases.
- Shared BR-095 `inputNormalization.js` supplies comparison text so `MIAMI FL` / `Miami, FL` / `miami fl` match equivalently without rewriting the raw transcript.
- Preserve BR-082: city-only stays partial; `FL` alone is state-only; regional phrases like `South Florida` are not `city = South`.

## Scenario

`city-state-abbreviation-normalization` in `recruitAiV2ScenarioDefinitions.js`.

## Tests

`backend/test/recruitAiV2PlaygroundFeedbackFix8.test.js`

## Boundaries

Does not change Railway variables, shadow/capture rates, Recruit AI v2 execution, live CE cutover, WhatsApp templates, appointments, Calendar, or BR-080.
