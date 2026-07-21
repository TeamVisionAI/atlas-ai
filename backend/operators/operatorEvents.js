/**
 * Sprint 12.4 — Operator domain events (emitted via shared EventBus).
 */

const OperatorEvent = Object.freeze({
  ASSIGNED: "operator.assigned",
  UNASSIGNED: "operator.unassigned"
});

module.exports = {
  OperatorEvent
};
