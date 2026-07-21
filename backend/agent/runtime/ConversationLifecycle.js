/**
 * Journey #5 Increment 4 — Conversation lifecycle state transitions.
 */

const { CONVERSATION_STATUS, OUTCOME_TYPE } = require("./ConversationState");
const { DECISION_TYPE } = require("../DecisionRecord");

function isConversationComplete(decision, toolResults = []) {
  if (decision.decisionType === DECISION_TYPE.ESCALATE) {
    return true;
  }

  if (decision.decisionType === DECISION_TYPE.TOOL_REQUEST) {
    return toolResults.some((entry) => entry.success);
  }

  return false;
}

function resolveOutcome(decision, toolResults = []) {
  if (decision.decisionType === DECISION_TYPE.ESCALATE) {
    return OUTCOME_TYPE.ESCALATED;
  }

  if (toolResults.some((entry) => entry.success)) {
    return OUTCOME_TYPE.APPOINTMENT_SCHEDULED;
  }

  return OUTCOME_TYPE.INCOMPLETE;
}

function resolveStatus(decision, toolResults = []) {
  if (decision.decisionType === DECISION_TYPE.ESCALATE) {
    return CONVERSATION_STATUS.ESCALATED;
  }

  if (isConversationComplete(decision, toolResults)) {
    return CONVERSATION_STATUS.COMPLETED;
  }

  return CONVERSATION_STATUS.ACTIVE;
}

function shouldClose(decision, toolResults = []) {
  return isConversationComplete(decision, toolResults);
}

module.exports = {
  isConversationComplete,
  resolveOutcome,
  resolveStatus,
  shouldClose
};
