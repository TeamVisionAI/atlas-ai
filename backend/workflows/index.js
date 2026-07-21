/**
 * Sprint 13.0 — Workflow Engine public exports.
 */

const { WorkflowEngine } = require("./WorkflowEngine");
const { WorkflowRegistry } = require("./WorkflowRegistry");
const { WorkflowContext } = require("./WorkflowContext");
const { WorkflowRunner } = require("./WorkflowRunner");
const { WorkflowState, WorkflowStateStore, WorkflowStatus } = require("./WorkflowState");
const { WorkflowEvent } = require("./WorkflowEvents");

/**
 * @param {Object} options
 * @param {import('../communication/events/EventBus').EventBus} options.eventBus
 * @param {import('../operators/OperatorService').OperatorService|null} [options.operatorService]
 */
function createWorkflowEngine(options = {}) {
  if (!options.eventBus) {
    throw new Error("WorkflowEngine requires eventBus");
  }

  return new WorkflowEngine({
    eventBus: options.eventBus,
    operatorService: options.operatorService || null
  });
}

let singleton = null;

function getWorkflowEngine(eventBus, operatorService = null) {
  if (!singleton) {
    singleton = createWorkflowEngine({ eventBus, operatorService });
  }

  return singleton;
}

function resetWorkflowEngine() {
  singleton = null;
}

module.exports = {
  WorkflowEngine,
  WorkflowRegistry,
  WorkflowContext,
  WorkflowRunner,
  WorkflowState,
  WorkflowStateStore,
  WorkflowStatus,
  WorkflowEvent,
  createWorkflowEngine,
  getWorkflowEngine,
  resetWorkflowEngine
};
