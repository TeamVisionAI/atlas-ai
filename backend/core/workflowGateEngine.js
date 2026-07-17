/**
 * Sprint 8A.6 — Workflow Gate descriptor for Mission Control (BR-028).
 * Gate UI uses human advancement API for outcomes — no parallel outcome logic here.
 */

const { isWorkflowGateActive } = require("./agentActionEngine");

const GATE_OUTCOMES = Object.freeze([
  { id: "Recruited", label: "Recruited" },
  { id: "No Show", label: "No Show" },
  { id: "Needs More Time", label: "Follow Up" },
  { id: "Not Interested", label: "Not Interested" },
  { id: "Rescheduled", label: "Rescheduled" }
]);

function buildWorkflowGateDescriptor(prospect, agentState) {
  const active = isWorkflowGateActive(prospect, agentState);

  if (!active) {
    return { active: false };
  }

  return {
    active: true,
    title: "Interview Outcome Required",
    message:
      "This interview has already occurred. Record the result so Atlas can continue the workflow.",
    outcomes: GATE_OUTCOMES.map((row) => ({ ...row }))
  };
}

module.exports = {
  buildWorkflowGateDescriptor,
  GATE_OUTCOMES
};
