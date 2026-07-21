/**
 * Journey #5 Increment 4 — Structured conversation summary generation.
 */

const { getFactValue } = require("../../workflows/intelligence/WorkflowValidator");
const { OUTCOME_TYPE } = require("./ConversationState");

function flattenFacts(collectedFacts) {
  const flattened = {};

  for (const [key, entry] of Object.entries(collectedFacts || {})) {
    flattened[key] = getFactValue(collectedFacts, key) ?? entry;
  }

  return flattened;
}

/**
 * @param {Object} turnResult
 * @returns {Object}
 */
function buildConversationSummary(turnResult) {
  const {
    conversationId,
    context,
    memory,
    workflow,
    navigation,
    decision,
    toolResults = [],
    session
  } = turnResult;

  const escalated = decision.decisionType === "ESCALATE";
  const toolSuccess = toolResults.some((entry) => entry.success);
  let outcome = OUTCOME_TYPE.INCOMPLETE;

  if (escalated) {
    outcome = OUTCOME_TYPE.ESCALATED;
  } else if (toolSuccess) {
    outcome = OUTCOME_TYPE.APPOINTMENT_SCHEDULED;
  }

  return {
    id: crypto.randomUUID(),
    conversationId,
    prospect: {
      id: context.prospect?.id || session?.prospectId || null,
      displayName:
        getFactValue(memory.collectedFacts, "name") ||
        context.prospect?.displayName ||
        "Prospect"
    },
    workflow: {
      name: workflow?.name || session?.workflowName || null,
      objective: workflow?.objective || navigation?.currentObjective || null
    },
    objective: navigation?.currentObjective || workflow?.objective || null,
    collectedFacts: flattenFacts(memory.collectedFacts),
    actionsTaken: session?.completedActions || memory.completedTasks || [],
    toolsExecuted: toolResults.map((entry) => ({
      toolName: entry.toolName,
      operation: entry.operation,
      success: entry.success,
      correlationId: entry.correlationId
    })),
    outcome,
    escalations: escalated
      ? [
          {
            reason: decision.reason,
            timestamp: decision.timestamp
          }
        ]
      : session?.escalations || [],
    openTasks: session?.openTasks || [],
    summaryTimestamp: new Date().toISOString()
  };
}

module.exports = {
  buildConversationSummary,
  flattenFacts
};
