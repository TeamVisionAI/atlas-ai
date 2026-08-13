/**
 * Sprint 8A.2 — Assembles the Mission Control workflow read model.
 * Derives stall/ownership for display. Ordinary reads do not persist transitions.
 * Explicit inbound/command paths may persist real BR-034 stall clearance only.
 */

const {
  mapToCanonicalMilestone,
  deriveDefaultOwnership,
  computeMissionControlPriority
} = require("./milestoneMapper");
const {
  resolveWorkflowState,
  loadPersistedWorkflowState,
  savePersistedWorkflowState
} = require("./workflowStateStore");
const { detectConversationStall } = require("./stallDetectionEngine");
const { applyStallTransition, hasDurableStallEpisode } = require("./workflowOwnershipEngine");
const {
  emitStallEscalationEvents,
  emitStallClearanceEvents
} = require("./workflowTransitionEvents");
const { applyTimeBasedReconciliation } = require("./workflowReconciliationEngine");
const {
  claimsScheduledInterview,
  resolveAppointmentMilestoneTruth
} = require("./appointmentMilestoneTruth");
const { supabase } = require("../services/supabaseService");
const { MILESTONES, OWNERSHIP } = require("./workflowConstants");

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
 * Sprint 8A.2/8A.6 pipeline: derive (always) → persist stall/time only when explicitly requested.
 * Ordinary MC/dashboard/queue reads must pass persistTransitions=false (default).
 */
async function evaluateWorkflowState({
  phone,
  prospect,
  brain,
  agentState,
  messageHints,
  persistTransitions = false
}) {
  const scope = {
    organizationId: prospect?.organization_id || null,
    prospectId: prospect?.id || null
  };
  const persisted = await loadPersistedWorkflowState(phone, scope);

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
    agentState: mergedAgentState,
    persist: persistTransitions === true
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

  let transition = {
    applied: false,
    previous: persisted,
    next: persisted,
    transition: null
  };
  let refreshed = persisted;

  if (persistTransitions === true) {
    transition = await applyStallTransition(
      phone,
      persisted,
      stallResult,
      computed,
      scope
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

    refreshed = await loadPersistedWorkflowState(phone, scope);
  }

  const displayAttention =
    Boolean(refreshed.needsHumanAttention) ||
    Boolean(stallResult.isStalled && !stallResult.cleared);
  const displayOwnership = displayAttention
    ? OWNERSHIP.AGENT
    : refreshed.workflowOwnership || computed.workflowOwnership;

  let resolved;
  if (persistTransitions === true) {
    resolved = await resolveWorkflowState(
      phone,
      {
        ...computed,
        needsHumanAttention: displayAttention,
        stalledAt: refreshed.stalledAt,
        workflowOwnership: displayOwnership
      },
      scope
    );
  } else {
    resolved = {
      canonicalMilestone: refreshed.canonicalMilestone || effectiveMilestone,
      workflowOwnership: displayOwnership,
      needsHumanAttention: displayAttention,
      stalledAt: refreshed.stalledAt,
      mappedFrom: computed.mappedFrom,
      source: "persisted"
    };
  }

  // Implements BR-039 — persisted/computed INTERVIEW_SCHEDULED cannot outrank
  // atlas_appointments. Workflow cache must not impersonate a scheduled interview.
  const appointmentTruth = await resolveAppointmentMilestoneTruth({
    phone,
    organizationId: prospect?.organization_id || null,
    milestone: resolved.canonicalMilestone,
    prospect
  });

  let canonicalMilestoneOut = appointmentTruth.milestone;
  let sourceOut = resolved.source;

  if (appointmentTruth.downgraded) {
    canonicalMilestoneOut = MILESTONES.INTERVIEW_READY;
    sourceOut = {
      ...(resolved.source || {}),
      milestone: "appointment_truth",
      appointmentMissing: true
    };

    if (
      persistTransitions === true &&
      phone &&
      claimsScheduledInterview(refreshed.canonicalMilestone)
    ) {
      await savePersistedWorkflowState(
        phone,
        {
          canonicalMilestone: MILESTONES.INTERVIEW_READY
        },
        scope
      );
    }
  }

  const priority = computeMissionControlPriority({
    milestone: canonicalMilestoneOut,
    needsHumanAttention: resolved.needsHumanAttention,
    agentState,
    prospect
  });

  return {
    canonicalMilestone: canonicalMilestoneOut,
    workflowOwnership: resolved.workflowOwnership,
    needsHumanAttention: resolved.needsHumanAttention,
    stalledAt: resolved.stalledAt,
    recommendedHumanAction: resolved.needsHumanAttention
      ? stallResult.recommendedAction || "call"
      : null,
    missionControlPriority: priority.rank,
    missionControlPriorityTier: priority.tier,
    source: sourceOut,
    mappedFrom: resolved.mappedFrom,
    appointmentMissing: appointmentTruth.downgraded === true,
    stall: {
      isStalled: stallResult.isStalled,
      reason: stallResult.reason || null,
      recommendedAction: stallResult.recommendedAction || null,
      lastAtlasOutboundAt: stallResult.lastAtlasOutboundAt || null
    },
    transition: persistTransitions === true ? transition : { applied: false }
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
    messageHints,
    persistTransitions: false
  });
}

/**
 * Explicit inbound command: clear a real BR-034 stall after prospect reply.
 * No-op when there is no durable stall episode (BR-080 attention must not clear).
 */
async function reconcileStallAfterProspectReply(prospect, options = {}) {
  const phone = prospect?.phone;
  if (!phone) {
    return { applied: false, reason: "NO_PHONE" };
  }

  const { loadAgentState } = require("./agentActionState");
  const scope = {
    organizationId: prospect.organization_id || options.organizationId || null,
    prospectId: prospect.id || options.prospectId || null
  };
  const persisted = await loadPersistedWorkflowState(phone, scope);

  if (!hasDurableStallEpisode(persisted)) {
    return { applied: false, reason: "NO_DURABLE_STALL_EPISODE", previous: persisted, next: persisted };
  }

  const messageHints = options.messageHints || (await fetchMessageHints(phone));
  const agentState = options.agentState || loadAgentState(phone);
  const mergedAgentState = {
    ...agentState,
    manualAgentOwnership: persisted.manualAgentOwnership,
    doNotContact: persisted.doNotContact
  };
  const milestone = persisted.canonicalMilestone || MILESTONES.NEW_LEAD;
  const computedOwnership = deriveDefaultOwnership(milestone, mergedAgentState);
  const stallResult = detectConversationStall({
    messageHints,
    milestone,
    prospect,
    defaultOwnership: computedOwnership,
    agentState: mergedAgentState
  });

  const transition = await applyStallTransition(
    phone,
    persisted,
    stallResult,
    { canonicalMilestone: milestone, workflowOwnership: computedOwnership },
    scope
  );

  if (transition.applied && transition.transition === "stall_cleared_prospect_reply") {
    await emitStallClearanceEvents({
      phone,
      milestone,
      ownershipBefore: persisted.workflowOwnership || computedOwnership,
      ownershipAfter: transition.next.workflowOwnership
    });
  }

  return transition;
}

module.exports = {
  buildWorkflowReadModel,
  evaluateWorkflowState,
  reconcileStallAfterProspectReply,
  fetchMessageHints,
  fetchLatestConversationEntry
};
