# RC4 M1.1 — Visual acceptance report (final checkpoint)

**Date:** 2026-08-04
**Package rule:** This directory packages **only** evidence rendered from backend evaluation
`fi-eval-visual-m11-001` **version 3**. No invented, interpolated, or non-backend growth figures are included.

## Accepted evaluation

| Field | Accepted value |
|-------|----------------|
| Evaluation ID | `fi-eval-visual-m11-001` |
| Version | `3` |
| Monthly difference | **$56.08** |
| 4% ending value | **$28,832.39** |
| 7% ending value | **$45,428.82** |
| 10% ending value | **$74,408.82** |
| Total contributions | $16,824.00 |
| Investment horizon | 25 years |
| Scenario emphasis | `canEmphasizeInvestmentScenario: false` |

**Source artifacts**

- Snapshot: `evaluation-snapshot.json` (parity with `frontend/fi-visual-acceptance-evaluation.json`)
- Fixture: `frontend/fi-m11-visual-acceptance.html`
- Capture metadata: `capture-results.json`

## Projection visualization

Backend returns ending values only. The UI shows:

1. Three equal hypothetical scenario cards
2. Relative comparison bars scaled **only** from backend `illustrativeProjectedValue` fields above

No annual series is invented or interpolated in the frontend.

## Packaged view artifacts (all from `fi-eval-visual-m11-001` v3)

| View | Artifact | Result |
|------|----------|--------|
| English desktop | `en-desktop.png` | Pass |
| Spanish desktop | `es-desktop.png` | Pass |
| English mobile | `en-mobile.png` | Pass |
| Spanish mobile | `es-mobile.png` | Pass |
| English tablet | `en-tablet.png` | Pass |
| Spanish tablet | `es-tablet.png` | Pass |
| English print | `en-print.pdf`, `en-print-preview.png` | Pass |
| Spanish print | `es-print.pdf`, `es-print-preview.png` | Pass |

Capture log confirms for every screen view:

`evaluationId=fi-eval-visual-m11-001 · version=3 · monthlyDifference=56.08 · endingValues=28832.39|45428.82|74408.82`

## Confirmations

| Check | Result |
|-------|--------|
| Numeric parity with accepted values | Pass |
| Relative bars use backend ending values only | Pass |
| Visual parity EN/ES | Pass |
| No securities leakage | Pass |
| Spanish wraps without clipping | Pass |
| Disclosures / replacement / handoff readable | Pass |
| No frontend calculation authority | Pass |
| Language change does not create FI revision | Pass |
| No preferred-scenario emphasis | Pass |

## Remaining limitations

1. No multi-year growth chart until backend supplies annual projection points.
2. Browser print headers/footers depend on user print-dialog settings.
3. Re-spot-check inside the live PI shell after deploy with an org-persisted evaluation row.
