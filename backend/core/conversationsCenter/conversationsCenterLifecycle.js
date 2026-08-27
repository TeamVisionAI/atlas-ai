/**
 * Conversations Center inbox lifecycle — DERIVED presentation state.
 * Does not delete transcripts, mutate Calendar, or invent appointment truth.
 * Implements conversation Active-work inbox (presentation only).
 */

const { OWNERSHIP, MILESTONES } = require("../workflowConstants");
const { loadAgentState } = require("../agentActionState");
const { isSimulatorProspect } = require("../productionProspectFilter");

const INBOX_LIFECYCLE = Object.freeze({
  ACTIVE: "ACTIVE",
  SCHEDULED: "SCHEDULED",
  CLOSED: "CLOSED",
  TEST: "TEST",
  ARCHIVED: "ARCHIVED"
});

/** Soft-close reasons for unscheduled / operator close (presentation). */
const INBOX_CLOSE_REASONS = Object.freeze({
  NOT_INTERESTED: "NOT_INTERESTED",
  NOT_NOW: "NOT_NOW",
  WRONG_NUMBER: "WRONG_NUMBER",
  DO_NOT_CONTACT: "DO_NOT_CONTACT",
  WINDOW_EXPIRED: "WINDOW_EXPIRED",
  OTHER: "OTHER"
});

const CLOSED_OUTCOMES = new Set([
  "not interested",
  "not_interested",
  "not qualified",
  "not_qualified",
  "already working with another company",
  "unable to contact",
  "recruited",
  "became client",
  "became_client",
  "do not contact",
  "do_not_contact"
]);

const SCHEDULED_MILESTONES = new Set([
  MILESTONES.INTERVIEW_SCHEDULED,
  MILESTONES.INTERVIEW_DUE
]);

const SCHEDULED_STEPS = new Set([
  "interview_scheduled",
  "interview scheduled",
  "scheduled",
  "confirmed",
  "interview_due",
  "interview due",
  "pending_confirmation",
  "rescheduled"
]);

function normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
}

function isClosedOutcome(outcome) {
  if (!outcome) {
    return false;
  }
  const token = normalizeToken(outcome);
  if (CLOSED_OUTCOMES.has(token)) {
    return true;
  }
  return (
    token.includes("not interested") ||
    token === "recruited" ||
    token.includes("became client")
  );
}

function isTestProspect(prospect = {}, persisted = {}) {
  const phone = prospect.phone || persisted.phone || null;
  if (phone && isSimulatorProspect(phone)) {
    return true;
  }

  if (persisted.inboxMarkedTestAt) {
    return true;
  }

  const entry = String(prospect.entry_method || "").toUpperCase();
  const source = String(
    prospect.source ||
      (prospect.lead_source && prospect.lead_source.source) ||
      ""
  ).toUpperCase();

  if (
    entry.includes("META_REVIEW") ||
    source.includes("META_REVIEW") ||
    entry === "CANARY" ||
    source === "CANARY" ||
    entry === "TEST" ||
    source === "TEST" ||
    source === "QA" ||
    entry === "QA"
  ) {
    return true;
  }

  return false;
}

function resolveProspectStep(prospect = {}) {
  return normalizeToken(
    prospect.appointment_status || prospect.current_step || ""
  );
}

function isScheduledStep(prospect = {}, persisted = {}) {
  const milestone = String(persisted.canonicalMilestone || "").toUpperCase();
  if (SCHEDULED_MILESTONES.has(milestone)) {
    return true;
  }

  const step = resolveProspectStep(prospect);
  if (!step) {
    return false;
  }

  return SCHEDULED_STEPS.has(step) || step.includes("interview scheduled");
}

function isClosedFromCanonical(prospect = {}, persisted = {}, agentState = null) {
  if (persisted.doNotContact === true) {
    return true;
  }

  if (persisted.workflowOwnership === OWNERSHIP.CLOSED) {
    return true;
  }

  const milestone = String(persisted.canonicalMilestone || "").toUpperCase();
  if (
    milestone === MILESTONES.CLOSED ||
    milestone === MILESTONES.DO_NOT_CONTACT
  ) {
    return true;
  }

  if (persisted.inboxClosedAt) {
    return true;
  }

  const agent = agentState || loadAgentState(prospect.phone);
  if (isClosedOutcome(agent.outcome)) {
    return true;
  }
  if (isClosedOutcome(agent.closureReason)) {
    return true;
  }

  // Interview completed + closed business outcome (Ana Perez pattern).
  const step = resolveProspectStep(prospect);
  if (
    (milestone === MILESTONES.INTERVIEW_COMPLETED ||
      step.includes("interview completed") ||
      step === "completed") &&
    isClosedOutcome(agent.outcome)
  ) {
    return true;
  }

  return false;
}

/**
 * Derive inbox lifecycle for one conversation list/detail item.
 * Priority: TEST → persisted ARCHIVED → CLOSED → SCHEDULED → window-expired ARCHIVED → ACTIVE
 *
 * @returns {{ lifecycle: string, closeReason: string|null, scheduled: boolean, closed: boolean, test: boolean, archived: boolean, outcome: string|null }}
 */
function resolveInboxLifecycle({
  prospect = {},
  persisted = {},
  agentState = null,
  customerCareWindow = null
} = {}) {
  const agent = agentState || (prospect.phone ? loadAgentState(prospect.phone) : null);
  const test = isTestProspect(prospect, persisted);
  if (test) {
    return {
      lifecycle: INBOX_LIFECYCLE.TEST,
      closeReason: persisted.inboxCloseReason || null,
      scheduled: false,
      closed: false,
      test: true,
      archived: false,
      outcome: agent?.outcome || null
    };
  }

  if (persisted.inboxArchivedAt) {
    return {
      lifecycle: INBOX_LIFECYCLE.ARCHIVED,
      closeReason: persisted.inboxCloseReason || null,
      scheduled: isScheduledStep(prospect, persisted),
      closed: Boolean(persisted.inboxClosedAt),
      test: false,
      archived: true,
      outcome: agent?.outcome || null
    };
  }

  if (isClosedFromCanonical(prospect, persisted, agent)) {
    return {
      lifecycle: INBOX_LIFECYCLE.CLOSED,
      closeReason:
        persisted.inboxCloseReason ||
        (agent?.closureReason ? String(agent.closureReason) : null) ||
        (agent?.outcome ? String(agent.outcome) : null),
      scheduled: false,
      closed: true,
      test: false,
      archived: false,
      outcome: agent?.outcome || null
    };
  }

  if (isScheduledStep(prospect, persisted)) {
    return {
      lifecycle: INBOX_LIFECYCLE.SCHEDULED,
      closeReason: null,
      scheduled: true,
      closed: false,
      test: false,
      archived: false,
      outcome: agent?.outcome || null
    };
  }

  if (
    customerCareWindow &&
    customerCareWindow.open === false &&
    customerCareWindow.reason === "WINDOW_EXPIRED"
  ) {
    return {
      lifecycle: INBOX_LIFECYCLE.ARCHIVED,
      closeReason: persisted.inboxCloseReason || INBOX_CLOSE_REASONS.WINDOW_EXPIRED,
      scheduled: false,
      closed: false,
      test: false,
      archived: true,
      outcome: agent?.outcome || null
    };
  }

  return {
    lifecycle: INBOX_LIFECYCLE.ACTIVE,
    closeReason: null,
    scheduled: false,
    closed: false,
    test: false,
    archived: false,
    outcome: agent?.outcome || null
  };
}

function isActiveInboxLifecycle(lifecycle) {
  return lifecycle === INBOX_LIFECYCLE.ACTIVE;
}

function isArchivedInboxBucket(lifecycle) {
  return (
    lifecycle === INBOX_LIFECYCLE.ARCHIVED ||
    lifecycle === INBOX_LIFECYCLE.CLOSED ||
    lifecycle === INBOX_LIFECYCLE.SCHEDULED
  );
}

function normalizeCloseReason(reason) {
  const raw = String(reason || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_");
  if (Object.values(INBOX_CLOSE_REASONS).includes(raw)) {
    return raw;
  }
  if (!raw) {
    return INBOX_CLOSE_REASONS.OTHER;
  }
  return INBOX_CLOSE_REASONS.OTHER;
}

module.exports = {
  INBOX_LIFECYCLE,
  INBOX_CLOSE_REASONS,
  resolveInboxLifecycle,
  isActiveInboxLifecycle,
  isArchivedInboxBucket,
  isTestProspect,
  isClosedOutcome,
  normalizeCloseReason
};
