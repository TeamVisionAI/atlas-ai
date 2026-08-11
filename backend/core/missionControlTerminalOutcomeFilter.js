/**
 * BR-044 — Mission Control default-queue exclusion for terminal closed interview outcomes.
 *
 * Uses canonical milestone / recorded outcome / durable appointment outcome.
 * Does not invent a new close flag. Does not reuse Conversations lifecycle helpers.
 * Meta Review demos remain visible (same posture as BR-136).
 */

"use strict";

const { MILESTONES } = require("./workflowConstants");
const { isMetaReviewDemoProspect } = require("./missionControlOperationalTestFilter");
const { loadAgentState } = require("./agentActionState");
const { APPOINTMENT_OUTCOMES } = require("./configuration/appointmentDomain");

/** Representative closed outcomes (BR-044 selector + catalog closes). */
const TERMINAL_CLOSED_INTERVIEW_OUTCOMES = Object.freeze(
  new Set([
    "Not Interested",
    "Not Qualified",
    "Already Working with Another Company",
    "Unable to Contact"
  ])
);

/** Durable appointment outcome slugs that mean interview work is closed. */
const TERMINAL_CLOSED_APPOINTMENT_OUTCOMES = Object.freeze(
  new Set([
    APPOINTMENT_OUTCOMES.NOT_INTERESTED,
    "not_interested"
  ])
);

/** Non-terminal — must stay actionable in default MC. */
const NON_TERMINAL_INTERVIEW_OUTCOMES = Object.freeze(
  new Set([
    "No Show",
    "Follow Up Needed",
    "Needs More Time",
    "Rescheduled",
    "Reschedule Interview"
  ])
);

function normalizeOutcomeLabel(value) {
  return String(value || "").trim();
}

function isTerminalClosedInterviewOutcome(outcome) {
  const label = normalizeOutcomeLabel(outcome);
  if (!label) {
    return false;
  }
  if (NON_TERMINAL_INTERVIEW_OUTCOMES.has(label)) {
    return false;
  }
  if (TERMINAL_CLOSED_INTERVIEW_OUTCOMES.has(label)) {
    return true;
  }
  const slug = label.toLowerCase().replace(/\s+/g, "_");
  return TERMINAL_CLOSED_APPOINTMENT_OUTCOMES.has(slug);
}

function isTerminalClosedAppointment(appointment = null) {
  if (!appointment) {
    return false;
  }
  const outcome = String(appointment.outcome || "").trim().toLowerCase();
  if (TERMINAL_CLOSED_APPOINTMENT_OUTCOMES.has(outcome)) {
    return true;
  }
  const lifecycle = String(
    appointment.metadata?.lifecycleState || appointment.lifecycleState || ""
  )
    .trim()
    .toLowerCase();
  return lifecycle === "not_interested";
}

/**
 * Whether a prospect should leave the default Mission Control / Prospect Center
 * operational interview/qualification queue as a terminal close.
 *
 * Recruited / Became Client / No Show / Follow Up / Rescheduled are NOT excluded here
 * (they keep post-interview operational tracks).
 */
function isTerminalClosedForMissionControlQueue({
  prospect = null,
  summary = null,
  agentState = null,
  appointment = null
} = {}) {
  if (!prospect && !summary) {
    return false;
  }

  if (prospect && isMetaReviewDemoProspect(prospect)) {
    return false;
  }

  const milestone = String(
    summary?.canonicalMilestone ||
      prospect?.workflow_state?.canonicalMilestone ||
      ""
  ).toUpperCase();

  if (
    milestone === MILESTONES.CLOSED ||
    milestone === MILESTONES.DO_NOT_CONTACT
  ) {
    return true;
  }

  const step = String(prospect?.current_step || "").toUpperCase();
  if (step === "CLOSED" || step === "DO_NOT_CONTACT") {
    return true;
  }

  const agent = agentState || (summary?.phone ? loadAgentState(summary.phone) : null);
  if (
    agent &&
    (isTerminalClosedInterviewOutcome(agent.outcome) ||
      isTerminalClosedInterviewOutcome(agent.interviewBusinessOutcome) ||
      isTerminalClosedInterviewOutcome(agent.closureReason))
  ) {
    return true;
  }

  if (isTerminalClosedAppointment(appointment)) {
    return true;
  }

  return false;
}

async function filterOutTerminalClosedForMissionControl(
  prospects = [],
  summaries = [],
  options = {}
) {
  const findLatestAppointment =
    options.findLatestAppointmentFn ||
    (async (phone, organizationId) => {
      try {
        const {
          findLatestPersistedAppointmentForProspect
        } = require("../services/appointmentListService");
        return findLatestPersistedAppointmentForProspect(phone, organizationId);
      } catch {
        return null;
      }
    });

  const byPhone = new Map((prospects || []).map((row) => [row.phone, row]));
  const kept = [];

  for (const summary of summaries || []) {
    const prospect = byPhone.get(summary.phone) || null;
    if (prospect && isMetaReviewDemoProspect(prospect)) {
      kept.push(summary);
      continue;
    }

    let appointment = null;
    const milestone = String(summary.canonicalMilestone || "").toUpperCase();
    const agent = loadAgentState(summary.phone);
    const needsApptLookup =
      !isTerminalClosedInterviewOutcome(agent.outcome) &&
      !isTerminalClosedInterviewOutcome(agent.interviewBusinessOutcome) &&
      milestone !== MILESTONES.CLOSED &&
      milestone !== MILESTONES.DO_NOT_CONTACT &&
      (milestone === MILESTONES.INTERVIEW_RESULT_PENDING ||
        milestone === MILESTONES.INTERVIEW_COMPLETED ||
        milestone === MILESTONES.INTERVIEW_SCHEDULED ||
        milestone === MILESTONES.INTERVIEW_DUE);

    if (needsApptLookup && prospect) {
      appointment = await findLatestAppointment(
        summary.phone,
        prospect.organization_id || options.organizationId || null
      );
    }

    if (
      isTerminalClosedForMissionControlQueue({
        prospect,
        summary,
        agentState: agent,
        appointment
      })
    ) {
      continue;
    }

    kept.push(summary);
  }

  return kept;
}

module.exports = {
  TERMINAL_CLOSED_INTERVIEW_OUTCOMES,
  TERMINAL_CLOSED_APPOINTMENT_OUTCOMES,
  NON_TERMINAL_INTERVIEW_OUTCOMES,
  isTerminalClosedInterviewOutcome,
  isTerminalClosedAppointment,
  isTerminalClosedForMissionControlQueue,
  filterOutTerminalClosedForMissionControl
};
