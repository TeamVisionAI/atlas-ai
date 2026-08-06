/**
 * Sprint 8A.1 — Read-only canonical milestone mapping.
 * Derives MILESTONES.* from existing prospect fields, engine steps, and agent state.
 * Does not mutate data or trigger conversation behavior.
 */

const {
  MILESTONES,
  OWNERSHIP,
  PRIORITY_TIERS,
  INTERVIEW_SOON_MS
} = require("./workflowConstants");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");

function parseInterviewTime(prospect) {
  return parseInterviewDatetime(prospect);
}

function getNowMs() {
  try {
    return require("../dev/simulatorClock").getSimulatedNowMs();
  } catch {
    return Date.now();
  }
}

function isInterviewPast(prospect) {
  const at = parseInterviewTime(prospect);
  return at !== null && at < getNowMs();
}

function isInterviewSoon(prospect) {
  const at = parseInterviewTime(prospect);

  if (at === null) {
    return false;
  }

  const delta = at - getNowMs();
  return delta >= 0 && delta <= INTERVIEW_SOON_MS;
}

function isFollowUpDue(agentState) {
  if (
    agentState?.outcome !== "Needs More Time" &&
    agentState?.outcome !== "No Show"
  ) {
    return false;
  }

  if (!agentState?.followUpDate) {
    return true;
  }

  const followUpAt = Date.parse(
    `${agentState.followUpDate}T${agentState.followUpTime || "00:00"}`
  );

  if (Number.isNaN(followUpAt)) {
    return true;
  }

  return followUpAt <= getNowMs();
}

/**
 * Detect GREETING_SENT from message log hints (optional, read-only).
 * @param {{ lastOutboundAt?: string|null, lastInboundAt?: string|null }} messageHints
 */
function isGreetingSentPhase(currentStep, messageHints) {
  if (currentStep !== "GREETING") {
    return false;
  }

  if (!messageHints?.lastOutboundAt) {
    return false;
  }

  if (!messageHints.lastInboundAt) {
    return true;
  }

  return (
    Date.parse(messageHints.lastOutboundAt) >
    Date.parse(messageHints.lastInboundAt)
  );
}

/**
 * Maps legacy engine state to canonical milestone (read-only).
 */
function mapToCanonicalMilestone({
  prospect,
  currentStep,
  missingFields = [],
  agentState = {},
  messageHints = {}
}) {
  if (agentState.doNotContact) {
    return MILESTONES.DO_NOT_CONTACT;
  }

  if (agentState.outcome === "Not Interested") {
    return MILESTONES.CLOSED;
  }

  if (agentState.outcome === "Recruited") {
    if (agentState.onboardingUnlocked) {
      return MILESTONES.LICENSING;
    }

    if (agentState.orientationScheduled) {
      return MILESTONES.ORIENTATION;
    }

    return MILESTONES.ORIENTATION;
  }

  if (
    agentState.outcome === "Needs More Time" ||
    agentState.outcome === "No Show"
  ) {
    return MILESTONES.FOLLOW_UP;
  }

  if (currentStep === "CONFIRMED") {
    if (!agentState.outcome && isInterviewPast(prospect)) {
      return MILESTONES.INTERVIEW_RESULT_PENDING;
    }

    if (isInterviewSoon(prospect)) {
      return MILESTONES.INTERVIEW_DUE;
    }

    if (isInterviewPast(prospect)) {
      return MILESTONES.INTERVIEW_COMPLETED;
    }

    return MILESTONES.INTERVIEW_SCHEDULED;
  }

  // Ready to schedule — not yet scheduled. INTERVIEW_SCHEDULED requires
  // CONFIRMED (below) and an active atlas_appointments row (BR-039 gate).
  if (
    missingFields.includes("schedule") ||
    currentStep === "SCHEDULE" ||
    currentStep === "EMAIL"
  ) {
    return MILESTONES.INTERVIEW_READY;
  }

  if (missingFields.length === 0 && currentStep !== "GREETING") {
    return MILESTONES.INTERVIEW_READY;
  }

  if (isGreetingSentPhase(currentStep, messageHints)) {
    return MILESTONES.GREETING_SENT;
  }

  if (
    !currentStep ||
    currentStep === "NEW" ||
    currentStep === "GREETING"
  ) {
    if (missingFields.length) {
      return MILESTONES.QUALIFICATION;
    }

    return MILESTONES.NEW_LEAD;
  }

  if (
    ["WORK_AUTHORIZATION", "OCCUPATION", "INTERVIEW_TYPE"].includes(currentStep)
  ) {
    return MILESTONES.QUALIFICATION;
  }

  return MILESTONES.QUALIFICATION;
}

/**
 * Default ownership from milestone when no persisted override exists.
 */
function deriveDefaultOwnership(milestone, agentState = {}) {
  if (
    milestone === MILESTONES.CLOSED ||
    milestone === MILESTONES.DO_NOT_CONTACT
  ) {
    return OWNERSHIP.CLOSED;
  }

  if (milestone === MILESTONES.INTERVIEW_RESULT_PENDING) {
    return OWNERSHIP.AGENT;
  }

  if (milestone === MILESTONES.INTERVIEW_COMPLETED) {
    return OWNERSHIP.AGENT;
  }

  if (
    milestone === MILESTONES.INTERVIEW_SCHEDULED ||
    milestone === MILESTONES.INTERVIEW_DUE ||
    milestone === MILESTONES.GREETING_SENT
  ) {
    return OWNERSHIP.WAITING_EVENT;
  }

  if (milestone === MILESTONES.FOLLOW_UP && agentState.followUpDate) {
    const followUpAt = Date.parse(
      `${agentState.followUpDate}T${agentState.followUpTime || "00:00"}`
    );

    if (!Number.isNaN(followUpAt) && followUpAt > Date.now()) {
      return OWNERSHIP.WAITING_EVENT;
    }
  }

  if (agentState.manualAgentOwnership) {
    return OWNERSHIP.AGENT;
  }

  return OWNERSHIP.ATLAS;
}

function isOpenNewLeadAttention(prospect = {}) {
  if (prospect.acknowledged_at || prospect.attention_status === "acknowledged") {
    return false;
  }

  if (prospect.attention_status === "resolved") {
    return false;
  }

  const step = String(prospect.current_step || prospect.status || "").toUpperCase();
  if (["CLOSED", "DO_NOT_CONTACT", "RECRUITED"].includes(step)) {
    return false;
  }

  return Boolean(
    prospect.new_lead_received_at ||
      prospect.attention_status === "new" ||
      prospect.attention_status === "ai_responding" ||
      prospect.attention_status === "waiting_for_prospect" ||
      prospect.attention_status === "human_required" ||
      milestoneIsEarlyLead(prospect)
  );
}

function milestoneIsEarlyLead(prospect = {}) {
  const step = String(prospect.current_step || prospect.status || "").toUpperCase();
  return ["NEW", "GREETING", "NEW_LEAD", "GREETING_SENT"].includes(step);
}

/**
 * Mission Control priority tier (read-only, Sprint 8A target order + BR-080).
 * PENDING_INTERVIEW_RESULTS remains CRITICAL (rank 1) — not weakened.
 * UNASSIGNED_NEW_LEAD also uses rank 1; both are critical.
 */
function computeMissionControlPriority({
  milestone,
  needsHumanAttention = false,
  agentState = {},
  prospect
}) {
  if (milestone === MILESTONES.INTERVIEW_RESULT_PENDING) {
    return {
      rank: PRIORITY_TIERS.PENDING_INTERVIEW_RESULTS,
      tier: "PENDING_INTERVIEW_RESULTS"
    };
  }

  const unassigned =
    prospect &&
    !prospect.owner_user_id &&
    isOpenNewLeadAttention(prospect);

  if (unassigned) {
    return {
      rank: PRIORITY_TIERS.UNASSIGNED_NEW_LEAD,
      tier: "UNASSIGNED_NEW_LEAD"
    };
  }

  if (needsHumanAttention || prospect?.attention_status === "human_required") {
    return {
      rank: PRIORITY_TIERS.HUMAN_ESCALATION,
      tier: "HUMAN_ESCALATION"
    };
  }

  if (
    prospect?.owner_user_id &&
    isOpenNewLeadAttention(prospect) &&
    !prospect.acknowledged_at
  ) {
    return {
      rank: PRIORITY_TIERS.ASSIGNED_UNACKNOWLEDGED_NEW,
      tier: "ASSIGNED_UNACKNOWLEDGED_NEW"
    };
  }

  if (milestone === MILESTONES.INTERVIEW_DUE) {
    return {
      rank: PRIORITY_TIERS.INTERVIEW_IMMEDIATE,
      tier: "INTERVIEW_IMMEDIATE"
    };
  }

  if (milestone === MILESTONES.FOLLOW_UP && isFollowUpDue(agentState)) {
    return {
      rank: PRIORITY_TIERS.FOLLOW_UP_DUE,
      tier: "FOLLOW_UP_DUE"
    };
  }

  if (
    milestone === MILESTONES.CLOSED ||
    milestone === MILESTONES.DO_NOT_CONTACT
  ) {
    return { rank: PRIORITY_TIERS.MONITORING, tier: "MONITORING" };
  }

  if (
    milestone === MILESTONES.INTERVIEW_SCHEDULED &&
    prospect?.current_step === "CONFIRMED"
  ) {
    const at = parseInterviewTime(prospect);

    if (at !== null && at > Date.now() && !isInterviewSoon(prospect)) {
      return { rank: PRIORITY_TIERS.MONITORING, tier: "MONITORING" };
    }
  }

  return { rank: PRIORITY_TIERS.ATLAS_ACTIVE, tier: "ATLAS_ACTIVE" };
}

module.exports = {
  mapToCanonicalMilestone,
  deriveDefaultOwnership,
  computeMissionControlPriority,
  isInterviewPast,
  isInterviewSoon,
  isFollowUpDue
};
