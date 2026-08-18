/**
 * Illustration extract facade — PDF text → annual rows + riders.
 * BR-060: structured tables only; missing cells stay null.
 * Routes National Life FlexLife II (20417FL) to a dedicated adapter.
 * Nationwide-shaped documents keep the existing ledger parser unchanged.
 */

const { extractPdfTextPages } = require("./extractPdfText");
const {
  parseIulIllustrationTables,
  toAnnualValuesEngineRows
} = require("./parseIulIllustrationTables");
const { parseLivingBenefitRiders } = require("./parseLivingBenefitRiders");
const { parseNationwideLivingBenefitRiders } = require("./parseNationwideLivingBenefitRiders");
const {
  parseNationwidePolicyCosts,
  applyExplicitAnnualCosts
} = require("./parseNationwidePolicyCosts");
const { parseLswPolicyCostTerms } = require("./parseLswPolicyCostTerms");
const { buildReportCheckpoints } = require("./reportCheckpoints");
const {
  ADAPTER_KEYS,
  detectIllustrationAdapter
} = require("./detectIllustrationAdapter");
const {
  parseLswFlexLifeIi20417FL,
  toAnnualValuesEngineRows: toLswAnnualValuesEngineRows
} = require("./adapters/lswFlexLifeIi20417FL");
const { parseLswFlexLifeRiders } = require("./parseLswFlexLifeRiders");

function emptyExtract(reason, pages = [], pageCount = 0) {
  return {
    ok: false,
    reason,
    ocr: false,
    interpolated: false,
    pages,
    pageCount,
    rows: [],
    engineRows: [],
    riders: [],
    policyCostTerms: null,
    surrenderCharges: [],
    reportCheckpoints: [],
    adapterKey: null,
    comparisonScenario: null,
    scenarios: null
  };
}

function extractIllustrationFromPages(pages = [], { pageCount = pages.length } = {}) {
  const adapterKey = detectIllustrationAdapter(pages);

  if (adapterKey === ADAPTER_KEYS.LSW_FLEXLIFE_II_20417FL) {
    const parsed = parseLswFlexLifeIi20417FL(pages);
    const riders = parseLswFlexLifeRiders(pages);
    const engineRows = toLswAnnualValuesEngineRows(parsed.rows);
    const policyCostTerms = parseLswPolicyCostTerms(pages, parsed);
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
      pageCount,
      adapterKey,
      issuer: parsed.issuer,
      product: parsed.product,
      baseForm: parsed.baseForm,
      scenario: parsed.scenario,
      comparisonScenario: parsed.comparisonScenario,
      scenarios: parsed.scenarios,
      rows: parsed.rows,
      engineRows,
      riders,
      policyCostTerms,
      surrenderCharges: parsed.surrenderCharges,
      surrenderMechanics: parsed.surrenderMechanics,
      candidateRowCount: parsed.candidateRowCount,
      reportCheckpoints,
      source: "pdf_text_table"
    };
  }

  const parsed = parseIulIllustrationTables(pages);
  const riders = parseNationwideLivingBenefitRiders(pages);
  const policyCostTerms = parseNationwidePolicyCosts(pages);
  const engineRows = applyExplicitAnnualCosts(
    toAnnualValuesEngineRows(parsed.rows),
    policyCostTerms
  );
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
    pageCount,
    adapterKey,
    scenario: parsed.scenario,
    comparisonScenario: parsed.scenario,
    scenarios: null,
    rows: parsed.rows,
    engineRows,
    riders,
    policyCostTerms,
    surrenderCharges: parsed.surrenderCharges,
    reportCheckpoints,
    candidateRowCount: parsed.candidateRowCount,
    source: "pdf_text_table"
  };
}

async function extractIllustrationFromPdf(buffer) {
  const textResult = await extractPdfTextPages(buffer);
  if (!textResult.hasText) {
    return emptyExtract(textResult.reason || "no_extractable_text", textResult.pages, textResult.pageCount);
  }

  return extractIllustrationFromPages(textResult.pages, { pageCount: textResult.pageCount });
}

module.exports = {
  extractIllustrationFromPdf,
  extractIllustrationFromPages,
  extractPdfTextPages,
  parseIulIllustrationTables,
  parseLivingBenefitRiders,
  parseNationwideLivingBenefitRiders,
  parseNationwidePolicyCosts,
  parseLswFlexLifeIi20417FL,
  parseLswFlexLifeRiders,
  buildReportCheckpoints,
  toAnnualValuesEngineRows,
  detectIllustrationAdapter,
  ADAPTER_KEYS
};
