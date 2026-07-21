/**
 * Journey #5 Increment 2 — Agent workflow intelligence events.
 */

const WorkflowIntelligenceEvent = Object.freeze({
  LOADED: "workflow.loaded",
  STATE_UPDATED: "workflow.state.updated",
  STEP_COMPLETED: "workflow.step.completed",
  READY: "workflow.ready"
});

module.exports = {
  WorkflowIntelligenceEvent
};
