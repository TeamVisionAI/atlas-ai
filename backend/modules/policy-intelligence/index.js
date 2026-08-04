/**
 * Policy Intelligence module entry — Atlas Extract + BR-054/BR-056 boundaries.
 * Implements BR-051 / BR-052 / BR-054 / BR-056. AI/OCR deferred.
 */

const createPolicyIntelligenceRoutes = require("./api/policyIntelligence.routes");
const { PolicyIntelligenceService } = require("./application/PolicyIntelligenceService");
const { DocumentIngestionService } = require("./application/DocumentIngestionService");
const { PolicyExtractionService } = require("./application/PolicyExtractionService");
const { PolicyIntelligenceRepository } = require("./infrastructure/PolicyIntelligenceRepository");
const {
  gatePolicyDocumentForKnowledgeCenter,
  gateExtractionForKnowledgeCenter,
  gateExtractionForBenchmark,
  gateExtractionForAi
} = require("./application/knowledgeCenterGate");
const {
  MODULE_ID,
  POLICY_REVIEW_STATUSES,
  POLICY_DOCUMENT_UPLOAD_STATUSES,
  POLICY_EXTRACTION_STATUSES,
  POLICY_EXTRACTION_METHODS,
  MODULE_CAPABILITIES,
  FOUNDATION_CAPABILITIES,
  REPORT_MODES
} = require("./domain/constants");
const {
  createEmptyPolicyExtractionData,
  normalizePolicyExtractionData,
  toIntelligencePayload
} = require("./domain/PolicyExtractionModel");
const { hashCrmPolicyNumber, assertNoCrmIdentityLeak } = require("./domain/crmBoundary");
const {
  analyzeInsuranceLanguage,
  buildAiLanguageContext,
  getLanguageLayerCatalog,
  mapToAtlasTerm,
  executeInsuranceBusinessRules
} = require("./domain/insurance-language/languageLayer");
const {
  executePolicyIntelligenceRules,
  listPolicyIntelligenceRules,
  getRuleById
} = require("./domain/insurance-language/rule-engine/policyIntelligenceRuleEngine");
const {
  analyzeAnnualValues,
  getAnnualValuesCatalog
} = require("./domain/annual-values/annualValuesEngine");
const { AnnualValuesService } = require("./application/AnnualValuesService");
const { ComparisonService } = require("./application/ComparisonService");
const {
  compareScenarios,
  compareWithStress,
  getComparisonCatalog,
  createPolicyScenario
} = require("./domain/comparison/comparisonEngine");

function createPolicyIntelligenceModule(deps = {}) {
  const repository = deps.repository || new PolicyIntelligenceRepository();
  const service = deps.service || new PolicyIntelligenceService({ repository });

  return {
    moduleId: MODULE_ID,
    repository,
    service,
    routes: createPolicyIntelligenceRoutes({ service, repository })
  };
}

module.exports = {
  createPolicyIntelligenceModule,
  createPolicyIntelligenceRoutes,
  PolicyIntelligenceService,
  DocumentIngestionService,
  PolicyExtractionService,
  PolicyIntelligenceRepository,
  MODULE_ID,
  POLICY_REVIEW_STATUSES,
  POLICY_DOCUMENT_UPLOAD_STATUSES,
  POLICY_EXTRACTION_STATUSES,
  POLICY_EXTRACTION_METHODS,
  MODULE_CAPABILITIES,
  FOUNDATION_CAPABILITIES,
  REPORT_MODES,
  createEmptyPolicyExtractionData,
  normalizePolicyExtractionData,
  toIntelligencePayload,
  hashCrmPolicyNumber,
  assertNoCrmIdentityLeak,
  gatePolicyDocumentForKnowledgeCenter,
  gateExtractionForKnowledgeCenter,
  gateExtractionForBenchmark,
  gateExtractionForAi,
  analyzeInsuranceLanguage,
  buildAiLanguageContext,
  getLanguageLayerCatalog,
  mapToAtlasTerm,
  executeInsuranceBusinessRules,
  executePolicyIntelligenceRules,
  listPolicyIntelligenceRules,
  getRuleById,
  analyzeAnnualValues,
  getAnnualValuesCatalog,
  AnnualValuesService,
  ComparisonService,
  compareScenarios,
  compareWithStress,
  getComparisonCatalog,
  createPolicyScenario
};
