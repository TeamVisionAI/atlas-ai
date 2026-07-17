/**
 * Sprint 8A.2 — Backend Mission Control priority queue.
 * Builds a sorted workflow queue from dashboard prospects (additive API field).
 */

const { parseSchedulingState } = require("./schedulingState");
const { applyBusinessRulesToProfile } = require("./businessRulesApplicator");
const {
  buildProfileFromProspect,
  getMissingFields,
  deriveCurrentStep
} = require("./informationModel");
const { loadAgentState } = require("./agentActionState");
const { evaluateWorkflowState, fetchMessageHints } = require("./workflowReadModel");

async function buildWorkflowSummaryForProspect(prospect) {
  if (!prospect?.phone) {
    return null;
  }

  const channel = "whatsapp";
  const profile = buildProfileFromProspect(prospect, channel);
  const schedulingState = parseSchedulingState(prospect.notes);
  const lastMessage = prospect.last_message || "";
  const { profile: ruledProfile } = applyBusinessRulesToProfile(
    { ...profile },
    lastMessage
  );

  const brain = {
    currentStep: deriveCurrentStep(ruledProfile, schedulingState),
    missingFields: getMissingFields(ruledProfile)
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
 */
async function buildPrioritizedWorkflowQueue(prospects = []) {
  const summaries = await Promise.all(
    prospects.map((prospect) => buildWorkflowSummaryForProspect(prospect))
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
