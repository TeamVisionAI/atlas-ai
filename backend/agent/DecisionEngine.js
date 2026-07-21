/**
 * Journey #5 Increment 2 — Produces Decision Records using workflow intelligence.
 * No tool execution. No business service calls.
 */

const { DECISION_TYPE, CONFIDENCE_LEVEL, createDecisionRecord } = require("./DecisionRecord");
const { getFieldLabel } = require("../workflows/intelligence/WorkflowContracts");
const { getFactValue } = require("../workflows/intelligence/WorkflowValidator");

const ESCALATION_PATTERNS = [
  /\b(manager|supervisor|human|person|agent)\b/i,
  /\b(speak to someone|talk to someone|call me)\b/i
];

const QUESTION_PATTERN = /\?/;

function listMissingFields(requiredFields, collectedFacts) {
  return requiredFields.filter((field) => !getFactValue(collectedFacts, field));
}

function detectEscalation(text) {
  return ESCALATION_PATTERNS.some((pattern) => pattern.test(text || ""));
}

function detectQuestion(text) {
  return QUESTION_PATTERN.test(text || "");
}

function inferAnswer(context, memoryView, text) {
  const orgName = context.organization?.name || "our team";
  const prospectName = getFactValue(memoryView.collectedFacts, "name");

  if (/what (is|are) your (hours|office hours)/i.test(text)) {
    return `Our office is available during standard business hours. ${orgName} will confirm exact times when scheduling.`;
  }

  if (/where (are you|is your office)/i.test(text)) {
    const address = context.organization?.officeAddress;
    return address
      ? `Our office is located at ${address}.`
      : "I can share office location details once we finish scheduling your visit.";
  }

  if (/who (are you|am i speaking with)/i.test(text)) {
    return `You are speaking with Atlas on behalf of ${orgName}. I am here to help you move forward.`;
  }

  if (prospectName) {
    return `Thanks ${prospectName}. I have your details and we can keep moving forward.`;
  }

  return `Thanks for reaching out to ${orgName}. I am here to help you take the next step.`;
}

function buildWorkflowDecisionFields(navigation) {
  return {
    workflowName: navigation.workflowName,
    currentStep: navigation.currentStep,
    nextStep: navigation.nextStep,
    completionPercent: navigation.completionPercent,
    blockingReason: navigation.blockingReason,
    workflowConfidence: navigation.workflowConfidence
  };
}

function decideWithWorkflow(context, memoryView, workflowContext) {
  const navigation = workflowContext.navigation;
  const text = context.inboundMessage?.text || "";
  const missingForStep = navigation.missingInformation || [];
  const workflowFields = buildWorkflowDecisionFields(navigation);

  if (context.conversation.ownership !== "ATLAS") {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.WAIT,
      reason: "Conversation ownership is not Atlas.",
      currentObjective: navigation.currentObjective,
      missingInformation: missingForStep,
      recommendedNextAction: "Wait for human operator to complete the interaction.",
      confidence: CONFIDENCE_LEVEL.HIGH,
      ...workflowFields
    });
  }

  if (detectEscalation(text)) {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.ESCALATE,
      reason: "Prospect requested human assistance.",
      currentObjective: navigation.currentObjective,
      missingInformation: missingForStep,
      recommendedNextAction: "Transfer conversation to a human operator with full context.",
      confidence: CONFIDENCE_LEVEL.HIGH,
      ...workflowFields
    });
  }

  if (navigation.isComplete) {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.TOOL_REQUEST,
      reason: "Workflow complete. All required steps satisfied.",
      currentObjective: navigation.currentObjective,
      missingInformation: [],
      recommendedNextAction: navigation.recommendedAction,
      confidence: CONFIDENCE_LEVEL.HIGH,
      ...workflowFields
    });
  }

  if (missingForStep.length > 0) {
    const nextField = missingForStep[0];

    if (detectQuestion(text) && memoryView.history.length > 0) {
      return createDecisionRecord({
        conversationId: context.conversation.id,
        messageId: context.inboundMessage.id,
        decisionType: DECISION_TYPE.ANSWER,
        reason: "Prospect asked a question during the current workflow step.",
        currentObjective: navigation.currentObjective,
        missingInformation: missingForStep,
        recommendedNextAction: `Answer the question, then ask for ${getFieldLabel(nextField)}.`,
        confidence: CONFIDENCE_LEVEL.MEDIUM,
        ...workflowFields
      });
    }

    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.ASK,
      reason: `Current step "${navigation.currentStep}" requires ${nextField}.`,
      currentObjective: navigation.currentObjective,
      missingInformation: [nextField],
      recommendedNextAction: navigation.recommendedAction,
      confidence: navigation.workflowConfidence || CONFIDENCE_LEVEL.HIGH,
      ...workflowFields
    });
  }

  if (detectQuestion(text)) {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.ANSWER,
      reason: "Prospect asked an informational question.",
      currentObjective: navigation.currentObjective,
      missingInformation: [],
      recommendedNextAction: "Provide a grounded answer from known context.",
      confidence: CONFIDENCE_LEVEL.MEDIUM,
      ...workflowFields
    });
  }

  return createDecisionRecord({
    conversationId: context.conversation.id,
    messageId: context.inboundMessage.id,
    decisionType: DECISION_TYPE.WAIT,
    reason: navigation.blockingReason || "Workflow step blocked.",
    currentObjective: navigation.currentObjective,
    missingInformation: missingForStep,
    recommendedNextAction: navigation.recommendedAction,
    confidence: CONFIDENCE_LEVEL.MEDIUM,
    blockingReason: navigation.blockingReason,
    ...workflowFields
  });
}

function decideLegacy(context, memoryView) {
  const text = context.inboundMessage?.text || "";
  const objective = context.workflow.currentObjective;
  const missingFields = listMissingFields(
    context.workflow.requiredFields || [],
    memoryView.collectedFacts
  );

  if (context.conversation.ownership !== "ATLAS") {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.WAIT,
      reason: "Conversation ownership is not Atlas.",
      currentObjective: objective,
      missingInformation: missingFields,
      recommendedNextAction: "Wait for human operator to complete the interaction.",
      confidence: CONFIDENCE_LEVEL.HIGH
    });
  }

  if (detectEscalation(text)) {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.ESCALATE,
      reason: "Prospect requested human assistance.",
      currentObjective: objective,
      missingInformation: missingFields,
      recommendedNextAction: "Transfer conversation to a human operator with full context.",
      confidence: CONFIDENCE_LEVEL.HIGH
    });
  }

  if (missingFields.length > 0) {
    const nextField = missingFields[0];

    if (detectQuestion(text) && memoryView.history.length > 0) {
      return createDecisionRecord({
        conversationId: context.conversation.id,
        messageId: context.inboundMessage.id,
        decisionType: DECISION_TYPE.ANSWER,
        reason: "Prospect asked a question that can be answered while intake continues.",
        currentObjective: objective,
        missingInformation: missingFields,
        recommendedNextAction: `Answer the question, then continue collecting ${getFieldLabel(nextField)}.`,
        confidence: CONFIDENCE_LEVEL.MEDIUM
      });
    }

    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.ASK,
      reason: `Missing required field: ${nextField}.`,
      currentObjective: objective,
      missingInformation: missingFields,
      recommendedNextAction: `Ask for ${getFieldLabel(nextField)}.`,
      confidence: CONFIDENCE_LEVEL.HIGH
    });
  }

  if (detectQuestion(text)) {
    return createDecisionRecord({
      conversationId: context.conversation.id,
      messageId: context.inboundMessage.id,
      decisionType: DECISION_TYPE.ANSWER,
      reason: "Prospect asked an informational question.",
      currentObjective: objective,
      missingInformation: [],
      recommendedNextAction: "Provide a grounded answer from known context.",
      confidence: CONFIDENCE_LEVEL.MEDIUM
    });
  }

  return createDecisionRecord({
    conversationId: context.conversation.id,
    messageId: context.inboundMessage.id,
    decisionType: DECISION_TYPE.TOOL_REQUEST,
    reason: "Required information collected for current objective.",
    currentObjective: objective,
    missingInformation: [],
    recommendedNextAction: "Future increment will invoke workflow and scheduling tools.",
    confidence: CONFIDENCE_LEVEL.HIGH
  });
}

/**
 * @param {Object} context
 * @param {Object} memoryView
 * @param {Object|null} [workflowContext]
 * @returns {Object}
 */
function decide(context, memoryView, workflowContext = null) {
  if (workflowContext?.navigation) {
    return decideWithWorkflow(context, memoryView, workflowContext);
  }

  return decideLegacy(context, memoryView);
}

module.exports = {
  decide,
  decideLegacy,
  decideWithWorkflow,
  detectEscalation,
  detectQuestion,
  listMissingFields,
  inferAnswer
};
