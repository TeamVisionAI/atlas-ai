/**
 * Journey #5 Increment 2 — Agent workflow intelligence exports.
 */

const {
  FIELD_LABELS,
  GENERIC_INTAKE_WORKFLOW,
  TEAM_VISION_INTAKE_WORKFLOW,
  BUILTIN_WORKFLOWS,
  getFieldLabel,
  validateContract
} = require("./WorkflowContracts");
const {
  WorkflowRegistry,
  getWorkflowRegistry,
  resetWorkflowRegistry
} = require("./WorkflowRegistry");
const { DEFAULT_WORKFLOW_NAME, loadWorkflow } = require("./WorkflowLoader");
const {
  createInitialState,
  getState,
  saveState,
  getOrCreateState,
  clearStore
} = require("./WorkflowState");
const { WorkflowIntelligenceEvent } = require("./WorkflowEvents");
const {
  validateField,
  validateStep,
  validateWorkflowCompletion,
  getFactValue
} = require("./WorkflowValidator");
const {
  navigate,
  buildNextState,
  computeCompletionPercent,
  resolveCurrentStep
} = require("./WorkflowNavigator");

module.exports = {
  FIELD_LABELS,
  GENERIC_INTAKE_WORKFLOW,
  TEAM_VISION_INTAKE_WORKFLOW,
  BUILTIN_WORKFLOWS,
  getFieldLabel,
  validateContract,
  WorkflowRegistry,
  getWorkflowRegistry,
  resetWorkflowRegistry,
  DEFAULT_WORKFLOW_NAME,
  loadWorkflow,
  createInitialState,
  getState,
  saveState,
  getOrCreateState,
  clearStore,
  WorkflowIntelligenceEvent,
  validateField,
  validateStep,
  validateWorkflowCompletion,
  getFactValue,
  navigate,
  buildNextState,
  computeCompletionPercent,
  resolveCurrentStep
};
