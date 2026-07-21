/**
 * Journey #5 Increment 2 — Load workflow contracts for Agent reasoning.
 */

const { getWorkflowRegistry } = require("./WorkflowRegistry");
const { GENERIC_INTAKE_WORKFLOW } = require("./WorkflowContracts");
const { WorkflowIntelligenceEvent } = require("./WorkflowEvents");

const DEFAULT_WORKFLOW_NAME = GENERIC_INTAKE_WORKFLOW.name;

/**
 * @param {string} [workflowName]
 * @param {import('../../communication/events/EventBus').EventBus|null} [eventBus]
 * @param {Object} [meta]
 * @returns {Object}
 */
function loadWorkflow(workflowName = DEFAULT_WORKFLOW_NAME, eventBus = null, meta = {}) {
  const registry = getWorkflowRegistry();
  const contract = registry.get(workflowName) || registry.get(DEFAULT_WORKFLOW_NAME);

  if (!contract) {
    throw new Error(`Workflow "${workflowName}" is not registered`);
  }

  eventBus?.emit(WorkflowIntelligenceEvent.LOADED, {
    workflowName: contract.name,
    objective: contract.objective,
    stepCount: contract.steps.length,
    ...meta
  });

  return contract;
}

module.exports = {
  DEFAULT_WORKFLOW_NAME,
  loadWorkflow
};
