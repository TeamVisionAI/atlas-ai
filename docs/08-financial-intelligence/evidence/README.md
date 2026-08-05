# FI print evidence (fixture)

Generated from `frontend/dev/fi-print-evidence.html` using Chrome headless print-to-PDF.

| Artifact | Notes |
|----------|--------|
| `fi-print-evidence.pdf` | Browser print PDF — **2 pages** |
| `fi-print-evidence.pdf.png` | Quick Look thumbnail of the PDF |

## Observed in fixture PDF

- Page 1 begins with **Financial Intelligence** / discussion-scenario title (not PI chrome).
- Application chrome strings in the fixture (`SIDEBAR MUST NOT PRINT`, tabs, forms, meta bar) are not present in the printed layout.
- Comparison, Invest-the-Difference, and projection cards print.
- Remaining safeguards/disclaimers continue on page 2 (no forced blank leading pages).

## Production verification (required)

After deploy, open a live discussion scenario and use browser Print → Save as PDF. Confirm:

1. Page 1 starts with the FI title.
2. No sidebar, tabs, review dropdown, or forms.
3. Projections, missing-information, replacement safeguards, and educational disclaimers are all present.
4. No blank leading pages; no clipped sections.

## Bilingual print (RC4 M1.1)

With the application language set to Spanish, print must show Spanish titles, labels, disclosures, replacement safeguards, and registered-representative handoff, while preserving the same evaluation version and numeric values. Unverified users must not see fund names or tickers in either language.

## M1.1 visual acceptance

Final visual-polish checkpoint artifacts live in `m1-1-visual/`.

**Package only** evidence from backend evaluation `fi-eval-visual-m11-001` version `3`:

- Monthly difference: `$56.08`
- Ending values: `$28,832.39` (4%), `$45,428.82` (7%), `$74,408.82` (10%)

Do **not** stage or ship prior visual evidence that used invented or interpolated growth figures.

| Artifact | Notes |
|----------|--------|
| `PACKAGE_MANIFEST.md` | Explicit include/exclude list for this package |
| `VISUAL_ACCEPTANCE.md` | Structured pass/fail report for EN/ES desktop, mobile, print |
| `evaluation-snapshot.json` | Backend-engine evaluation used for evidence |
| `en-desktop.png` / `es-desktop.png` | Desktop screenshots |
| `en-mobile.png` / `es-mobile.png` | Mobile screenshots |
| `en-tablet.png` / `es-tablet.png` | Tablet screenshots |
| `en-print.pdf` / `es-print.pdf` | Print PDFs |
| `en-print-preview.png` / `es-print-preview.png` | Print-media screenshots |
| `capture-results.json` | Automated capture metadata |

Live fixture (not under Vite’s `/dev` API proxy): `frontend/fi-m11-visual-acceptance.html`.
