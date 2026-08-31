/**
 * Sprint 8A.2 — Backend Mission Control priority queue.
 * Builds a sorted workflow queue from dashboard prospects (additive API field).
 */

const { buildQualificationBrain } = require("./informationModel");
const { loadAgentState } = require("./agentActionState");
const { evaluateWorkflowState } = require("./workflowReadModel");
const { workflowStateFromProspectRow } = require("./workflowStateStore");
const {
  loadMissionControlQueueBatch,
  lookupByPhone,
  messageHintsFromLogs
} = require("./missionControlQueueBatch");

function brainForProspect(prospect) {
  const qualification = buildQualificationBrain(prospect, {
    channel: "whatsapp",
    message: prospect?.last_message || ""
  });
  return {
    currentStep: qualification.currentStep,
    nextField: qualification.nextField,
    missingFields: qualification.missingFields
  };
}

async function buildWorkflowSummaryForProspect(prospect, options = {}) {
  if (!prospect?.phone) {
    return null;
  }

  const brain = brainForProspect(prospect);
  const agentState = loadAgentState(prospect.phone);
  const logs = options.logs || [];
  const messageHints = options.messageHints || messageHintsFromLogs(logs);
  const persisted =
    options.persisted ||
    (prospect.id && prospect.organization_id
      ? workflowStateFromProspectRow(prospect)
      : null);

  const workflow = await evaluateWorkflowState({
    phone: prospect.phone,
    prospect,
    brain,
    agentState,
    messageHints,
    persistTransitions: false,
    persisted,
    activeAppointment: options.activeAppointment
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

function sortWorkflowQueue(items = []) {
  return [...items].sort((left, right) => {
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

/**
 * Returns prospects sorted by missionControlPriority (rank 1 = highest).
 * Implements BR-136 — excludes operational TEST/CANARY/QA (not META_REVIEW demos).
 * Implements BR-044 — excludes terminal closed interview outcomes from default queue.
 */
async function buildPrioritizedWorkflowQueue(prospects = [], options = {}) {
  const {
    filterOutOperationalTestProspects
  } = require("./missionControlOperationalTestFilter");
  const {
    filterOutTerminalClosedForMissionControl
  } = require("./missionControlTerminalOutcomeFilter");

  const eligible = filterOutOperationalTestProspects(prospects);
  const organizationId = options.organizationId || eligible[0]?.organization_id || null;
  const batch = await loadMissionControlQueueBatch(eligible, {
    organizationId,
    fetchConversationLogsFn: options.fetchConversationLogsFn,
    listAppointmentsFn: options.listAppointmentsFn,
    loadProspectPhoneOrgIndexFn: options.loadProspectPhoneOrgIndexFn,
    onQuery: options.onQuery,
    supabase: options.supabase
  });

  const summaries = await Promise.all(
    eligible.map((prospect) =>
      buildWorkflowSummaryForProspect(prospect, {
        logs: lookupByPhone(batch.logsByPhone, prospect.phone) || [],
        persisted: workflowStateFromProspectRow(prospect),
        activeAppointment: lookupByPhone(batch.activeByPhone, prospect.phone) ?? null
      })
    )
  );

  const openWork = await filterOutTerminalClosedForMissionControl(
    eligible,
    summaries.filter(Boolean),
    {
      organizationId,
      latestAppointmentByPhone: batch.latestByPhone
    }
  );

  const sorted = sortWorkflowQueue(openWork);
  if (options.stats) {
    options.stats.queries = batch.stats;
    options.stats.eligible = eligible.length;
    options.stats.returned = sorted.length;
  }
  return sorted;
}

module.exports = {
  buildPrioritizedWorkflowQueue,
  buildWorkflowSummaryForProspect,
  sortWorkflowQueue
};
