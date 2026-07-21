/**
 * Journey #5 Increment 1 — Generates natural responses from Decision Records.
 */

const { DECISION_TYPE } = require("./DecisionRecord");
const { getFieldLabel } = require("../workflows/intelligence/WorkflowContracts");
const { inferAnswer } = require("./DecisionEngine");

function getFactValue(collectedFacts, fieldName) {
  const entry = collectedFacts[fieldName];
  if (!entry) {
    return null;
  }

  return typeof entry === "object" ? entry.value : entry;
}

function buildAskResponse(context, memoryView, decision) {
  const nextField = decision.missingInformation[0];
  const label = getFieldLabel(nextField);
  const orgName = context.organization?.name || "our team";
  const prospectName = getFactValue(memoryView.collectedFacts, "name");

  if (!prospectName && nextField === "name") {
    return `Hi there. I am Atlas with ${orgName}. To get started, what is your full name?`;
  }

  if (nextField === "email") {
    return `Thanks${prospectName ? `, ${prospectName}` : ""}. What is the best email address to reach you?`;
  }

  if (nextField === "phone") {
    return `Great. What is the best phone number for you?`;
  }

  if (nextField === "city") {
    return `What city are you located in?`;
  }

  if (nextField === "state") {
    return `What state are you in?`;
  }

  if (nextField === "interviewType") {
    return `Would you prefer a virtual or in-person meeting?`;
  }

  if (nextField === "preferredDate") {
    return `What date works best for you?`;
  }

  if (nextField === "preferredTime") {
    return `What time of day works best for you?`;
  }

  return `Could you share your ${label}?`;
}

function buildAnswerResponse(context, memoryView, decision, inboundText) {
  const answer = inferAnswer(context, memoryView, inboundText);
  const missing = decision.missingInformation || [];

  if (missing.length === 0) {
    return answer;
  }

  const nextField = missing[0];
  return `${answer} Could you share your ${getFieldLabel(nextField)}?`;
}

function buildWaitResponse() {
  return "Thanks for your message. A team member will follow up with you shortly.";
}

function buildEscalateResponse(context) {
  const orgName = context.organization?.name || "our team";
  return `I understand. I am connecting you with someone from ${orgName} who can help you directly.`;
}

function buildToolRequestResponse(context, memoryView, decision) {
  const prospectName = getFactValue(memoryView.collectedFacts, "name") || "there";
  const workflowName = decision.workflowName || "workflow";

  return `Thanks ${prospectName}. You have completed the ${workflowName.replace(/-/g, " ")} steps. I will prepare the next action for you.`;
}

/**
 * @param {Object} decision
 * @param {Object} context
 * @param {Object} memoryView
 * @returns {string}
 */
function generateResponse(decision, context, memoryView) {
  const inboundText = context.inboundMessage?.text || "";

  switch (decision.decisionType) {
    case DECISION_TYPE.ASK:
      return buildAskResponse(context, memoryView, decision);

    case DECISION_TYPE.ANSWER:
      return buildAnswerResponse(context, memoryView, decision, inboundText);

    case DECISION_TYPE.WAIT:
      return buildWaitResponse();

    case DECISION_TYPE.ESCALATE:
      return buildEscalateResponse(context);

    case DECISION_TYPE.TOOL_REQUEST:
      return buildToolRequestResponse(context, memoryView, decision);

    default:
      return "Thanks for your message. How can I help you move forward?";
  }
}

module.exports = {
  generateResponse
};
