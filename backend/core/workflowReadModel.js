/**
 * Sprint 8A.1 — Assembles the Mission Control workflow read model.
 * Read-only: maps existing data to canonical milestone + ownership + priority.
 */

const {
  mapToCanonicalMilestone,
  deriveDefaultOwnership,
  computeMissionControlPriority
} = require("./milestoneMapper");
const {
  resolveWorkflowState,
  loadPersistedWorkflowState
} = require("./workflowStateStore");
const { supabase } = require("../services/supabaseService");

/**
 * Optional read-only message hints for GREETING_SENT detection.
 */
async function fetchMessageHints(phone) {
  if (!phone) {
    return {};
  }

  try {
    const { data, error } = await supabase
      .from("conversation_logs")
      .select("direction, created_at")
      .eq("prospect_phone", phone)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error || !data?.length) {
      return {};
    }

    let lastOutboundAt = null;
    let lastInboundAt = null;

    for (const row of data) {
      const direction = String(row.direction || "").toLowerCase();

      if (!lastOutboundAt && direction === "outgoing") {
        lastOutboundAt = row.created_at;
      }

      if (!lastInboundAt && direction === "incoming") {
        lastInboundAt = row.created_at;
      }

      if (lastOutboundAt && lastInboundAt) {
        break;
      }
    }

    return { lastOutboundAt, lastInboundAt };
  } catch {
    return {};
  }
}

/**
 * @param {Object} input
 * @param {Object} input.prospect
 * @param {Object} input.brain — { currentStep, missingFields }
 * @param {Object} input.agentState
 */
async function buildWorkflowReadModel({ prospect, brain, agentState }) {
  const phone = prospect?.phone;
  const persisted = loadPersistedWorkflowState(phone);
  const messageHints = await fetchMessageHints(phone);

  const mergedAgentState = {
    ...agentState,
    manualAgentOwnership: persisted.manualAgentOwnership,
    doNotContact: persisted.doNotContact
  };

  const canonicalMilestone = mapToCanonicalMilestone({
    prospect,
    currentStep: brain?.currentStep,
    missingFields: brain?.missingFields || [],
    agentState: mergedAgentState,
    messageHints
  });

  const workflowOwnership = deriveDefaultOwnership(
    canonicalMilestone,
    mergedAgentState
  );

  const needsHumanAttention = false;

  const priority = computeMissionControlPriority({
    milestone: canonicalMilestone,
    needsHumanAttention,
    agentState,
    prospect
  });

  const computed = {
    canonicalMilestone,
    workflowOwnership,
    needsHumanAttention,
    stalledAt: null,
    mappedFrom: {
      currentStep: brain?.currentStep || null,
      agentOutcome: agentState?.outcome || null,
      missingFieldCount: (brain?.missingFields || []).length
    }
  };

  const resolved = resolveWorkflowState(phone, computed);

  const finalPriority = computeMissionControlPriority({
    milestone: resolved.canonicalMilestone,
    needsHumanAttention: resolved.needsHumanAttention,
    agentState,
    prospect
  });

  return {
    canonicalMilestone: resolved.canonicalMilestone,
    workflowOwnership: resolved.workflowOwnership,
    needsHumanAttention: resolved.needsHumanAttention,
    stalledAt: resolved.stalledAt,
    missionControlPriority: finalPriority.rank,
    missionControlPriorityTier: finalPriority.tier,
    source: resolved.source,
    mappedFrom: resolved.mappedFrom
  };
}

module.exports = {
  buildWorkflowReadModel,
  fetchMessageHints
};
