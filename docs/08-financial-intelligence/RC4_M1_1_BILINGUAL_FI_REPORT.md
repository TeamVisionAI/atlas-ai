# RC4 M1.1 — Bilingual Financial Intelligence Educational Report

**Status:** Implemented (application code; not deployed by this milestone)
**Depends on:** RC3 FI runtime · RC4 M1 securities access (BR-074) for content boundary
**Branch:** `rc4/fi-bilingual-report`

## Objective

Provide a professional English / Spanish presentation layer for the existing generic FI educational report without recalculating, revising, or unlocking named securities.

## Architecture

| Layer | Responsibility |
|-------|----------------|
| Backend FI engines / APIs | Calculation authority; English stored messages for compatibility |
| `fiReportMessages.js` | EN/ES dictionary; status/scenario/warning localization; locale formatting |
| `LanguageContext` | Selected application language (Meta Review lock unchanged) |
| `DiscussionScenariosSection` | Localized report + print chrome |
| `FinancialIntelligencePanel` | Localized report-adjacent chrome |

Language switch → re-render only. Same `evaluation.id`, `version`, and numeric projection fields.

## Explicit non-claims

- Named fund localization
- Spanish SB-72 access
- Fund recommendations / suitability
- Localized securities catalog
- Invented annual growth-chart series (backend currently returns ending values only)

## Visual polish

Hierarchy: current situation → proposed term → Invest-the-Difference hero → hypothetical cards + relative ending-value bars → safeguards.
Fixture: `frontend/fi-m11-visual-acceptance.html` (not under `/dev`, which Vite proxies to the API).
Evaluation snapshot: `frontend/fi-visual-acceptance-evaluation.json` (engine-computed ending values).
Evidence: `docs/08-financial-intelligence/evidence/m1-1-visual/VISUAL_ACCEPTANCE.md`.

## Tests

- `frontend/src/i18n/fiReportMessages.test.js`
- `backend/test/financialIntelligenceLocaleBoundary.test.js`
- Existing FI display / Meta Review tests remain required
