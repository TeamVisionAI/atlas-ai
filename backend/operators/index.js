/**
 * Sprint 12.4 — Operator domain public exports.
 */

const { OperatorService } = require("./OperatorService");
const { OperatorRepository } = require("./OperatorRepository");
const { AssignmentEngine } = require("./AssignmentEngine");
const { OperatorEvent } = require("./operatorEvents");

/**
 * @param {Object} [options]
 * @param {import('../communication/events/EventBus').EventBus} [options.eventBus]
 * @param {import('../communication/gateway/ConversationManager').ConversationManager} [options.conversationManager]
 */
function createOperatorService(options = {}) {
  const repository = new OperatorRepository();
  const assignmentEngine = new AssignmentEngine();
  const service = new OperatorService({
    repository,
    assignmentEngine,
    eventBus: options.eventBus || null,
    conversationManager: options.conversationManager || null
  });

  return service;
}

module.exports = {
  OperatorService,
  OperatorRepository,
  AssignmentEngine,
  OperatorEvent,
  createOperatorService
};
