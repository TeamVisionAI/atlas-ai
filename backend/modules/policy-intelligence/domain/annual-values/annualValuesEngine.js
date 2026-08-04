/**
 * Annual Values Engine facade (Sprint 4A / BR-060).
 *
 * Extends Policy Intelligence architecture — does NOT modify:
 * Atlas Extract contract redesign, Insurance Facts, Rule Engine,
 * Language Layer, or Recommendations.
 *
 * Pipeline for this engine:
 *   Raw Annual Table → Normalize → Validate → Calculate → Timeline + Metrics
 */

const { normalizeAnnualValuesTable } = require("./normalizeAnnualValuesTable");
const { validateAnnualValuesTimeline } = require("./validateAnnualValuesTimeline");
const { calculateAnnualValueMetrics } = require("./calculateAnnualValueMetrics");
const { ANNUAL_VALUE_FIELDS, createEmptyAnnualValue } = require("./AnnualValue");

/**
 * Analyze a raw illustration annual values table.
 * @param {Array<object>} rows
 * @param {{ reviewId?: string|null, extractionId?: string|null, source?: string }} [options]
 */
function analyzeAnnualValues(rows = [], options = {}) {
  const started = process.hrtime.bigint();
  const { timeline, normalization } = normalizeAnnualValuesTable(rows);
  const validationResults = validateAnnualValuesTimeline(timeline);
  const { summaryMetrics, calculationMetadata } = calculateAnnualValueMetrics(timeline);
  const ended = process.hrtime.bigint();

  return Object.freeze({
    reviewId: options.reviewId || null,
    extractionId: options.extractionId || null,
    source: options.source || "structured_table",
    timeline,
    summaryMetrics,
    validationResults,
    calculationMetadata: Object.freeze({
      ...calculationMetadata,
      normalization,
      totalExecutionTimeMs: Number((Number(ended - started) / 1e6).toFixed(3))
    }),
    meta: Object.freeze({
      engine: "annual_values_engine",
      version: "1.0",
      factsImmutable: true,
      modifiesInsuranceFacts: false,
      modifiesRuleEngine: false,
      ai: false,
      ocr: false
    })
  });
}

function getAnnualValuesCatalog() {
  return {
    engine: "annual_values_engine",
    version: "1.0",
    canonicalFields: ANNUAL_VALUE_FIELDS,
    emptyRow: createEmptyAnnualValue(),
    summaryMetricKeys: [
      "totalPremiumsPaid",
      "totalCostOfInsurance",
      "totalAdministrativeCharges",
      "totalRiderCharges",
      "totalInternalCharges",
      "cashValueAtAge65",
      "cashValueAtAge70",
      "cashValueAtAge80",
      "cashValueAtAge90",
      "breakEvenYear",
      "policyDuration"
    ],
    contracts: {
      missingValuesAreNull: true,
      neverGuessValues: true,
      factsImmutable: true,
      ruleEngineUntouched: true,
      aiUnchanged: true
    }
  };
}

module.exports = {
  analyzeAnnualValues,
  getAnnualValuesCatalog,
  normalizeAnnualValuesTable,
  validateAnnualValuesTimeline,
  calculateAnnualValueMetrics
};
