/**
 * Journey #5 Increment 1 — Decision Record contract.
 * Permanent interface between Agent intelligence and future execution layers.
 */

const DECISION_TYPE = Object.freeze({
  ANSWER: "ANSWER",
  ASK: "ASK",
  WAIT: "WAIT",
  ESCALATE: "ESCALATE",
  TOOL_REQUEST: "TOOL_REQUEST"
});

const CONFIDENCE_LEVEL = Object.freeze({
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low"
});

/**
 * @param {Object} input
 * @returns {Object}
 */
function createDecisionRecord(input) {
  return {
    id: input.id || crypto.randomUUID(),
    conversationId: input.conversationId,
    messageId: input.messageId || null,
    decisionType: input.decisionType,
    reason: input.reason || "",
    currentObjective: input.currentObjective || null,
    missingInformation: Array.isArray(input.missingInformation)
      ? input.missingInformation
      : [],
    recommendedNextAction: input.recommendedNextAction || "",
    confidence: input.confidence || CONFIDENCE_LEVEL.MEDIUM,
    timestamp: input.timestamp || new Date().toISOString(),
    workflowName: input.workflowName || null,
    currentStep: input.currentStep || null,
    nextStep: input.nextStep || null,
    completionPercent: input.completionPercent ?? null,
    blockingReason: input.blockingReason || null,
    workflowConfidence: input.workflowConfidence || null
  };
}

module.exports = {
  DECISION_TYPE,
  CONFIDENCE_LEVEL,
  createDecisionRecord
};
