/**
 * ATLAS_SHARED_SCHEDULING_V2 — structured scheduling negotiation state.
 * Preserves partial constraints across turns (e.g. mañana + después de las 5).
 */

"use strict";

const {
  buildAvailabilityConstraint,
  resolveEarliestTimeInclusive
} = require("../recruitAiV2/schedulingConstraints");

function pickNonEmpty(...values) {
  for (const value of values) {
    if (value == null || value === "") {
      continue;
    }
    return value;
  }
  return null;
}

/**
 * Merge prior durable constraint with new inbound constraint.
 * Newer explicit fields supersede conflicting weaker prior fields.
 */
function mergeSchedulingConstraints(
  prior = null,
  incoming = null,
  context = {},
  interpretation = null
) {
  if (!prior && !incoming) {
    return null;
  }
  const merged = {
    ...(prior || {}),
    ...(incoming || {})
  };

  // Preserve day-part when incoming only adds a time bound.
  if (prior?.dayPart && !incoming?.dayPart) {
    merged.dayPart = prior.dayPart;
  }

  // Preserve earliestTime when incoming only adds latestTime (range expansion).
  if (prior?.earliestTime && !incoming?.earliestTime) {
    merged.earliestTime = prior.earliestTime;
    merged.earliestTimeInclusive =
      typeof prior.earliestTimeInclusive === "boolean"
        ? prior.earliestTimeInclusive
        : resolveEarliestTimeInclusive(prior);
  }

  // Preserve latestTime when incoming only adds earliestTime.
  if (prior?.latestTime && !incoming?.latestTime) {
    merged.latestTime = prior.latestTime;
  }

  // Incoming explicit time bounds supersede prior when both present.
  if (incoming?.earliestTime) {
    merged.earliestTime = incoming.earliestTime;
    merged.earliestTimeInclusive =
      typeof incoming.earliestTimeInclusive === "boolean"
        ? incoming.earliestTimeInclusive
        : resolveEarliestTimeInclusive(incoming);
  }
  if (incoming?.latestTime) {
    merged.latestTime = incoming.latestTime;
  }

  merged.type = merged.type || "availability_constraint";
  merged.raw = pickNonEmpty(incoming?.raw, prior?.raw, merged.raw);

  return buildAvailabilityConstraint({
    earliestTime: merged.earliestTime || null,
    latestTime: merged.latestTime || null,
    dayPart: merged.dayPart || null,
    explicitCandidateTime: merged.explicitCandidateTime || null,
    earliestTimeInclusive:
      typeof merged.earliestTimeInclusive === "boolean"
        ? merged.earliestTimeInclusive
        : resolveEarliestTimeInclusive(merged),
    raw: merged.raw || null
  });
}

function buildNegotiationState({ context = {}, interpretation = null } = {}) {
  const prior = context.knownFacts?.availabilityConstraint || null;
  const incoming = interpretation?.entities?.availabilityConstraint || null;
  const merged = mergeSchedulingConstraints(
    prior,
    incoming,
    context,
    interpretation
  );

  const requestedDate =
    interpretation?.entities?.resolvedDate?.isoDate ||
    context.appointment?.proposedDate ||
    null;
  const requestedDay =
    interpretation?.entities?.resolvedDate?.dayName ||
    context.appointment?.proposedDateLabel ||
    null;

  return {
    requestedDate,
    requestedDay,
    requestedDayPart:
      interpretation?.entities?.dayPart ||
      merged?.dayPart ||
      context.knownFacts?.preferredDayPart ||
      null,
    earliestTime: merged?.earliestTime || null,
    latestTime: merged?.latestTime || null,
    requestedExactTime:
      interpretation?.entities?.requestedTime ||
      context.appointment?.proposedTime ||
      merged?.explicitCandidateTime ||
      null,
    meetingMode:
      context.knownFacts?.preferredMeetingType ||
      context.appointment?.meetingType ||
      null,
    timezone: context.timezone || null,
    proposedSlots: context.appointment?.previouslyOfferedSlots || [],
    selectedSlot:
      context.appointment?.proposedDate && context.appointment?.proposedTime
        ? {
            date: context.appointment.proposedDate,
            time: context.appointment.proposedTime,
            timezone: context.timezone || null
          }
        : null,
    mergedConstraint: merged,
    provenance: {
      hasPriorConstraint: Boolean(prior),
      hasIncomingConstraint: Boolean(incoming),
      intent: interpretation?.intent || null
    }
  };
}

function shouldSuppressSchedulingReopen(context = {}) {
  const status = String(context.appointment?.status || "").toLowerCase();
  if (status === "confirmed" || status === "scheduled") {
    return true;
  }
  if (context.appointment?.confirmedAt || context.appointment?.appointmentId) {
    return true;
  }
  const stage = String(context.currentStage || "").toLowerCase();
  if (
    stage.includes("post_scheduling") ||
    stage.includes("zoom") ||
    stage.includes("preparation")
  ) {
    return true;
  }
  return false;
}

module.exports = {
  mergeSchedulingConstraints,
  buildNegotiationState,
  shouldSuppressSchedulingReopen
};
