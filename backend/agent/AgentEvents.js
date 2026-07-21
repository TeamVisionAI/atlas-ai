/**
 * Journey #5 Increment 1 — Agent domain events.
 */

const AgentEvent = Object.freeze({
  MESSAGE_RECEIVED: "agent.message.received",
  CONTEXT_LOADED: "agent.context.loaded",
  MEMORY_LOADED: "agent.memory.loaded",
  DECISION_CREATED: "agent.decision.created",
  RESPONSE_GENERATED: "agent.response.generated"
});

module.exports = {
  AgentEvent
};
