/**
 * Insurance Language Layer facade (Sprint 2 + Sprint 3 Rule Engine).
 *
 * Frozen pipeline (BR-057):
 *   Atlas Extract → Insurance Facts → Business Rules → Findings → Recommendations → AI Narrative
 */

const { getVocabularySnapshot, mapToAtlasTerm } = require("./insuranceVocabulary");
const {
  buildInsuranceFactsFromExtract,
  assertInsuranceFactsImmutable,
  readInsuranceFacts,
  FACT_SOURCE
} = require("./InsuranceFacts");
const {
  evaluateInsuranceBusinessRules,
  executeInsuranceBusinessRules
} = require("./insuranceBusinessRulesEngine");
const {
  buildRecommendationsFromFindings,
  listRecommendationCatalog
} = require("./Recommendations");
const { listFindingCatalog } = require("./Findings");
const {
  listPolicyIntelligenceRules,
  RULE_CATEGORIES
} = require("./rule-engine/policyIntelligenceRuleEngine");
const { DEFAULT_RULE_THRESHOLDS } = require("./rule-engine/ruleThresholds");

/**
 * Run the full deterministic language-layer analysis for an extraction payload.
 * Implements BR-057 / BR-058 / BR-059.
 */
function analyzeInsuranceLanguage(extractedData, { extractionId = null, thresholds = null } = {}) {
  const insuranceFacts = buildInsuranceFactsFromExtract(extractedData, { extractionId });
  assertInsuranceFactsImmutable(insuranceFacts);

  const execution = executeInsuranceBusinessRules(insuranceFacts, { thresholds });
  const findings = execution.findings;
  // BR-057: recommendations generated from Findings only (catalog mapping).
  const recommendations = buildRecommendationsFromFindings(findings);

  return Object.freeze({
    pipeline: Object.freeze([
      "insurance_facts",
      "business_rules",
      "findings",
      "recommendations",
      "ai_narrative"
    ]),
    insuranceFacts,
    findings,
    recommendations,
    execution: execution.execution,
    meta: Object.freeze({
      factsSource: FACT_SOURCE.ATLAS_EXTRACT,
      factsImmutable: true,
      findingsSource: "policy_intelligence_rule_engine",
      recommendationsSource: "findings",
      aiMayModifyFacts: false,
      businessRulesMayModifyFacts: false,
      ruleEngineVersion: execution.execution.version,
      rulesExecuted: execution.execution.rulesExecutedCount,
      rulesTriggered: execution.execution.rulesTriggeredCount,
      executionTimeMs: execution.execution.executionTimeMs
    })
  });
}

/**
 * AI-safe package: Facts + Findings only (BR-057).
 */
function buildAiLanguageContext(analysis, { reviewId = null } = {}) {
  const facts = readInsuranceFacts(analysis.insuranceFacts);

  return Object.freeze({
    boundary: "ai_insurance_language",
    reviewId: reviewId || null,
    mayModifyFacts: false,
    mayCreateFacts: false,
    insuranceFacts: facts,
    findings: analysis.findings,
    recommendationsIncluded: false
  });
}

function getLanguageLayerCatalog() {
  return {
    vocabulary: getVocabularySnapshot(),
    findings: listFindingCatalog(),
    recommendations: listRecommendationCatalog(),
    rules: listPolicyIntelligenceRules(),
    ruleCategories: Object.values(RULE_CATEGORIES),
    thresholds: DEFAULT_RULE_THRESHOLDS,
    pipeline: [
      "insurance_facts",
      "business_rules",
      "findings",
      "recommendations",
      "ai_narrative"
    ],
    contracts: {
      factsImmutable: true,
      factsSource: FACT_SOURCE.ATLAS_EXTRACT,
      findingsFromBusinessRulesOnly: true,
      recommendationsFromFindingsOnly: true,
      aiConsumesFactsAndFindingsOnly: true,
      architectureFrozen: true
    }
  };
}

module.exports = {
  analyzeInsuranceLanguage,
  buildAiLanguageContext,
  getLanguageLayerCatalog,
  mapToAtlasTerm,
  buildInsuranceFactsFromExtract,
  evaluateInsuranceBusinessRules,
  executeInsuranceBusinessRules,
  buildRecommendationsFromFindings
};
