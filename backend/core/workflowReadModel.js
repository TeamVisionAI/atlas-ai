/**
 * Sprint 8A.2 — Assembles the Mission Control workflow read model.
 * Evaluates stall detection, ownership transitions, and events on read (BR-034).
 * Does not alter conversation pipeline or UI.
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
const { detectConversationStall } = require("./stallDetectionEngine");
const { applyStallTransition } = require("./workflowOwnershipEngine");
const {
  emitStallEscalationEvents,
  emitStallClearanceEvents
} = require("./workflowTransitionEvents");
const { applyTimeBasedReconciliation } = require("./workflowReconciliationEngine");
const { supabase } = require("../services/supabaseService");
const { OWNERSHIP } = require("./workflowConstants");

/**
 * Message log hints for GREETING_SENT detection and BR-034 stall clock.
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
 * Latest conversation log entry for Mission Control preview (Sprint 8A.6).
 */
async function fetchLatestConversationEntry(phone) {
  if (!phone) {
    return null;
  }

  try {
    const { data, error } = await supabase
      .from("conversation_logs")
      .select("message, direction, created_at")
      .eq("prospect_phone", phone)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return {
      text: data.message || "",
      direction: String(data.direction || "").toLowerCase(),
      timestamp: data.created_at
    };
  } catch {
    return null;
  }
}

/**
 * Sprint 8A.2/8A.6 pipeline: reconcile → detect → transition → emit → resolve → priority.
 */
async function evaluateWorkflowState({
  phone,
  prospect,
  brain,
  agentState,
  messageHints
}) {
  const persisted = loadPersistedWorkflowState(phone);

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

  const reconciliation = await applyTimeBasedReconciliation({
    phone,
    computedMilestone: canonicalMilestone,
    computedOwnership: workflowOwnership,
    prospect,
    agentState: mergedAgentState
  });

  const effectiveMilestone = reconciliation.milestone;
  const effectiveOwnership = reconciliation.ownership;

  const computed = {
    canonicalMilestone: effectiveMilestone,
    workflowOwnership: effectiveOwnership,
    needsHumanAttention: false,
    stalledAt: null,
    mappedFrom: {
      currentStep: brain?.currentStep || null,
      agentOutcome: agentState?.outcome || null,
      missingFieldCount: (brain?.missingFields || []).length
    }
  };

  const stallResult = detectConversationStall({
    messageHints,
    milestone: effectiveMilestone,
    prospect,
    defaultOwnership: effectiveOwnership,
    agentState: mergedAgentState
  });

  const ownershipBefore =
    persisted.workflowOwnership || effectiveOwnership;

  const transition = applyStallTransition(
    phone,
    persisted,
    stallResult,
    computed
  );

  if (transition.applied) {
    if (transition.transition === "br_034_stall") {
      await emitStallEscalationEvents({
        phone,
        milestone: effectiveMilestone,
        ownershipBefore,
        stallResult
      });
    } else if (transition.transition === "stall_cleared_prospect_reply") {
      await emitStallClearanceEvents({
        phone,
        milestone: effectiveMilestone,
        ownershipBefore,
        ownershipAfter: transition.next.workflowOwnership
      });
    }
  }

  const refreshed = loadPersistedWorkflowState(phone);

  const resolved = resolveWorkflowState(phone, {
    ...computed,
    needsHumanAttention: refreshed.needsHumanAttention,
    stalledAt: refreshed.stalledAt,
    workflowOwnership: refreshed.needsHumanAttention
      ? OWNERSHIP.AGENT
      : refreshed.workflowOwnership || computed.workflowOwnership
  });

  const priority = computeMissionControlPriority({
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
    recommendedHumanAction: resolved.needsHumanAttention
      ? stallResult.recommendedAction || "call"
      : null,
    missionControlPriority: priority.rank,
    missionControlPriorityTier: priority.tier,
    source: resolved.source,
    mappedFrom: resolved.mappedFrom,
    stall: {
      isStalled: stallResult.isStalled,
      reason: stallResult.reason || null,
      recommendedAction: stallResult.recommendedAction || null,
      lastAtlasOutboundAt: stallResult.lastAtlasOutboundAt || null
    }
  };
}

/**
 * @param {Object} input
 * @param {Object} input.prospect
 * @param {Object} input.brain — { currentStep, missingFields }
 * @param {Object} input.agentState
 */
async function buildWorkflowReadModel({ prospect, brain, agentState }) {
  const phone = prospect?.phone;
  const messageHints = await fetchMessageHints(phone);

  return evaluateWorkflowState({
    phone,
    prospect,
    brain,
    agentState,
    messageHints
  });
}

module.exports = {
  buildWorkflowReadModel,
  evaluateWorkflowState,
  fetchMessageHints,
  fetchLatestConversationEntry
};
