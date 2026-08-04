/**
 * Knowledge Center ingress gate for Policy Intelligence (BR-054).
 * Call before index / embed / benchmark / Knowledge Center publish.
 */

const { prepareKnowledgeCenterPayload, sanitizePiiText } = require("../domain/piiSanitizer");
const { toIntelligencePayload } = require("../domain/PolicyExtractionModel");
const { toBenchmarkFeatures } = require("../domain/benchmarkBoundary");
const { buildAiPolicyContext, assertNoPiiInAiContext } = require("../domain/aiBoundary");

function gatePolicyDocumentForKnowledgeCenter({ title, body, metadata } = {}) {
  return prepareKnowledgeCenterPayload({ title, body, metadata });
}

function gateExtractionForKnowledgeCenter(extractedData) {
  const intelligence = toIntelligencePayload(extractedData);
  return prepareKnowledgeCenterPayload({
    title: "Policy Extraction",
    body: JSON.stringify(intelligence, null, 2),
    metadata: {
      schemaVersion: intelligence.schemaVersion,
      carrier: intelligence.carrier,
      productType: intelligence.productType
    }
  });
}

function gateExtractionForBenchmark(extractedData) {
  return toBenchmarkFeatures(extractedData);
}

function gateExtractionForAi(extractedData, { reviewId = null, extractionId = null } = {}) {
  const context = buildAiPolicyContext(extractedData, { reviewId, extractionId });
  assertNoPiiInAiContext(context);
  return context;
}

function sanitizeFreeText(text) {
  return sanitizePiiText(text);
}

module.exports = {
  gatePolicyDocumentForKnowledgeCenter,
  gateExtractionForKnowledgeCenter,
  gateExtractionForBenchmark,
  gateExtractionForAi,
  sanitizeFreeText
};
