/**
 * Sprint 12.2 Phase 3 — Workflow Engine module entry.
 */

const { WorkflowEngine } = require("./application/WorkflowEngine");
const { WorkflowMissionRegistry } = require("./application/WorkflowMissionRegistry");
const { AppointmentWorkflowEvaluator } = require("./application/AppointmentWorkflowEvaluator");
const { registerAppointmentWorkflowHandlers } = require("./application/registerWorkflowEventHandlers");
const { createMissionDefinition } = require("./domain/MissionDefinition");
const { WorkflowDomainError } = require("./domain/WorkflowDomainError");
const {
  APPOINTMENT_WORKFLOW_RULES,
  APPOINTMENT_WORKFLOW_EVENT_TYPES,
  getAppointmentWorkflowRules
} = require("./configuration/appointmentWorkflowRules");

function createWorkflowModule(deps = {}) {
  const registry = deps.registry || new WorkflowMissionRegistry();
  const engine =
    deps.engine ||
    new WorkflowEngine({
      registry,
      appointmentEvaluator: deps.appointmentEvaluator
    });

  function registerAppointmentEventHandlers(publisher = deps.publisher) {
    return registerAppointmentWorkflowHandlers(publisher, engine);
  }

  return {
    engine,
    registry,
    registerAppointmentEventHandlers
  };
}

module.exports = {
  createWorkflowModule,
  WorkflowEngine,
  WorkflowMissionRegistry,
  AppointmentWorkflowEvaluator,
  registerAppointmentWorkflowHandlers,
  createMissionDefinition,
  WorkflowDomainError,
  APPOINTMENT_WORKFLOW_RULES,
  APPOINTMENT_WORKFLOW_EVENT_TYPES,
  getAppointmentWorkflowRules
};
