/**
 * Illustration extract facade — PDF text → annual rows + riders.
 * BR-060: structured tables only; missing cells stay null.
 */

const { extractPdfTextPages } = require("./extractPdfText");
const {
  parseIulIllustrationTables,
  toAnnualValuesEngineRows
} = require("./parseIulIllustrationTables");
const { parseLivingBenefitRiders } = require("./parseLivingBenefitRiders");
const { buildReportCheckpoints } = require("./reportCheckpoints");

async function extractIllustrationFromPdf(buffer) {
  const textResult = await extractPdfTextPages(buffer);
  if (!textResult.hasText) {
    return {
      ok: false,
      reason: textResult.reason || "no_extractable_text",
      ocr: false,
      pages: textResult.pages,
      pageCount: textResult.pageCount,
      rows: [],
      engineRows: [],
      riders: [],
      surrenderCharges: [],
      reportCheckpoints: []
    };
  }

  const parsed = parseIulIllustrationTables(textResult.pages);
  const riders = parseLivingBenefitRiders(textResult.pages);
  const engineRows = toAnnualValuesEngineRows(parsed.rows);
  const reportCheckpoints = buildReportCheckpoints(parsed.rows).map((point) => ({
    requestedYear: point.requestedYear,
    usedYear: point.usedYear,
    fallback: point.fallback,
    fallbackStep: point.fallbackStep
  }));

  return {
    ok: parsed.rows.length > 0,
    reason: parsed.rows.length > 0 ? null : "no_annual_ledger_rows",
    ocr: false,
    interpolated: false,
    pageCount: textResult.pageCount,
    scenario: parsed.scenario,
    rows: parsed.rows,
    engineRows,
    riders,
    surrenderCharges: parsed.surrenderCharges,
    candidateRowCount: parsed.candidateRowCount,
    reportCheckpoints,
    source: "pdf_text_table"
  };
}

module.exports = {
  extractIllustrationFromPdf,
  extractPdfTextPages,
  parseIulIllustrationTables,
  parseLivingBenefitRiders,
  buildReportCheckpoints,
  toAnnualValuesEngineRows
};
