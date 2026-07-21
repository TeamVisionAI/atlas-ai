/**
 * Journey #5 Increment 3 — Tool execution orchestrator.
 * No business logic. Validates, resolves, executes, records.
 */

const { ToolEvent } = require("./ToolEvents");
const { createToolResult } = require("./ToolResult");
const { validateToolRequest } = require("./ToolValidator");
const { getToolRegistry } = require("./ToolRegistry");
const executionHistory = require("./ExecutionHistory");

class ToolExecutor {
  /**
   * @param {Object} [deps]
   * @param {import('../../communication/events/EventBus').EventBus|null} [deps.eventBus]
   * @param {import('./ToolRegistry').ToolRegistry|null} [deps.registry]
   */
  constructor(deps = {}) {
    this.eventBus = deps.eventBus || null;
    this.registry = deps.registry || getToolRegistry({ eventBus: deps.eventBus });
  }

  /**
   * @param {Object} request
   * @returns {Promise<Object>}
   */
  async execute(request) {
    this.eventBus?.emit(ToolEvent.REQUESTED, { request });

    const validation = validateToolRequest(request, this.registry);

    if (!validation.valid) {
      const result = createToolResult({
        correlationId: request.correlationId,
        toolName: request.toolName,
        operation: request.operation,
        success: false,
        error: validation.errors.join(" "),
        executionTimeMs: 0
      });

      this.eventBus?.emit(ToolEvent.FAILED, { request, result, errors: validation.errors });
      await executionHistory.saveExecution({ request, result });
      return result;
    }

    this.eventBus?.emit(ToolEvent.VALIDATED, { request });

    const handler = this.registry.resolve(request.toolName, request.operation);
    const startedAt = Date.now();

    try {
      const resultData = await handler({
        ...request.parameters,
        previousResult: request.parameters?.previousResult || null
      });

      const result = createToolResult({
        correlationId: request.correlationId,
        toolName: request.toolName,
        operation: request.operation,
        success: true,
        resultData,
        executionTimeMs: Date.now() - startedAt
      });

      this.eventBus?.emit(ToolEvent.EXECUTED, { request, result });
      this.eventBus?.emit(ToolEvent.COMPLETED, { request, result });
      await executionHistory.saveExecution({ request, result });
      return result;
    } catch (error) {
      const result = createToolResult({
        correlationId: request.correlationId,
        toolName: request.toolName,
        operation: request.operation,
        success: false,
        error: error.message,
        executionTimeMs: Date.now() - startedAt
      });

      this.eventBus?.emit(ToolEvent.FAILED, { request, result, error: error.message });
      await executionHistory.saveExecution({ request, result });
      return result;
    }
  }

  /**
   * @param {Object[]} requests
   * @returns {Promise<Object[]>}
   */
  async executeChain(requests) {
    const results = [];
    let previousResult = null;

    for (const request of requests) {
      const enrichedRequest = {
        ...request,
        parameters: {
          ...request.parameters,
          previousResult
        }
      };

      const result = await this.execute(enrichedRequest);
      results.push(result);

      if (!result.success) {
        break;
      }

      previousResult = result.resultData;
    }

    return results;
  }
}

function createToolExecutor(options = {}) {
  return new ToolExecutor(options);
}

module.exports = {
  ToolExecutor,
  createToolExecutor
};
