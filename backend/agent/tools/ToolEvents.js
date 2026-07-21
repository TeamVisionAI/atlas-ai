/**
 * Journey #5 Increment 3 — Tool execution events.
 */

const ToolEvent = Object.freeze({
  REQUESTED: "agent.tool.requested",
  VALIDATED: "agent.tool.validated",
  EXECUTED: "agent.tool.executed",
  FAILED: "agent.tool.failed",
  COMPLETED: "agent.tool.completed"
});

module.exports = {
  ToolEvent
};
