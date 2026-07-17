/**
 * Sprint 8A.2 — BR-034 stall detection (read/evaluate only).
 * Detects 24h silence after Atlas's last outbound message.
 * Does not mutate state or emit events — see workflowOwnershipEngine.
 */

const {
  MILESTONES,
  OWNERSHIP,
  STALL_THRESHOLD_MS
} = require("./workflowConstants");
const { parseInterviewDatetime } = require("./parseInterviewDatetime");

function getNowMs() {
  try {
    return require("../dev/simulatorClock").getSimulatedNowMs();
  } catch {
    return Date.now();
  }
}

const EARLY_MILESTONES = new Set([
  MILESTONES.NEW_LEAD,
  MILESTONES.GREETING_SENT,
  MILESTONES.QUALIFICATION,
  MILESTONES.INTERVIEW_READY
]);

function parseInterviewTime(prospect) {
  return parseInterviewDatetime(prospect);
}

function isTerminalMilestone(milestone) {
  return (
    milestone === MILESTONES.CLOSED ||
    milestone === MILESTONES.DO_NOT_CONTACT
  );
}

/**
 * BR-034 trigger #3 — stall clock pauses for confirmed future interview.
 */
function isAwaitingScheduledEvent({ milestone, prospect, defaultOwnership }) {
  if (defaultOwnership !== OWNERSHIP.WAITING_EVENT) {
    return false;
  }

  if (milestone === MILESTONES.INTERVIEW_DUE) {
    return true;
  }

  if (
    milestone === MILESTONES.INTERVIEW_SCHEDULED &&
    prospect?.current_step === "CONFIRMED"
  ) {
    const interviewAt = parseInterviewTime(prospect);
    return interviewAt !== null && interviewAt > Date.now();
  }

  return false;
}

function recommendHumanAction(milestone) {
  return EARLY_MILESTONES.has(milestone) ? "call" : "call";
}

/**
 * Evaluates whether a conversation is stalled per BR-034.
 *
 * @returns {{
 *   isStalled: boolean,
 *   cleared?: boolean,
 *   lastAtlasOutboundAt?: string|null,
 *   stallDetectedAt?: string,
 *   stallEpisodeKey?: string,
 *   recommendedAction?: string,
 *   reason?: string
 * }}
 */
function detectConversationStall({
  messageHints = {},
  milestone,
  prospect,
  defaultOwnership,
  agentState = {}
}) {
  if (isTerminalMilestone(milestone)) {
    return { isStalled: false, reason: "terminal_milestone" };
  }

  if (agentState.doNotContact) {
    return { isStalled: false, reason: "do_not_contact" };
  }

  if (isAwaitingScheduledEvent({ milestone, prospect, defaultOwnership })) {
    return { isStalled: false, reason: "awaiting_scheduled_event" };
  }

  const lastOutboundAt = messageHints.lastOutboundAt || null;
  const lastInboundAt = messageHints.lastInboundAt || null;

  if (!lastOutboundAt) {
    return { isStalled: false, reason: "no_atlas_outbound" };
  }

  const outboundMs = Date.parse(lastOutboundAt);

  if (Number.isNaN(outboundMs)) {
    return { isStalled: false, reason: "invalid_outbound_timestamp" };
  }

  if (lastInboundAt) {
    const inboundMs = Date.parse(lastInboundAt);

    if (!Number.isNaN(inboundMs) && inboundMs > outboundMs) {
      return {
        isStalled: false,
        cleared: true,
        lastAtlasOutboundAt: lastOutboundAt,
        reason: "prospect_replied"
      };
    }
  }

  const elapsedMs = getNowMs() - outboundMs;

  if (elapsedMs < STALL_THRESHOLD_MS) {
    return {
      isStalled: false,
      lastAtlasOutboundAt: lastOutboundAt,
      reason: "within_sla"
    };
  }

  return {
    isStalled: true,
    lastAtlasOutboundAt: lastOutboundAt,
    stallDetectedAt: new Date(getNowMs()).toISOString(),
    stallEpisodeKey: lastOutboundAt,
    recommendedAction: recommendHumanAction(milestone),
    reason: "br_034_stall"
  };
}

module.exports = {
  detectConversationStall,
  isAwaitingScheduledEvent,
  isTerminalMilestone,
  recommendHumanAction,
  EARLY_MILESTONES
};
