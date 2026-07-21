/**
 * Journey #5 Increment 3 — Standard Tool Result contract.
 */

const TOOL_STATUS = Object.freeze({
  SUCCESS: "success",
  FAILURE: "failure"
});

/**
 * @param {Object} input
 * @returns {Object}
 */
function createToolResult(input) {
  return {
    id: input.id || crypto.randomUUID(),
    correlationId: input.correlationId,
    toolName: input.toolName,
    operation: input.operation,
    success: Boolean(input.success),
    status: input.success ? TOOL_STATUS.SUCCESS : TOOL_STATUS.FAILURE,
    resultData: input.resultData || null,
    error: input.error || null,
    executionTimeMs: input.executionTimeMs ?? 0,
    timestamp: input.timestamp || new Date().toISOString()
  };
}

module.exports = {
  TOOL_STATUS,
  createToolResult
};
