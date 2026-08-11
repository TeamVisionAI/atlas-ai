/**
 * Sprint 8A.2 — Backend Mission Control priority queue.
 * Builds a sorted workflow queue from dashboard prospects (additive API field).
 */

const { buildQualificationBrain } = require("./informationModel");
const { loadAgentState } = require("./agentActionState");
const { evaluateWorkflowState, fetchMessageHints } = require("./workflowReadModel");

async function buildWorkflowSummaryForProspect(prospect) {
  if (!prospect?.phone) {
    return null;
  }

  const channel = "whatsapp";
  const lastMessage = prospect.last_message || "";
  const qualification = buildQualificationBrain(prospect, {
    channel,
    message: lastMessage
  });

  const brain = {
    currentStep: qualification.currentStep,
    nextField: qualification.nextField,
    missingFields: qualification.missingFields
  };

  const agentState = loadAgentState(prospect.phone);
  const messageHints = await fetchMessageHints(prospect.phone);

  const workflow = await evaluateWorkflowState({
    phone: prospect.phone,
    prospect,
    brain,
    agentState,
    messageHints
  });

  return {
    phone: prospect.phone,
    name: prospect.name || null,
    currentStep: brain.currentStep,
    canonicalMilestone: workflow.canonicalMilestone,
    workflowOwnership: workflow.workflowOwnership,
    needsHumanAttention: workflow.needsHumanAttention,
    missionControlPriority: workflow.missionControlPriority,
    missionControlPriorityTier: workflow.missionControlPriorityTier,
    stalledAt: workflow.stalledAt
  };
}

/**
 * Returns prospects sorted by missionControlPriority (rank 1 = highest).
 * Implements BR-136 — excludes operational TEST/CANARY/QA (not META_REVIEW demos).
 */
async function buildPrioritizedWorkflowQueue(prospects = []) {
  const {
    filterOutOperationalTestProspects
  } = require("./missionControlOperationalTestFilter");
  const eligible = filterOutOperationalTestProspects(prospects);

  const summaries = await Promise.all(
    eligible.map((prospect) => buildWorkflowSummaryForProspect(prospect))
  );

  return summaries
    .filter(Boolean)
    .sort((left, right) => {
      if (left.missionControlPriority !== right.missionControlPriority) {
        return left.missionControlPriority - right.missionControlPriority;
      }

      const leftStall = left.stalledAt ? Date.parse(left.stalledAt) : Infinity;
      const rightStall = right.stalledAt ? Date.parse(right.stalledAt) : Infinity;

      if (leftStall !== rightStall) {
        return leftStall - rightStall;
      }

      return String(left.phone).localeCompare(String(right.phone));
    });
}

module.exports = {
  buildPrioritizedWorkflowQueue,
  buildWorkflowSummaryForProspect
};
