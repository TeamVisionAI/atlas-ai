/**
 * Sprint 8A.6 — Workflow Gate descriptor for Mission Control (BR-028).
 * Gate UI uses human advancement API for outcomes — no parallel outcome logic here.
 */

const { isWorkflowGateActive } = require("./agentActionEngine");
const { buildInterviewOutcomeReadModel } = require("./interviewOutcomeMappings");
const { hasCanonicalRecordedOutcome } = require("./appointmentOutcomeState");

function buildWorkflowGateDescriptor(prospect, agentState, appointment = null) {
  if (hasCanonicalRecordedOutcome(appointment)) {
    return { active: false };
  }

  const active = isWorkflowGateActive(prospect, agentState);

  if (!active) {
    return { active: false };
  }

  const interviewOutcome = buildInterviewOutcomeReadModel(prospect);

  return {
    active: true,
    title: "Interview Outcome Required",
    message:
      "This interview has already occurred. Record the result so Atlas can continue the workflow.",
    outcomeCategories: interviewOutcome.categories,
    legacyAliases: interviewOutcome.legacyAliases,
    outcomes: interviewOutcome.categories.flatMap((category) => category.outcomes)
  };
}

module.exports = {
  buildWorkflowGateDescriptor
};
