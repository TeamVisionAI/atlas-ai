/**
 * Journey #5 Increment 3 — Build Tool Requests from Agent decisions.
 */

const { createToolRequest } = require("./ToolRequest");
const { getFactValue } = require("../../workflows/intelligence/WorkflowValidator");

function factsToInterview(memoryView, context, prospect) {
  const facts = memoryView.collectedFacts || {};

  return {
    name: getFactValue(facts, "name"),
    email: getFactValue(facts, "email"),
    phone: getFactValue(facts, "phone"),
    city: getFactValue(facts, "city"),
    state: getFactValue(facts, "state"),
    interviewType: getFactValue(facts, "interviewType") || "office",
    preferredDate: getFactValue(facts, "preferredDate") || "tomorrow",
    preferredTime: getFactValue(facts, "preferredTime") || "morning"
  };
}

function buildOperationParameters(toolName, operation, turnContext) {
  const { memoryView, context, contract, conversation, prospect, correlationId } = turnContext;
  const interview = factsToInterview(memoryView, context, prospect);

  if (toolName === "AppointmentService" && operation === "scheduleInterview") {
    return {
      payload: {
        interview,
        collectedData: interview,
        organization: context.organization,
        prospect: {
          atlasId: prospect?.id || conversation.prospectId,
          displayName: interview.name || conversation.prospectName
        },
        workflow: {
          atlasProspectId: prospect?.id || conversation.prospectId,
          workflowId: contract.name
        }
      },
      eventBus: turnContext.eventBus || null
    };
  }

  if (toolName === "MeetingService" && operation === "prepareMeeting") {
    return {
      confirmedPayload: turnContext.previousResult?.confirmedPayload || null,
      previousResult: turnContext.previousResult || null
    };
  }

  if (toolName === "CalendarService" && operation === "createEvent") {
    return {
      meeting: turnContext.previousResult?.meeting || null,
      previousResult: turnContext.previousResult || null
    };
  }

  return {
    correlationId,
    previousResult: turnContext.previousResult || null
  };
}

/**
 * @param {Object} turnContext
 * @returns {Object[]}
 */
function buildToolRequests(turnContext) {
  const { decision, contract, conversation, prospect, correlationId } = turnContext;

  if (decision.decisionType !== "TOOL_REQUEST") {
    return [];
  }

  const completionTools = contract.completionTools || [];

  if (completionTools.length === 0) {
    return [];
  }

  return completionTools.map((entry) =>
    createToolRequest({
      correlationId,
      toolName: entry.toolName,
      operation: entry.operation,
      parameters: buildOperationParameters(entry.toolName, entry.operation, turnContext),
      workflowName: contract.name,
      conversationId: conversation.id,
      prospectId: prospect?.id || conversation.prospectId || null
    })
  );
}

module.exports = {
  buildToolRequests,
  buildOperationParameters,
  factsToInterview
};
