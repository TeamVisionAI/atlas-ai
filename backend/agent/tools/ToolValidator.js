/**
 * Journey #5 Increment 3 — Tool request validation.
 */

function validateToolRequest(request, registry) {
  const errors = [];

  if (!request?.toolName) {
    errors.push("Tool name is required.");
  }

  if (!request?.operation) {
    errors.push("Operation is required.");
  }

  if (!request?.correlationId) {
    errors.push("Correlation id is required.");
  }

  if (!request?.conversationId) {
    errors.push("Conversation id is required.");
  }

  if (request?.toolName && !registry.hasTool(request.toolName)) {
    errors.push(`Tool "${request.toolName}" is not registered.`);
  }

  if (
    request?.toolName &&
    request?.operation &&
    registry.hasTool(request.toolName) &&
    !registry.hasOperation(request.toolName, request.operation)
  ) {
    errors.push(`Operation "${request.operation}" is not registered for ${request.toolName}.`);
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  validateToolRequest
};
