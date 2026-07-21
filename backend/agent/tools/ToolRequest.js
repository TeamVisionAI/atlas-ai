/**
 * Journey #5 Increment 3 — Standard Tool Request contract.
 */

/**
 * @param {Object} input
 * @returns {Object}
 */
function createToolRequest(input) {
  const correlationId = input.correlationId || crypto.randomUUID();

  return {
    id: input.id || crypto.randomUUID(),
    correlationId,
    toolName: input.toolName,
    operation: input.operation,
    parameters: input.parameters || {},
    workflowName: input.workflowName || null,
    conversationId: input.conversationId || null,
    prospectId: input.prospectId || null,
    timestamp: input.timestamp || new Date().toISOString()
  };
}

module.exports = {
  createToolRequest
};
