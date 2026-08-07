# Recruit AI v2 — Deterministic Input Normalization (BR-095)

## Purpose

WhatsApp typing varies in case, accents, punctuation, and whitespace. Recruit AI v2 interpretation must classify equivalent semantics the same way without mutating the original inbound message.

## Forms

| Field | Role |
|---|---|
| `rawText` | Exact inbound string (audit / transcript) |
| `trimmedText` | Leading/trailing trim only |
| `normalizedText` | Softened separators + lowercase |
| `accentFoldedText` / `comparisonText` | Accent-stripped form used for matching |
| `tokens` | Whitespace-split comparison tokens |

Module: `backend/core/recruitAiV2/inputNormalization.js`

## Rules

1. **Interpretation only** — Never rewrite persisted transcript / original message.
2. **Case / accent / punctuation / whitespace tolerance** for matching.
3. **Preserve semantic ambiguity** — e.g. BR-088 `manana`/`mañana` day-part vs tomorrow from pending-question context; do not globally force every `si` to affirmative outside existing detectors.
4. **No fuzzy inventing** — No edit-distance / autocorrect of arbitrary words.
5. **Reuse** — Interpreter and location parsing consume the shared utility instead of one-off regex patches per domain.

## Related

- BR-094 city/state abbreviation normalization uses this layer for `miami fl` / `MIAMI FL` / `Miami, FL` equivalence.
- BR-086 / BR-091 / BR-088 detectors use `normalizeIntentText` (comparison form).
