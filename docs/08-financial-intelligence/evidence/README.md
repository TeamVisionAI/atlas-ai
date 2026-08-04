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
