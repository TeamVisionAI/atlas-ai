/**
 * Recruit AI v2 — SchedulingAvailabilityReader (BR-107).
 *
 * Thin read-only adapter over Sprint 22 appointmentApplicationService.getSlots.
 * Never books, reserves, creates, updates, deletes, or mutates BR-080 / Calendar / WhatsApp.
 */

/**
 * Prefer ~3× 30-min interview grid so 17:30 pairs with 19:00, not 18:30.
 * If no slot meets spacing, fall back to the next later real slot.
 */
const DEFAULT_SPACING_MINUTES = 90;
const DEFAULT_MAX_CANDIDATES = 2;
const DEFAULT_TIMEZONE = "America/New_York";

const AGENT_RESOLUTION = Object.freeze({
  ASSIGNED_OWNER: "assigned_owner",
  EXISTING_BR080_OWNER: "existing_br080_owner",
  ORG_DEFAULT: "org_default",
  UNRESOLVED: "unresolved"
});

const READ_STATUS = Object.freeze({
  AVAILABLE: "available",
  ZERO_SLOTS: "zero_slots",
  UNAVAILABLE: "unavailable"
});

function timeKeyToMinutes(timeKey) {
  if (timeKey == null || timeKey === "") {
    return null;
  }
  const raw = String(timeKey).trim();
  if (!raw || !raw.includes(":")) {
    return null;
  }
  const [h, m] = raw.split(":").map((part) => Number(part));
  if (!Number.isFinite(h)) {
    return null;
  }
  return h * 60 + (Number.isFinite(m) ? m : 0);
}

function normalizeSlot(raw, timezone = DEFAULT_TIMEZONE) {
  if (!raw) {
    return null;
  }
  const dateKey = raw.dateKey || raw.date || null;
  const timeKey = raw.timeKey || raw.time || null;
  if (!dateKey || !timeKey) {
    return null;
  }
  return {
    date: dateKey,
    dateKey,
    time: timeKey,
    timeKey,
    startTimeISO: raw.startTimeISO || null,
    endTimeISO: raw.endTimeISO || null,
    durationMinutes: raw.durationMinutes || null,
    timezone: raw.timezone || timezone
  };
}

/**
 * Read-only agent resolution. Never assigns or mutates BR-080.
 * Precedence: explicit context agent → BR-080 owner fields → org default recruiter.
 */
function resolveAvailabilityAgent({ context = {}, options = {} } = {}) {
  const explicit =
    options.agentId ||
    context.agentId ||
    context.schedulingAgentId ||
    context.scheduling?.agentId ||
    null;
  if (explicit) {
    return {
      agentId: String(explicit),
      agentResolutionSource: AGENT_RESOLUTION.ASSIGNED_OWNER
    };
  }

  const owner =
    context.prospectOwnerUserId ||
    context.ownerUserId ||
    context.identity?.ownerUserId ||
    context.identity?.owner_user_id ||
    context.prospect?.owner_user_id ||
    context.prospect?.ownerUserId ||
    options.ownerUserId ||
    null;
  if (owner) {
    return {
      agentId: String(owner),
      agentResolutionSource: AGENT_RESOLUTION.EXISTING_BR080_OWNER
    };
  }

  const orgDefault =
    options.defaultRecruiterUserId ||
    context.orgDefaultRecruiterUserId ||
    context.organization?.defaultRecruiterUserId ||
    context.organizationSettings?.scheduling?.defaultRecruiterUserId ||
    null;
  if (orgDefault) {
    return {
      agentId: String(orgDefault),
      agentResolutionSource: AGENT_RESOLUTION.ORG_DEFAULT
    };
  }

  return {
    agentId: null,
    agentResolutionSource: AGENT_RESOLUTION.UNRESOLVED
  };
}

function resolveConcreteScheduleDate({ context = {}, interpretation = null } = {}) {
  const fromIntent = interpretation?.entities?.resolvedDate?.isoDate || null;
  if (fromIntent) {
    return String(fromIntent);
  }
  if (context.appointment?.proposedDate) {
    return String(context.appointment.proposedDate);
  }
  return null;
}

function resolveConstraints({ context = {}, interpretation = null } = {}) {
  const fromIntent = interpretation?.entities?.availabilityConstraint || null;
  const fromContext = context.knownFacts?.availabilityConstraint || null;
  const constraint = fromIntent || fromContext || null;
  return {
    earliestTime: constraint?.earliestTime || null,
    latestTime: constraint?.latestTime || null,
    dayPart: constraint?.dayPart || null
  };
}

/**
 * Explicit earliest/latest outrank day-part. Do not use engine afternoon (ends 18:00)
 * when earliestTime is set — pass timePreference "any" and filter here.
 */
function filterSlotsByConstraints(slots, constraints = {}) {
  const earliest = timeKeyToMinutes(constraints.earliestTime);
  const latest = timeKeyToMinutes(constraints.latestTime);
  return (slots || []).filter((slot) => {
    const minutes = timeKeyToMinutes(slot.timeKey || slot.time);
    if (minutes == null) {
      return false;
    }
    if (earliest != null && minutes < earliest) {
      return false;
    }
    if (latest != null && minutes > latest) {
      return false;
    }
    return true;
  });
}

function sortSlotsChronologically(slots) {
  return [...(slots || [])].sort((a, b) => {
    const dateCmp = String(a.dateKey || a.date || "").localeCompare(
      String(b.dateKey || b.date || "")
    );
    if (dateCmp !== 0) {
      return dateCmp;
    }
    return (
      (timeKeyToMinutes(a.timeKey || a.time) || 0) -
      (timeKeyToMinutes(b.timeKey || b.time) || 0)
    );
  });
}

/**
 * Slot A = first; Slot B = earliest ≥ spacingMinutes later, else next later real slot.
 * Never fabricates times.
 */
function selectCandidateSlots(
  slots,
  {
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    spacingMinutes = DEFAULT_SPACING_MINUTES,
    rejectTimes = []
  } = {}
) {
  const rejected = new Set((rejectTimes || []).map((t) => String(t)));
  const ordered = sortSlotsChronologically(slots).filter(
    (slot) => !rejected.has(String(slot.timeKey || slot.time))
  );
  if (!ordered.length) {
    return [];
  }

  const first = ordered[0];
  const selected = [first];
  if (maxCandidates < 2) {
    return selected;
  }

  const firstMinutes = timeKeyToMinutes(first.timeKey || first.time);
  const spaced = ordered.find((slot) => {
    if (slot === first) {
      return false;
    }
    const minutes = timeKeyToMinutes(slot.timeKey || slot.time);
    return minutes != null && firstMinutes != null && minutes >= firstMinutes + spacingMinutes;
  });
  if (spaced) {
    selected.push(spaced);
    return selected;
  }

  const nextLater = ordered.find((slot) => slot !== first);
  if (nextLater) {
    selected.push(nextLater);
  }
  return selected;
}

function buildUnavailableResult({
  organizationId = null,
  agentId = null,
  date = null,
  timezone = DEFAULT_TIMEZONE,
  constraints = {},
  agentResolutionSource = AGENT_RESOLUTION.UNRESOLVED,
  failureReason = "unsafe_context"
} = {}) {
  return {
    status: READ_STATUS.UNAVAILABLE,
    organizationId,
    agentId,
    date,
    timezone,
    constraints: {
      earliestTime: constraints.earliestTime || null,
      latestTime: constraints.latestTime || null
    },
    slots: [],
    offeredSlots: [],
    source: "sprint22",
    agentResolutionSource,
    failureReason
  };
}

function toDecisionAvailability(readResult) {
  if (!readResult || readResult.status === READ_STATUS.UNAVAILABLE) {
    return {
      checked: false,
      status: READ_STATUS.UNAVAILABLE,
      requestedSlotAvailable: null,
      nearestAlternatives: [],
      providerFailure: true,
      agentResolutionSource: readResult?.agentResolutionSource || AGENT_RESOLUTION.UNRESOLVED,
      failureReason: readResult?.failureReason || "unavailable",
      readResult
    };
  }

  const offered = (readResult.offeredSlots || []).map((slot) => ({
    date: slot.date || slot.dateKey,
    time: slot.time || slot.timeKey,
    timezone: slot.timezone || readResult.timezone
  }));

  return {
    checked: true,
    status: readResult.status,
    requestedSlotAvailable: null,
    nearestAlternatives: offered,
    providerFailure: false,
    agentResolutionSource: readResult.agentResolutionSource,
    failureReason: null,
    readResult
  };
}

/**
 * @param {object} params
 * @param {object[]} [params.fixtureSlots] - deterministic slots; skips live Sprint 22 read
 * @param {Function} [params.getSlots] - injectable Sprint 22 getSlots (tests)
 */
async function readCandidateSlots({
  organizationId = null,
  agentId = null,
  agentResolutionSource = AGENT_RESOLUTION.UNRESOLVED,
  date = null,
  timezone = DEFAULT_TIMEZONE,
  constraints = {},
  purpose = "recruiting_interview",
  maxCandidates = DEFAULT_MAX_CANDIDATES,
  spacingMinutes = DEFAULT_SPACING_MINUTES,
  rejectTimes = [],
  fixtureSlots = null,
  getSlots = null,
  maxResults = 24
} = {}) {
  if (!date) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date,
      timezone,
      constraints,
      agentResolutionSource,
      failureReason: "missing_concrete_date"
    });
  }

  if (!agentId) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date,
      timezone,
      constraints,
      agentResolutionSource: agentResolutionSource || AGENT_RESOLUTION.UNRESOLVED,
      failureReason: "missing_agent"
    });
  }

  let rawSlots = [];
  let resolvedTimezone = timezone || DEFAULT_TIMEZONE;

  try {
    if (Array.isArray(fixtureSlots)) {
      rawSlots = fixtureSlots
        .map((slot) => normalizeSlot(slot, resolvedTimezone))
        .filter(Boolean);
    } else {
      const getSlotsFn =
        getSlots ||
        ((params) =>
          require("../../application/appointmentApplicationService").getSlots(params));
      const result = await getSlotsFn({
        agentId,
        organizationId,
        date,
        purpose,
        // Explicit after-time must not use afternoon preference (truncates at 18:00).
        timePreference: "any",
        maxResults
      });
      resolvedTimezone = result?.timezone || resolvedTimezone;
      rawSlots = (result?.slots || [])
        .map((slot) => normalizeSlot(slot, resolvedTimezone))
        .filter(Boolean);
    }
  } catch (error) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date,
      timezone: resolvedTimezone,
      constraints,
      agentResolutionSource,
      failureReason: "provider_failure"
    });
  }

  const filtered = filterSlotsByConstraints(rawSlots, constraints);
  const offered = selectCandidateSlots(filtered, {
    maxCandidates,
    spacingMinutes,
    rejectTimes
  });

  return {
    status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
    organizationId,
    agentId,
    date,
    timezone: resolvedTimezone,
    constraints: {
      earliestTime: constraints.earliestTime || null,
      latestTime: constraints.latestTime || null
    },
    slots: filtered,
    offeredSlots: offered,
    source: "sprint22",
    agentResolutionSource,
    failureReason: null
  };
}

/**
 * Decide whether this turn should attempt a read-only availability offer.
 * Requires concrete date + explicit time constraint. Never invents a date.
 */
function shouldAttemptAvailabilityOffer({ context, interpretation } = {}) {
  const date = resolveConcreteScheduleDate({ context, interpretation });
  if (!date) {
    return false;
  }
  const constraints = resolveConstraints({ context, interpretation });
  if (!constraints.earliestTime && !constraints.latestTime) {
    return false;
  }

  const intent = interpretation?.intent || null;
  const { INTENTS } = require("./constants");
  return (
    intent === INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT ||
    intent === INTENTS.SCHEDULING_DATE_PROPOSAL ||
    intent === INTENTS.REASSERT_KNOWN_FACT
  );
}

/**
 * Orchestrator helper: resolve agent + read (fixture or live) → decision availability.
 * Sync-friendly when fixtureSlots / precomputed availability provided.
 */
async function resolveAvailabilityForTurn({
  context,
  interpretation,
  availability = null,
  options = {}
} = {}) {
  if (availability) {
    return availability;
  }

  if (!shouldAttemptAvailabilityOffer({ context, interpretation })) {
    return null;
  }

  const date = resolveConcreteScheduleDate({ context, interpretation });
  const constraints = resolveConstraints({ context, interpretation });
  const { agentId, agentResolutionSource } = resolveAvailabilityAgent({
    context,
    options
  });

  const rejectTimes = (context.appointment?.previouslyOfferedSlots || [])
    .map((slot) => slot.time || slot.timeKey)
    .filter(Boolean);

  // If prior offer was rejected and alternatives differ, still allow re-select from full set
  // unless options.avoidPreviouslyOffered is true.
  const avoidPrevious = options.avoidPreviouslyOffered === true;

  const fixtureSlots =
    options.availabilityFixture?.slots ||
    context._availabilityFixture?.slots ||
    null;

  const readResult = await readCandidateSlots({
    organizationId: context.organizationId || options.organizationId || null,
    agentId,
    agentResolutionSource,
    date,
    timezone:
      options.timezone ||
      context.timezone ||
      options.availabilityFixture?.timezone ||
      DEFAULT_TIMEZONE,
    constraints,
    fixtureSlots,
    getSlots: options.getSlots || null,
    rejectTimes: avoidPrevious ? rejectTimes : [],
    spacingMinutes: options.spacingMinutes || DEFAULT_SPACING_MINUTES,
    maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES
  });

  return toDecisionAvailability(readResult);
}

/**
 * Fully synchronous read when fixtureSlots or sync getSlots mock is provided.
 */
function readCandidateSlotsSync(params = {}) {
  const {
    organizationId = null,
    agentId = null,
    agentResolutionSource = AGENT_RESOLUTION.UNRESOLVED,
    date = null,
    timezone = DEFAULT_TIMEZONE,
    constraints = {},
    fixtureSlots = null,
    getSlotsSync = null,
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    spacingMinutes = DEFAULT_SPACING_MINUTES,
    rejectTimes = [],
    maxResults = 24,
    purpose = "recruiting_interview"
  } = params;

  if (!date) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date,
      timezone,
      constraints,
      agentResolutionSource,
      failureReason: "missing_concrete_date"
    });
  }
  if (!agentId) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date,
      timezone,
      constraints,
      agentResolutionSource,
      failureReason: "missing_agent"
    });
  }

  let rawSlots = [];
  let resolvedTimezone = timezone || DEFAULT_TIMEZONE;

  try {
    if (Array.isArray(fixtureSlots)) {
      rawSlots = fixtureSlots
        .map((slot) => normalizeSlot(slot, resolvedTimezone))
        .filter(Boolean);
    } else if (typeof getSlotsSync === "function") {
      const result = getSlotsSync({
        agentId,
        organizationId,
        date,
        purpose,
        timePreference: "any",
        maxResults
      });
      resolvedTimezone = result?.timezone || resolvedTimezone;
      rawSlots = (result?.slots || [])
        .map((slot) => normalizeSlot(slot, resolvedTimezone))
        .filter(Boolean);
    } else {
      return buildUnavailableResult({
        organizationId,
        agentId,
        date,
        timezone: resolvedTimezone,
        constraints,
        agentResolutionSource,
        failureReason: "sync_requires_fixture"
      });
    }
  } catch (_error) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date,
      timezone: resolvedTimezone,
      constraints,
      agentResolutionSource,
      failureReason: "provider_failure"
    });
  }

  const filtered = filterSlotsByConstraints(rawSlots, constraints);
  const offered = selectCandidateSlots(filtered, {
    maxCandidates,
    spacingMinutes,
    rejectTimes
  });

  return {
    status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
    organizationId,
    agentId,
    date,
    timezone: resolvedTimezone,
    constraints: {
      earliestTime: constraints.earliestTime || null,
      latestTime: constraints.latestTime || null
    },
    slots: filtered,
    offeredSlots: offered,
    source: "sprint22",
    agentResolutionSource,
    failureReason: null
  };
}

/** Sync variant for playground/simulator — fixture or injected getSlotsSync only. */
function resolveAvailabilityForTurnSync(args = {}) {
  const {
    context,
    interpretation,
    availability = null,
    options = {}
  } = args;

  if (availability) {
    return availability;
  }

  if (!shouldAttemptAvailabilityOffer({ context, interpretation })) {
    return null;
  }

  const date = resolveConcreteScheduleDate({ context, interpretation });
  const constraints = resolveConstraints({ context, interpretation });
  const { agentId, agentResolutionSource } = resolveAvailabilityAgent({
    context,
    options
  });

  const fixtureSlots =
    options.availabilityFixture?.slots ||
    context._availabilityFixture?.slots ||
    null;

  const readResult = readCandidateSlotsSync({
    organizationId: context.organizationId || options.organizationId || null,
    agentId,
    agentResolutionSource,
    date,
    timezone:
      options.timezone ||
      context.timezone ||
      options.availabilityFixture?.timezone ||
      DEFAULT_TIMEZONE,
    constraints,
    fixtureSlots,
    getSlotsSync: options.getSlotsSync || null,
    rejectTimes:
      options.avoidPreviouslyOffered === true
        ? (context.appointment?.previouslyOfferedSlots || [])
            .map((slot) => slot.time || slot.timeKey)
            .filter(Boolean)
        : [],
    spacingMinutes: options.spacingMinutes || DEFAULT_SPACING_MINUTES,
    maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES
  });

  return toDecisionAvailability(readResult);
}

module.exports = {
  AGENT_RESOLUTION,
  READ_STATUS,
  DEFAULT_SPACING_MINUTES,
  resolveAvailabilityAgent,
  resolveConcreteScheduleDate,
  resolveConstraints,
  filterSlotsByConstraints,
  sortSlotsChronologically,
  selectCandidateSlots,
  normalizeSlot,
  buildUnavailableResult,
  toDecisionAvailability,
  readCandidateSlots,
  readCandidateSlotsSync,
  shouldAttemptAvailabilityOffer,
  resolveAvailabilityForTurn,
  resolveAvailabilityForTurnSync,
  timeKeyToMinutes
};
