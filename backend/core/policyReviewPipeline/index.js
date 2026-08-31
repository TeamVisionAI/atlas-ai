const constants = require("./constants");
const calculations = require("./calculations");
const { createMemoryPolicyReviewStore } = require("./memoryStore");

function canTransitionStage(fromStage, toStage) {
  const allowed = constants.POLICY_REVIEW_ALLOWED_TRANSITIONS[fromStage] || [];
  return allowed.includes(toStage);
}

function isExplicitOutcome(stage) {
  return Object.values(constants.POLICY_REVIEW_OUTCOMES).includes(stage);
}

function isReplacementStage(stage) {
  return stage === constants.POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY;
}

function stampStage(stageTimestamps, stage, at) {
  return {
    ...(stageTimestamps || {}),
    [stage]: at
  };
}

module.exports = {
  ...constants,
  ...calculations,
  canTransitionStage,
  isExplicitOutcome,
  isReplacementStage,
  stampStage,
  createMemoryPolicyReviewStore
};
