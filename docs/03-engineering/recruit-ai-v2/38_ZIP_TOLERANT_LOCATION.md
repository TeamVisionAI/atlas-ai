# Recruit AI v2 — ZIP-tolerant location parsing (BR-217)

## Problem

Perssy (`+13057633125`) answered the location ask with `Hialiah florida 33010`. `parseLocationAnswer` returned null. Atlas sent generic `clarify_once` instead of the work-authorization question.

## Root cause

`parseCityStatePhrase` treated the last token as the state. `33010` is not a state, so the whole phrase failed. The bare-city path already folded `Hialiah` → `hialeah`; the city+state complete path did not use that fold.

## Fix

- Strip trailing US ZIP / ZIP+4 before city/state split.
- Preserve ZIP on the parse result and `knownFacts.zip`.
- Reuse BR-173 `resolveCanonicalCityKey` in `buildCompleteLocation`.
- City + state remain sufficient; ZIP is optional.

## Out of scope — reconstructed context identity

Read-only production audit also found V2 context `5674494c-c84f-4ed5-b36c-2f2a863933e2` reconstructed under orphan `prospect_id` `ad96bb53-b57c-43ba-b3c2-f0b7267d88ac` while Perssy’s live row is `502b6f9d-83df-4283-bf18-81948f07506d`. That binding bug is not required for the ZIP parse fix. Audit separately; do not fold it into BR-217.

## Tests

`backend/test/recruitAiV2ZipTolerantLocationBr217.test.js`

## Boundaries

No ownership, WhatsApp eligibility, BR-215/216, or production data writes.
