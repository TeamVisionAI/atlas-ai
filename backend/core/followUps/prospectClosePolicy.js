/**
 * BR-192 — terminal prospect disposition → cancel open follow-up obligations.
 * Does not invent recycle follow-ups (BR-178 still creates those after cancel
 * when an interview not_interested outcome supplies an explicit future date).
 */

const { MILESTONES } = require("../workflowConstants");

const TERMINAL_FOLLOW_UP_MILESTONES = Object.freeze(
  new Set([MILESTONES.CLOSED, MILESTONES.DO_NOT_CONTACT])
);

const FOLLOW_UP_CLOSE_REASONS = Object.freeze({
  NOT_INTERESTED: "prospect_closed_not_interested",
  DISQUALIFIED: "prospect_closed_disqualified",
  DO_NOT_CONTACT: "prospect_closed_do_not_contact",
  UNSUBSCRIBE: "prospect_closed_unsubscribe",
  ALREADY_WORKING: "prospect_closed_already_working",
  UNABLE_TO_CONTACT: "prospect_closed_unable_to_contact",
  CLOSED: "prospect_closed"
});

const NON_TERMINAL_FOLLOW_UP_MILESTONES = Object.freeze(
  new Set([
    MILESTONES.NEW_LEAD,
    MILESTONES.GREETING_SENT,
    MILESTONES.QUALIFICATION,
    MILESTONES.INTERVIEW_READY,
    MILESTONES.INTERVIEW_SCHEDULED,
    MILESTONES.INTERVIEW_DUE,
    MILESTONES.INTERVIEW_COMPLETED,
    MILESTONES.INTERVIEW_RESULT_PENDING,
    MILESTONES.FOLLOW_UP,
    MILESTONES.ORIENTATION,
    MILESTONES.LICENSING,
    MILESTONES.FAST_START
  ])
);

const PROSPECT_LINKED_FOLLOW_UP_ENTITY_TYPES = Object.freeze(
  new Set(["prospect", "conversation", "appointment"])
);

function slugifyDisposition(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function isTerminalFollowUpMilestone(milestone) {
  return TERMINAL_FOLLOW_UP_MILESTONES.has(String(milestone || "").toUpperCase());
}

function isNonTerminalFollowUpMilestone(milestone) {
  return NON_TERMINAL_FOLLOW_UP_MILESTONES.has(String(milestone || "").toUpperCase());
}

function resolveFollowUpCloseReason({
  targetMilestone = null,
  outcome = null,
  inboxCloseReason = null,
  closeReason = null
} = {}) {
  if (closeReason && Object.values(FOLLOW_UP_CLOSE_REASONS).includes(closeReason)) {
    return closeReason;
  }

  const milestone = String(targetMilestone || "").toUpperCase();
  const inbox = slugifyDisposition(inboxCloseReason);
  const outcomeSlug = slugifyDisposition(outcome);

  if (milestone === MILESTONES.DO_NOT_CONTACT || inbox === "do_not_contact") {
    return FOLLOW_UP_CLOSE_REASONS.DO_NOT_CONTACT;
  }
  if (inbox === "unsubscribe" || outcomeSlug === "unsubscribe") {
    return FOLLOW_UP_CLOSE_REASONS.UNSUBSCRIBE;
  }
  if (
    outcomeSlug === "not_qualified" ||
    outcomeSlug === "disqualified" ||
    inbox === "not_qualified"
  ) {
    return FOLLOW_UP_CLOSE_REASONS.DISQUALIFIED;
  }
  if (
    outcomeSlug === "already_working_with_another_company" ||
    outcomeSlug === "already_working"
  ) {
    return FOLLOW_UP_CLOSE_REASONS.ALREADY_WORKING;
  }
  if (outcomeSlug === "unable_to_contact") {
    return FOLLOW_UP_CLOSE_REASONS.UNABLE_TO_CONTACT;
  }
  if (outcomeSlug === "not_interested" || inbox === "not_interested") {
    return FOLLOW_UP_CLOSE_REASONS.NOT_INTERESTED;
  }
  if (milestone === MILESTONES.CLOSED) {
    return FOLLOW_UP_CLOSE_REASONS.CLOSED;
  }

  return null;
}

function isProspectLinkedFollowUp(row, { prospectId = null, subjectPhone = null } = {}) {
  if (!PROSPECT_LINKED_FOLLOW_UP_ENTITY_TYPES.has(String(row?.entityType || ""))) {
    return false;
  }
  const keys = new Set(
    [prospectId, subjectPhone]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  );
  if (!keys.size) {
    return false;
  }
  return (
    keys.has(String(row.entityId || "").trim()) ||
    keys.has(String(row.subjectPhone || "").trim())
  );
}

module.exports = {
  TERMINAL_FOLLOW_UP_MILESTONES,
  NON_TERMINAL_FOLLOW_UP_MILESTONES,
  FOLLOW_UP_CLOSE_REASONS,
  PROSPECT_LINKED_FOLLOW_UP_ENTITY_TYPES,
  isTerminalFollowUpMilestone,
  isNonTerminalFollowUpMilestone,
  resolveFollowUpCloseReason,
  isProspectLinkedFollowUp
};
