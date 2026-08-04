/**
 * Attach Insurance Language Layer analysis to extraction payloads (Sprint 2).
 * Implements BR-057 / BR-058.
 */

const { analyzeInsuranceLanguage } = require("../domain/insurance-language/languageLayer");

/**
 * Enrich extracted_data with immutable facts + derived findings/recommendations.
 * Client-supplied findings/recommendations are ignored (not facts).
 */
function enrichExtractionWithLanguageLayer(extractedData, { extractionId = null } = {}) {
  const analysis = analyzeInsuranceLanguage(extractedData, { extractionId });

  return {
    extractedData: {
      ...extractedData,
      // Derived layers — not Atlas Extract fact fields
      insuranceFacts: analysis.insuranceFacts,
      findings: analysis.findings,
      recommendations: analysis.recommendations,
      ruleExecution: analysis.execution,
      languageLayer: analysis.meta
    },
    analysis
  };
}

module.exports = {
  enrichExtractionWithLanguageLayer
};
