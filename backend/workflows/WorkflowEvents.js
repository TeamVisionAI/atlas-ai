/**
 * Sprint 13.0 — Workflow Engine domain events.
 */

const WorkflowEvent = Object.freeze({
  STARTED: "workflow.started",
  STEP_CHANGED: "workflow.stepChanged",
  COMPLETED: "workflow.completed",
  CANCELLED: "workflow.cancelled",
  FAILED: "workflow.failed",
  PAUSED: "workflow.paused",
  RESUMED: "workflow.resumed"
});

module.exports = {
  WorkflowEvent
};
