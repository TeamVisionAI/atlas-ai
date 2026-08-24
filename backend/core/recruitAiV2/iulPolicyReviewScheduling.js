/**
 * BR-132 — IUL policy review scheduling bridge.
 * Reuses Sprint 22 personal availability reader; purpose=policy_review, default Zoom.
 */

"use strict";

const { APPOINTMENT_PURPOSES } = require("../configuration/appointmentDomain");
const {
  readRollingCandidateSlotsSync,
  READ_STATUS,
  resolveAvailabilityAgent
} = require("./schedulingAvailabilityReader");
const { IUL_REVIEW_MEETING_TYPE } = require("../iulWorkflowConstants");

function dayPartConstraints(dayPart) {
  if (dayPart === "evening" || dayPart === "night") {
    return { earliestTime: "17:00", latestTime: "21:00", dayPart: "evening" };
  }
  if (dayPart === "day" || dayPart === "morning") {
    return { earliestTime: "09:00", latestTime: "12:00", dayPart: "morning" };
  }
  if (dayPart === "afternoon") {
    return { earliestTime: "12:00", latestTime: "17:00", dayPart: "afternoon" };
  }
  return { dayPart: dayPart || null };
}

function buildPolicyReviewSchedulingContext(context = {}, knownFacts = {}) {
  const dayPart =
    knownFacts.reviewPreferredDayPart ||
    knownFacts.iulReviewDayPart ||
    knownFacts.preferredDayPart ||
    null;
  const constraints = dayPartConstraints(dayPart);
  return {
    ...context,
    conversationGoal: "policy_review",
    appointmentPurpose: APPOINTMENT_PURPOSES.POLICY_REVIEW,
    knownFacts: {
      ...(context.knownFacts || {}),
      ...knownFacts,
      preferredMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM,
      reviewMeetingType: IUL_REVIEW_MEETING_TYPE.ZOOM,
      preferredDayPart: dayPart || context.knownFacts?.preferredDayPart || null,
      availabilityConstraint: constraints.dayPart
        ? {
            type: "day_part",
            dayPart: constraints.dayPart,
            earliestTime: constraints.earliestTime || null,
            latestTime: constraints.latestTime || null
          }
        : context.knownFacts?.availabilityConstraint || null
    }
  };
}

async function readPolicyReviewAvailability({ context, interpretation, options } = {}) {
  return readPolicyReviewAvailabilitySync({ context, interpretation, options });
}

function readPolicyReviewAvailabilitySync({ context, interpretation, options } = {}) {
  const schedulingContext = buildPolicyReviewSchedulingContext(
    context,
    context.knownFacts || {}
  );
  const constraints = dayPartConstraints(
    schedulingContext.knownFacts?.reviewPreferredDayPart ||
      schedulingContext.knownFacts?.preferredDayPart
  );
  const { agentId: resolvedAgentId, agentResolutionSource } = resolveAvailabilityAgent({
    context: schedulingContext,
    options: options || {}
  });
  const fixtureSlots =
    options?.availabilityFixture?.slots ||
    schedulingContext._availabilityFixture?.slots ||
    null;
  const agentId =
    resolvedAgentId ||
    options?.agentId ||
    schedulingContext.agentId ||
    (fixtureSlots ? "fixture-agent" : null);
  const readResult = readRollingCandidateSlotsSync({
    organizationId: schedulingContext.organizationId || options?.organizationId || null,
    agentId,
    agentResolutionSource,
    timezone: schedulingContext.timezone || options?.timezone || "America/New_York",
    constraints,
    fixtureSlots,
    getSlotsSync: options?.getSlotsSync || null,
    now: options?.now || schedulingContext._testNow || null
  });
  const offered = (readResult?.offeredSlots || []).map((slot) => ({
    date: slot.date || slot.dateKey,
    time: slot.time || slot.timeKey,
    timezone: slot.timezone || readResult.timezone
  }));
  return {
    checked: true,
    status: readResult?.status || READ_STATUS.UNAVAILABLE,
    nearestAlternatives: offered,
    offeredSlots: offered,
    readResult,
    appointmentPurpose: APPOINTMENT_PURPOSES.POLICY_REVIEW,
    meetingType: IUL_REVIEW_MEETING_TYPE.ZOOM
  };
}

module.exports = {
  APPOINTMENT_PURPOSES,
  READ_STATUS,
  dayPartConstraints,
  buildPolicyReviewSchedulingContext,
  readPolicyReviewAvailability,
  readPolicyReviewAvailabilitySync
};
