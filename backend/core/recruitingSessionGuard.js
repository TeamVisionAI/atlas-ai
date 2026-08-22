/**
 * Bounded Recruit AI session — historical recruiting provenance alone must not
 * authorize automation indefinitely. Reuses REOPENED_INACTIVITY_MS (72h) as stale fallback.
 *
 * Inbox presentation (conversationsCenterInboxEligibility) is separate and unchanged.
 */

const { REOPENED_INACTIVITY_MS } = require("./whatsappConstants");
const { MILESTONES } = require("./workflowConstants");

const TERMINAL_PROSPECT_STEPS = Object.freeze(
  new Set(["CLOSED", "RECRUITED", "DO_NOT_CONTACT"])
);

const TERMINAL_MILESTONES = Object.freeze(
  new Set([MILESTONES.CLOSED, MILESTONES.DO_NOT_CONTACT])
);

/** Post-recruiting milestones — do not auto-restart qualification on random inbound. */
const COMPLETED_RECRUITING_MILESTONES = Object.freeze(
  new Set([
    MILESTONES.INTERVIEW_COMPLETED,
    MILESTONES.INTERVIEW_RESULT_PENDING,
    MILESTONES.FOLLOW_UP,
    MILESTONES.ORIENTATION,
    MILESTONES.LICENSING,
    MILESTONES.FAST_START
  ])
);

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function isDoNotContactStep(step) {
  const token = upper(step);
  return token.includes("DO NOT CONTACT") || token === "DO_NOT_CONTACT";
}

function parseTimestampMs(value) {
  if (value == null || value === "") {
    return null;
  }
  const ms = Date.parse(String(value));
  return Number.isNaN(ms) ? null : ms;
}

function resolveLastRecruitingActivityMs(prospect = {}, workflowState = {}) {
  const candidates = [
    prospect.updated_at,
    prospect.last_message_at,
    workflowState.returnedToAtlasAt,
    workflowState.humanTakenOverAt,
    workflowState.handoffAt,
    workflowState.initializedAt
  ];

  let latest = null;
  for (const candidate of candidates) {
    const ms = parseTimestampMs(candidate);
    if (ms == null) {
      continue;
    }
    if (latest == null || ms > latest) {
      latest = ms;
    }
  }
  return latest;
}

function hasActiveRecruitingWorkflowSignal(prospect = {}, workflowState = {}) {
  const milestone = upper(workflowState.canonicalMilestone);
  const step = upper(prospect.current_step);

  if (
    milestone &&
    milestone !== MILESTONES.NEW_LEAD &&
    milestone !== MILESTONES.GREETING_SENT &&
    !TERMINAL_MILESTONES.has(milestone) &&
    !COMPLETED_RECRUITING_MILESTONES.has(milestone)
  ) {
    return true;
  }

  if (
    step &&
    step !== "NEW" &&
    step !== "NEW_LEAD" &&
    !TERMINAL_PROSPECT_STEPS.has(step) &&
    !isDoNotContactStep(step)
  ) {
    return true;
  }

  return false;
}

/**
 * @returns {{ active: boolean, reason: string }}
 */
function evaluateRecruitingSessionActive({
  prospect = null,
  workflowState = null,
  now = Date.now()
} = {}) {
  if (!prospect) {
    return { active: false, reason: "MISSING_PROSPECT" };
  }

  const step = upper(prospect.current_step);
  if (TERMINAL_PROSPECT_STEPS.has(step) || isDoNotContactStep(step)) {
    return { active: false, reason: "PROSPECT_TERMINAL_STATE" };
  }

  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};

  if (wf.inboxClosedAt || wf.inboxArchivedAt) {
    return { active: false, reason: "CONVERSATION_CLOSED_OR_ARCHIVED" };
  }

  const milestone = upper(wf.canonicalMilestone);
  if (TERMINAL_MILESTONES.has(milestone)) {
    return { active: false, reason: "WORKFLOW_TERMINAL_MILESTONE" };
  }
  if (COMPLETED_RECRUITING_MILESTONES.has(milestone)) {
    return { active: false, reason: "RECRUITING_WORKFLOW_COMPLETED" };
  }

  const lastActivityMs = resolveLastRecruitingActivityMs(prospect, wf);
  const inactiveMs =
    lastActivityMs != null ? now - lastActivityMs : Number.POSITIVE_INFINITY;

  if (inactiveMs > REOPENED_INACTIVITY_MS) {
    return { active: false, reason: "RECRUITING_SESSION_EXPIRED" };
  }

  if (hasActiveRecruitingWorkflowSignal(prospect, wf)) {
    return { active: true, reason: "ACTIVE_RECRUITING_WORKFLOW" };
  }

  if (lastActivityMs != null) {
    return { active: true, reason: "RECENT_RECRUITING_ACTIVITY" };
  }

  return { active: false, reason: "RECRUITING_SESSION_INACTIVE" };
}

module.exports = {
  evaluateRecruitingSessionActive,
  resolveLastRecruitingActivityMs,
  hasActiveRecruitingWorkflowSignal,
  REOPENED_INACTIVITY_MS
};
