/**
 * BR-132 / BR-209 — IUL policy review scheduling bridge.
 * Reuses Sprint 22 personal availability reader; purpose=policy_review, default Zoom.
 * Never fabricates slots. Daypart empty → real alternatives, then recoverable state.
 */

"use strict";

const { APPOINTMENT_PURPOSES } = require("../configuration/appointmentDomain");
const {
  readRollingCandidateSlots,
  readRollingCandidateSlotsSync,
  READ_STATUS,
  resolveAvailabilityAgent,
  resolveAvailabilityAgentAsync
} = require("./schedulingAvailabilityReader");
const { IUL_REVIEW_MEETING_TYPE } = require("../iulWorkflowConstants");
const { selectIulCrossDatePage } = require("./iulSlotSelection");
const { resolveSchedulingConfig, WORKFLOW_TYPES } = require("../sharedScheduling/sharedSchedulingConfig");
const {
  mapSlotsForDecision,
  selectCrossDateCandidateSlots,
  slotIdentity
} = require("../sharedScheduling/sharedSchedulingOffer");

function normalizeIulDayPart(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (raw === "morning" || raw === "day") {
    return "morning";
  }
  if (raw === "afternoon") {
    return "afternoon";
  }
  if (raw === "evening" || raw === "night") {
    return "evening";
  }
  return raw || null;
}

function dayPartConstraints(dayPart) {
  const part = normalizeIulDayPart(dayPart);
  if (part === "evening") {
    return { earliestTime: "17:00", latestTime: "21:00", dayPart: "evening" };
  }
  if (part === "morning") {
    return {
      earliestTime: "09:00",
      latestTime: "12:00",
      latestTimeInclusive: false,
      dayPart: "morning"
    };
  }
  if (part === "afternoon") {
    return {
      earliestTime: "12:00",
      latestTime: "17:00",
      latestTimeInclusive: false,
      dayPart: "afternoon"
    };
  }
  return { dayPart: part || null };
}

function isWeekendSlot(slot) {
  const dateKey = String(slot?.dateKey || slot?.date || "");
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) {
    return false;
  }
  const weekday = new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function collectQualifyingSlots(availability) {
  const read = availability?.readResult || {};
  if (Array.isArray(read.slots)) {
    return read.slots;
  }
  if (availability?.alternativeToConstraint || availability?.fallbackKind) {
    return [];
  }
  if (Array.isArray(availability?.offeredSlots) && availability.offeredSlots.length) {
    return availability.offeredSlots;
  }
  return availability?.nearestAlternatives || [];
}

function collectUnconstrainedSlots(availability) {
  const read = availability?.readResult || {};
  if (Array.isArray(read.unconstrainedFutureSlots) && read.unconstrainedFutureSlots.length) {
    return read.unconstrainedFutureSlots;
  }
  return [];
}

function excludeRejected(slots, rejectIds = []) {
  const rejected = new Set((rejectIds || []).map((id) => String(id)));
  if (!rejected.size) {
    return Array.isArray(slots) ? slots : [];
  }
  return (slots || []).filter((slot) => {
    const id = slotIdentity(slot);
    return id && id !== "|" && !rejected.has(id);
  });
}

function pickIulSlots(pool, { preferredWeekend = false, rejectIds = [], crossDatePage = false } = {}) {
  const list = excludeRejected(Array.isArray(pool) ? pool : [], rejectIds);
  if (crossDatePage) {
    return {
      slots: selectIulCrossDatePage(list, { maxCandidates: 2 }),
      weekendMatched: false
    };
  }
  if (preferredWeekend) {
    const weekend = list.filter(isWeekendSlot);
    if (weekend.length) {
      return { slots: selectCrossDateCandidateSlots(weekend, { maxCandidates: 2 }), weekendMatched: true };
    }
  }
  return { slots: selectCrossDateCandidateSlots(list, { maxCandidates: 2 }), weekendMatched: false };
}

/**
 * BR-209 — after a daypart-constrained read:
 * 1) offer matching slots (weekend-first when requested)
 * 2) else nearest real slots in any daypart
 * 3) else zero / no fabrications
 */
function enrichIulDaypartAvailability(availability, { preferredWeekend = false, rejectIds = [], crossDatePage = false } = {}) {
  if (
    (availability?.fallbackKind != null || availability?.alternativeToConstraint === true) &&
    !(rejectIds || []).length
  ) {
    return availability;
  }
  if (!availability) {
    return {
      checked: true,
      status: READ_STATUS.ZERO_SLOTS,
      offeredSlots: [],
      nearestAlternatives: [],
      alternativeToConstraint: false,
      fallbackKind: "NO_AVAILABILITY"
    };
  }
  if (availability.status === READ_STATUS.UNAVAILABLE && !availability.readResult) {
    return {
      ...availability,
      offeredSlots: [],
      nearestAlternatives: [],
      alternativeToConstraint: false,
      fallbackKind: "UNAVAILABLE_READ"
    };
  }

  const timezone =
    availability.timezone ||
    availability.readResult?.timezone ||
    null;
  if (crossDatePage) {
    const combined = [];
    const seen = new Set();
    const push = (slot) => {
      const id = slotIdentity(slot);
      if (!id || id === "|" || seen.has(id)) {
        return;
      }
      seen.add(id);
      combined.push(slot);
    };
    collectQualifyingSlots(availability).forEach(push);
    collectUnconstrainedSlots(availability).forEach(push);
    (availability?.readResult?.slots || []).forEach(push);
    const page = pickIulSlots(combined, { preferredWeekend, rejectIds, crossDatePage: true });
    if (page.slots.length) {
      const offered = mapSlotsForDecision(
        page.slots,
        availability.timezone || availability.readResult?.timezone || null
      );
      return {
        ...availability,
        checked: true,
        status: READ_STATUS.AVAILABLE,
        offeredSlots: offered,
        nearestAlternatives: offered,
        alternativeToConstraint: false,
        fallbackKind: null,
        weekendMatched: page.weekendMatched
      };
    }
  }

  const qualifyingPick = pickIulSlots(collectQualifyingSlots(availability), {
    preferredWeekend,
    rejectIds,
    crossDatePage
  });
  if (qualifyingPick.slots.length) {
    const offered = mapSlotsForDecision(qualifyingPick.slots, timezone);
    return {
      ...availability,
      checked: true,
      status: READ_STATUS.AVAILABLE,
      offeredSlots: offered,
      nearestAlternatives: offered,
      alternativeToConstraint: false,
      fallbackKind: null,
      weekendMatched: qualifyingPick.weekendMatched
    };
  }

  const unconstrainedPick = pickIulSlots(collectUnconstrainedSlots(availability), {
    preferredWeekend,
    rejectIds,
    crossDatePage
  });
  if (unconstrainedPick.slots.length) {
    const offered = mapSlotsForDecision(unconstrainedPick.slots, timezone);
    return {
      ...availability,
      checked: true,
      status: READ_STATUS.AVAILABLE,
      offeredSlots: offered,
      nearestAlternatives: offered,
      alternativeToConstraint: true,
      fallbackKind: preferredWeekend && !unconstrainedPick.weekendMatched
        ? "WEEKEND_EMPTY_NEAREST"
        : "DAYPART_EMPTY_NEAREST",
      weekendMatched: unconstrainedPick.weekendMatched
    };
  }

  return {
    ...availability,
    checked: true,
    status: READ_STATUS.ZERO_SLOTS,
    offeredSlots: [],
    nearestAlternatives: [],
    alternativeToConstraint: false,
    fallbackKind: "NO_AVAILABILITY"
  };
}

function buildPolicyReviewSchedulingContext(context = {}, knownFacts = {}) {
  const dayPart = normalizeIulDayPart(
    knownFacts.reviewPreferredDayPart ||
      knownFacts.iulReviewDayPart ||
      knownFacts.preferredDayPart ||
      null
  );
  const constraints = dayPartConstraints(dayPart);
  const meetingMode = String(
    knownFacts.meetingMode ||
      knownFacts.reviewMeetingMode ||
      context.knownFacts?.meetingMode ||
      ""
  ).toLowerCase();
  const meetingType =
    meetingMode === "in_person" ||
    knownFacts.preferredMeetingType === IUL_REVIEW_MEETING_TYPE.IN_PERSON ||
    knownFacts.reviewMeetingType === IUL_REVIEW_MEETING_TYPE.IN_PERSON
      ? IUL_REVIEW_MEETING_TYPE.IN_PERSON
      : IUL_REVIEW_MEETING_TYPE.ZOOM;
  return {
    ...context,
    conversationGoal: "policy_review",
    appointmentPurpose: APPOINTMENT_PURPOSES.POLICY_REVIEW,
    knownFacts: {
      ...(context.knownFacts || {}),
      ...knownFacts,
      preferredMeetingType: meetingType,
      reviewMeetingType: meetingType,
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

function wrapReadResult(readResult, schedulingContext, schedulingConfig, options = {}) {
  if (options.skipDaypartEnrich === true) {
    const timezone = readResult?.timezone || schedulingContext.timezone;
    const raw = (readResult?.slots || []).length
      ? readResult.slots
      : readResult?.unconstrainedFutureSlots || [];
    const offered = mapSlotsForDecision(raw, timezone);
    return {
      checked: true,
      status: offered.length
        ? READ_STATUS.AVAILABLE
        : readResult?.status || READ_STATUS.ZERO_SLOTS,
      nearestAlternatives: offered,
      offeredSlots: offered,
      alternativeToConstraint: false,
      fallbackKind: null,
      readResult,
      appointmentPurpose: schedulingConfig.appointmentType,
      meetingType: schedulingConfig.defaultMeetingMode,
      schedulingConfig,
      timezone
    };
  }
  const offered = mapSlotsForDecision(
    readResult?.offeredSlots || [],
    readResult?.timezone || schedulingContext.timezone
  );
  return enrichIulDaypartAvailability(
    {
      checked: true,
      status: readResult?.status || READ_STATUS.UNAVAILABLE,
      nearestAlternatives: offered,
      offeredSlots: offered,
      alternativeToConstraint: Boolean(readResult?.alternativeToConstraint),
      readResult,
      appointmentPurpose: schedulingConfig.appointmentType,
      meetingType: schedulingConfig.defaultMeetingMode,
      schedulingConfig,
      timezone: readResult?.timezone || schedulingContext.timezone
    },
    {
      preferredWeekend: options.preferredWeekend === true,
      rejectIds: options.rejectIds || [],
      crossDatePage: options.crossDatePage === true
    }
  );
}

function resolveReadParams(context = {}, options = {}) {
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
  const schedulingConfig = resolveSchedulingConfig(schedulingContext, {
    workflowType: WORKFLOW_TYPES.IUL_POLICY_REVIEW,
    ...options
  });
  return {
    schedulingContext,
    constraints,
    agentId,
    agentResolutionSource,
    fixtureSlots,
    schedulingConfig,
    timezone: schedulingContext.timezone || options?.timezone || "America/New_York",
    preferredWeekend: Boolean(
      options.preferredWeekend ||
        schedulingContext.knownFacts?.preferredWeekend
    )
  };
}

async function readPolicyReviewAvailability({ context, interpretation, options } = {}) {
  const params = resolveReadParams(context, options);
  if (Array.isArray(params.fixtureSlots) || typeof options?.getSlotsSync === "function") {
    return readPolicyReviewAvailabilitySync({ context, interpretation, options });
  }

  const asyncAgent = await resolveAvailabilityAgentAsync({
    context: params.schedulingContext,
    options: options || {}
  });
  const agentId = asyncAgent.agentId || params.agentId;
  const readResult = await readRollingCandidateSlots({
    organizationId: params.schedulingContext.organizationId || options?.organizationId || null,
    agentId,
    agentResolutionSource: asyncAgent.agentResolutionSource || params.agentResolutionSource,
    timezone: params.timezone,
    constraints: params.constraints,
    purpose: params.schedulingConfig.purpose,
    fixtureSlots: params.fixtureSlots,
    getSlots: options?.getSlots || null,
    rejectIds: options?.rejectIds || [],
    now: options?.now || params.schedulingContext._testNow || null,
    expandFullHorizon: options?.expandFullHorizon === true
  });
  return wrapReadResult(readResult, params.schedulingContext, params.schedulingConfig, {
    preferredWeekend: params.preferredWeekend,
    rejectIds: options?.rejectIds || [],
    crossDatePage: options?.crossDatePage === true,
    skipDaypartEnrich: options?.skipDaypartEnrich === true
  });
}

function readPolicyReviewAvailabilitySync({ context, interpretation, options } = {}) {
  const params = resolveReadParams(context, options);
  const readResult = readRollingCandidateSlotsSync({
    organizationId: params.schedulingContext.organizationId || options?.organizationId || null,
    agentId: params.agentId,
    agentResolutionSource: params.agentResolutionSource,
    timezone: params.timezone,
    constraints: params.constraints,
    purpose: params.schedulingConfig.purpose,
    fixtureSlots: params.fixtureSlots,
    getSlotsSync: options?.getSlotsSync || null,
    rejectIds: options?.rejectIds || [],
    now: options?.now || params.schedulingContext._testNow || null,
    expandFullHorizon: options?.expandFullHorizon === true
  });
  return wrapReadResult(readResult, params.schedulingContext, params.schedulingConfig, {
    preferredWeekend: params.preferredWeekend,
    rejectIds: options?.rejectIds || [],
    crossDatePage: options?.crossDatePage === true,
    skipDaypartEnrich: options?.skipDaypartEnrich === true
  });
}

module.exports = {
  APPOINTMENT_PURPOSES,
  READ_STATUS,
  normalizeIulDayPart,
  dayPartConstraints,
  isWeekendSlot,
  enrichIulDaypartAvailability,
  buildPolicyReviewSchedulingContext,
  readPolicyReviewAvailability,
  readPolicyReviewAvailabilitySync
};
