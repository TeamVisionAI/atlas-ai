/**
 * Recruit AI v2 — SchedulingAvailabilityReader (BR-107 / BR-108).
 *
 * Thin read-only adapter over Sprint 22 appointmentApplicationService.getSlots.
 * BR-108 adds bounded rolling multi-date search when a time constraint is known
 * without a concrete prospect date.
 * Never books, reserves, creates, updates, deletes, or mutates BR-080 / Calendar / WhatsApp.
 */

const {
  ATLAS_DEFAULT_TIMEZONE,
  partsInZone,
  zonedTimeToUtcMs
} = require("../organizationDateWindow");
const { mergeSchedulingConstraints } = require("../sharedScheduling/schedulingNegotiationState");
const {
  enrichReadResultWithNearestAlternatives
} = require("../sharedScheduling/sharedSchedulingOffer");
const { resolveSchedulingConfig } = require("../sharedScheduling/sharedSchedulingConfig");
const {
  buildSchedulingDiagnostics,
  logSchedulingDiagnostics
} = require("../sharedScheduling/schedulingObservability");
const { buildNegotiationState } = require("../sharedScheduling/schedulingNegotiationState");
const {
  resolveMinimumBookingLeadMinutes,
  isSlotBookableByLeadTime
} = require("../schedulingLeadTime");

const DEFAULT_MAX_CANDIDATES = 2;
const DEFAULT_TIMEZONE = ATLAS_DEFAULT_TIMEZONE || "America/New_York";
/** Preferred initial search horizon from NOW (org-local). */
const INITIAL_HORIZON_HOURS = 48;
/**
 * Maximum calendar days from org-local today (inclusive) for expansion.
 * Bounded so reads stay finite (initial 48h, then day-by-day to this cap).
 */
const MAX_EXPANSION_DAYS = 14;

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
 * Read-only agent resolution (sync fields only). Never assigns or mutates BR-080.
 * Precedence: explicit context agent → BR-080 owner fields → org default recruiter (if already on context).
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

/**
 * Async read-only agent resolution. May load org default recruiter from settings.
 * Never claims/assigns/acknowledges (no BR-080 mutation). Never picks arbitrary RVP.
 */
async function resolveAvailabilityAgentAsync({
  context = {},
  options = {},
  loadOrganizationSettings = null
} = {}) {
  const sync = resolveAvailabilityAgent({ context, options });
  if (sync.agentId) {
    return sync;
  }

  if (options.skipOrgDefaultLookup === true) {
    return sync;
  }

  const organizationId =
    context.organizationId || options.organizationId || null;
  if (!organizationId) {
    return sync;
  }

  try {
    const {
      readConfiguredDefaultRecruiterId,
      loadOrganizationSettingsRow
    } = require("../autonomousScheduleAgentResolver");

    const settings =
      typeof loadOrganizationSettings === "function"
        ? await loadOrganizationSettings(organizationId)
        : await loadOrganizationSettingsRow(organizationId);

    const defaultId = readConfiguredDefaultRecruiterId(settings);
    if (defaultId) {
      return {
        agentId: String(defaultId),
        agentResolutionSource: AGENT_RESOLUTION.ORG_DEFAULT
      };
    }
  } catch {
    // Read failure → unresolved (BR-105 fallback). Never invent an agent.
  }

  return sync;
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
  const constraint = mergeSchedulingConstraints(
    fromContext,
    fromIntent,
    context,
    interpretation
  );
  const {
    resolveEarliestTimeInclusive
  } = require("./schedulingConstraints");

  let earliestTime = constraint?.earliestTime || null;
  let latestTime = constraint?.latestTime || null;
  let earliestTimeInclusive = constraint
    ? resolveEarliestTimeInclusive(constraint)
    : true;

  const dayPart =
    interpretation?.entities?.dayPart ||
    constraint?.dayPart ||
    context.knownFacts?.preferredDayPart ||
    null;

  // Implements BR-119 — "más tarde" means after the current offered set on that day.
  if (interpretation?.entities?.requestsLaterAlternatives) {
    const date = resolveConcreteScheduleDate({ context, interpretation });
    const offered = Array.isArray(context.appointment?.previouslyOfferedSlots)
      ? context.appointment.previouslyOfferedSlots
      : [];
    const sameDay = date
      ? offered.filter(
          (slot) =>
            String(slot.date || slot.dateKey || "") === String(date)
        )
      : [];
    const pool = sameDay.length ? sameDay : offered;
    let maxMinutes = null;
    let maxTime = null;
    for (const slot of pool) {
      const t = slot.time || slot.timeKey || null;
      const minutes = timeKeyToMinutes(t);
      if (minutes == null) {
        continue;
      }
      if (maxMinutes == null || minutes > maxMinutes) {
        maxMinutes = minutes;
        maxTime = t;
      }
    }
    if (maxTime) {
      earliestTime = maxTime;
      earliestTimeInclusive = false;
    }
  }

  return {
    earliestTime,
    latestTime,
    dayPart,
    // BR-107 consumes normalized inclusivity — never reparse raw here.
    earliestTimeInclusive,
    raw: constraint?.raw || interpretation?.entities?.rawText || null
  };
}

/**
 * Explicit earliest/latest outrank day-part. Do not use engine afternoon (ends 18:00)
 * when earliestTime is set — pass timePreference "any" and filter here.
 * Exclusive earliestTime → minutes > bound; inclusive → minutes >= bound.
 * BR-119 / BR-164 — dayPart alone filters: morning <12; afternoon strictly after 12:00
 * (noon is not afternoon); evening ≥17.
 */
function filterSlotsByConstraints(slots, constraints = {}) {
  const earliest = timeKeyToMinutes(constraints.earliestTime);
  const latest = timeKeyToMinutes(constraints.latestTime);
  const dayPart = String(constraints.dayPart || "").toLowerCase();
  const {
    resolveEarliestTimeInclusive
  } = require("./schedulingConstraints");
  const earliestInclusive =
    typeof constraints.earliestTimeInclusive === "boolean"
      ? constraints.earliestTimeInclusive
      : resolveEarliestTimeInclusive(constraints);
  return (slots || []).filter((slot) => {
    const minutes = timeKeyToMinutes(slot.timeKey || slot.time);
    if (minutes == null) {
      return false;
    }
    if (earliest != null) {
      if (earliestInclusive) {
        if (minutes < earliest) {
          return false;
        }
      } else if (minutes <= earliest) {
        return false;
      }
    }
    if (latest != null && minutes > latest) {
      return false;
    }
    // Day-part window only when no explicit earliest/latest bound.
    if (earliest == null && latest == null && dayPart) {
      if (dayPart === "morning" && minutes >= 12 * 60) {
        return false;
      }
      if (dayPart === "afternoon" && minutes <= 12 * 60) {
        return false;
      }
      if (dayPart === "evening" && minutes < 17 * 60) {
        return false;
      }
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

function pad2(n) {
  return String(n).padStart(2, "0");
}

function dateKeyFromParts(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function dateKeyInZone(ms, timeZone = DEFAULT_TIMEZONE) {
  const parts = partsInZone(ms, timeZone);
  return dateKeyFromParts(parts.year, parts.month, parts.day);
}

function addDaysToDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + Number(deltaDays || 0), 12, 0, 0));
  return dateKeyFromParts(utc.getUTCFullYear(), utc.getUTCMonth() + 1, utc.getUTCDate());
}

function daysBetweenDateKeys(startKey, endKey) {
  const [ys, ms, ds] = String(startKey).split("-").map(Number);
  const [ye, me, de] = String(endKey).split("-").map(Number);
  const a = Date.UTC(ys, ms - 1, ds, 12);
  const b = Date.UTC(ye, me - 1, de, 12);
  return Math.round((b - a) / 86400000);
}

function slotStartMs(slot, timeZone = DEFAULT_TIMEZONE) {
  if (slot?.startTimeISO) {
    const ms = new Date(slot.startTimeISO).getTime();
    if (Number.isFinite(ms)) {
      return ms;
    }
  }
  const dateKey = slot?.dateKey || slot?.date;
  const timeKey = slot?.timeKey || slot?.time;
  if (!dateKey || !timeKey || !String(timeKey).includes(":")) {
    return null;
  }
  const [y, m, d] = String(dateKey).split("-").map(Number);
  const [hh, mm] = String(timeKey).split(":").map(Number);
  return zonedTimeToUtcMs(y, m, d, hh, mm || 0, 0, 0, timeZone);
}

/** Drop past slots, and slots inside an explicit BR-185 lead window. */
function filterFutureSlots(
  slots,
  nowMs,
  timeZone = DEFAULT_TIMEZONE,
  leadMinutes = 0
) {
  const now = Number(nowMs) || Date.now();
  // null/undefined keep the historical past-only filter. The engine is SoT for
  // tenant lead time; callers must pass a lead to apply one here.
  const lead =
    leadMinutes == null ? 0 : resolveMinimumBookingLeadMinutes(leadMinutes);
  return (slots || []).filter((slot) => {
    const start = slotStartMs(slot, timeZone);
    return start != null && isSlotBookableByLeadTime(start, now, lead);
  });
}

function slotIdentity(slot) {
  return `${slot?.dateKey || slot?.date || ""}|${slot?.timeKey || slot?.time || ""}`;
}

/**
 * BR-108 / BR-164 — exhaust same-day remaining slots before introducing another date:
 * If the first date has 2+ valid slots, offer same-day earliest+latest.
 * Only take a later date when the first date has a single remaining slot.
 */
function selectCrossDateCandidateSlots(
  slots,
  {
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    rejectIds = []
  } = {}
) {
  const rejected = new Set((rejectIds || []).map((id) => String(id)));
  const ordered = sortSlotsChronologically(slots).filter(
    (slot) => !rejected.has(slotIdentity(slot))
  );
  if (!ordered.length) {
    return [];
  }

  const first = ordered[0];
  if (maxCandidates < 2 || ordered.length === 1) {
    return [first];
  }

  const firstDate = String(first.dateKey || first.date || "");
  const sameDay = ordered.filter(
    (slot) => String(slot.dateKey || slot.date || "") === firstDate
  );
  // Implements BR-164 — do not jump to tomorrow while same-day options remain.
  if (sameDay.length >= 2) {
    return selectCandidateSlots(sameDay, { maxCandidates, rejectTimes: [] });
  }
  const otherDate = ordered.find(
    (slot) => String(slot.dateKey || slot.date || "") !== firstDate
  );
  if (otherDate) {
    return [first, otherDate];
  }

  return selectCandidateSlots(ordered, { maxCandidates, rejectTimes: [] });
}

/**
 * Diversity-of-choice heuristic (BR-107 correction):
 * - Slot A = earliest valid real slot
 * - Slot B = latest valid real slot when a distinct later slot exists
 * This avoids adjacent near-duplicates when farther REAL options exist, without a
 * hardcoded 60/90-minute (or Nx duration) minimum. If only adjacent slots exist,
 * offer them. Never fabricate; never suppress the only valid second slot.
 */
function selectCandidateSlots(
  slots,
  {
    maxCandidates = DEFAULT_MAX_CANDIDATES,
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
  if (maxCandidates < 2 || ordered.length === 1) {
    return [first];
  }

  const last = ordered[ordered.length - 1];
  const firstKey = `${first.dateKey || first.date}|${first.timeKey || first.time}`;
  const lastKey = `${last.dateKey || last.date}|${last.timeKey || last.time}`;
  if (firstKey === lastKey) {
    return [first];
  }
  return [first, last];
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
      latestTime: constraints.latestTime || null,
      earliestTimeInclusive:
        typeof constraints.earliestTimeInclusive === "boolean"
          ? constraints.earliestTimeInclusive
          : true
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
    rolling: Boolean(readResult.rolling),
    searchMeta: readResult.searchMeta || null,
    alternativeToConstraint: Boolean(readResult.alternativeToConstraint),
    todayUnavailableAfterLead: Boolean(readResult.todayUnavailableAfterLead),
    readResult
  };
}

function slotsOnRequestedDate(slots, date) {
  const dateKey = date ? String(date) : null;
  if (!dateKey) {
    return slots || [];
  }
  return (slots || []).filter(
    (slot) => String(slot.dateKey || slot.date || "") === dateKey
  );
}

function finalizeReadResultWithAlternatives(
  readResult,
  { constraints = {}, requestedDate = null, maxCandidates = DEFAULT_MAX_CANDIDATES } = {}
) {
  if (!readResult || readResult.status === READ_STATUS.UNAVAILABLE) {
    return readResult;
  }
  if (Array.isArray(readResult.offeredSlots) && readResult.offeredSlots.length > 0) {
    return readResult;
  }
  // Implements BR-108 / BR-164 — rolling horizon already exhausted; do not
  // reintroduce constraint-violating slots as if they qualified.
  if (readResult.rolling === true) {
    return readResult;
  }
  return enrichReadResultWithNearestAlternatives(readResult, {
    constraints,
    requestedDate: requestedDate || readResult.date || null,
    maxCandidates
  });
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
  rejectTimes = [],
  fixtureSlots = null,
  getSlots = null,
  maxResults = 24,
  now = null,
  minimumBookingLeadMinutes = null
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
      rawSlots = slotsOnRequestedDate(
        fixtureSlots
          .map((slot) => normalizeSlot(slot, resolvedTimezone))
          .filter(Boolean),
        date
      );
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
      rawSlots = slotsOnRequestedDate(
        (result?.slots || [])
          .map((slot) => normalizeSlot(slot, resolvedTimezone))
          .filter(Boolean),
        date
      );
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

  const nowMs = now ? new Date(now).getTime() : null;
  // Engine slots already honor the tenant profile lead. Re-filter with 0 unless
  // a caller/fixture explicitly passed a lead so a lower tenant value is not
  // overridden by the helper default (BR-185).
  const readerLeadMinutes = Array.isArray(fixtureSlots)
    ? minimumBookingLeadMinutes
    : minimumBookingLeadMinutes ?? 0;
  const unconstrainedFutureSlots =
    Number.isFinite(nowMs)
      ? filterFutureSlots(rawSlots, nowMs, resolvedTimezone, readerLeadMinutes)
      : rawSlots;
  const filtered = filterSlotsByConstraints(unconstrainedFutureSlots, constraints);
  const offered = selectCandidateSlots(filtered, {
    maxCandidates,
    rejectTimes
  });

  return finalizeReadResultWithAlternatives(
    {
      status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
      organizationId,
      agentId,
      date,
      timezone: resolvedTimezone,
      constraints: {
        earliestTime: constraints.earliestTime || null,
        latestTime: constraints.latestTime || null,
        earliestTimeInclusive:
          typeof constraints.earliestTimeInclusive === "boolean"
            ? constraints.earliestTimeInclusive
            : true
      },
      slots: filtered,
      unconstrainedFutureSlots,
      offeredSlots: offered,
      source: "sprint22",
      agentResolutionSource,
      failureReason: null
    },
    { constraints, requestedDate: date, maxCandidates }
  );
}

/**
 * Decide whether this turn should attempt a read-only availability offer.
 * BR-108 — concrete date optional when an explicit time constraint exists
 * (rolling multi-date search). Never invents slots.
 */
function shouldAttemptAvailabilityOffer({ context, interpretation } = {}) {
  const constraints = resolveConstraints({ context, interpretation });
  const intent = interpretation?.intent || null;
  const { INTENTS } = require("./constants");
  const pendingQ = String(context?.conversation?.lastQuestionAsked || "");

  // Implements BR-116 — preferred-time answers (before an offered menu exists, or
  // while stuck awaiting_availability) must read slots same turn.
  // Do not force a live read for every outside-menu counteroffer after slots
  // were already offered — BR-115 / existing counteroffer paths own that case.
  const priorOffered = context?.appointment?.previouslyOfferedSlots || [];
  const noOfferedMenuYet = !Array.isArray(priorOffered) || priorOffered.length === 0;
  const counterofferNeedsSlots =
    intent === INTENTS.SCHEDULING_COUNTEROFFER &&
    (pendingQ === "ask_time_preference" ||
      pendingQ === "awaiting_availability" ||
      (noOfferedMenuYet &&
        Boolean(constraints.earliestTime || constraints.latestTime)));

  // Implements BR-119 — day-part answers may proactively offer real slots.
  const dayPartNeedsSlots =
    intent === INTENTS.PROVIDE_DAY_PART &&
    Boolean(constraints.dayPart || interpretation?.entities?.dayPart);

  // Implements BR-209 — IUL Zoom daypart uses the same live rolling reader.
  const iulDayPartNeedsSlots =
    intent === INTENTS.IUL_CHOOSE_REVIEW_DAY_PART &&
    Boolean(
      constraints.dayPart ||
        interpretation?.entities?.dayPart ||
        interpretation?.entities?.iulReviewDayPart
    );

  // Implements BR-119 Case D — leave the offered set for later alternatives.
  const laterAlternatives =
    intent === INTENTS.SCHEDULING_DATE_PROPOSAL &&
    Boolean(interpretation?.entities?.requestsLaterAlternatives);

  // Implements BR-164 — named day + persisted daypart searches that date only.
  const datedDayPartSearch =
    intent === INTENTS.SCHEDULING_DATE_PROPOSAL &&
    Boolean(resolveConcreteScheduleDate({ context, interpretation })) &&
    Boolean(constraints.dayPart || context.knownFacts?.preferredDayPart);

  // Implements BR-171 — date-only reschedule ("el lunes") loads interviewer availability.
  const rescheduleDatedSearch =
    intent === INTENTS.RESCHEDULE_REQUEST &&
    Boolean(resolveConcreteScheduleDate({ context, interpretation }));

  if (
    !constraints.earliestTime &&
    !constraints.latestTime &&
    !counterofferNeedsSlots &&
    !dayPartNeedsSlots &&
    !iulDayPartNeedsSlots &&
    !laterAlternatives &&
    !datedDayPartSearch &&
    !rescheduleDatedSearch
  ) {
    return false;
  }

  const allowedIntent =
    intent === INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT ||
    intent === INTENTS.SCHEDULING_DATE_PROPOSAL ||
    intent === INTENTS.REASSERT_KNOWN_FACT ||
    intent === INTENTS.PROVIDE_DAY_PART ||
    intent === INTENTS.IUL_CHOOSE_REVIEW_DAY_PART ||
    intent === INTENTS.RESCHEDULE_REQUEST ||
    counterofferNeedsSlots ||
    datedDayPartSearch ||
    rescheduleDatedSearch;
  if (!allowedIntent) {
    return false;
  }

  const date = resolveConcreteScheduleDate({ context, interpretation });
  // Concrete date → single-day BR-107 path. No date → BR-108 rolling path.
  return (
    Boolean(date) ||
    intent === INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT ||
    dayPartNeedsSlots ||
    iulDayPartNeedsSlots ||
    counterofferNeedsSlots
  );
}

/**
 * BR-116 — mark whether the prospect's requested time is in the read result,
 * and bias offered alternatives toward matching wall-clock slots when present.
 */
function enrichAvailabilityForRequestedTime(
  availability,
  requestedTime,
  requestedDate = null
) {
  if (!availability || !requestedTime || availability.checked !== true) {
    return availability;
  }

  const time = String(requestedTime);
  const dateKey = requestedDate ? String(requestedDate) : null;
  const rawSlots = availability.readResult?.slots || [];
  const matching = rawSlots
    .map((slot) => ({
      date: slot.date || slot.dateKey || null,
      time: slot.time || slot.timeKey || null,
      timezone: slot.timezone || availability.readResult?.timezone || null
    }))
    .filter((slot) => {
      if (!slot.time || String(slot.time) !== time) {
        return false;
      }
      if (dateKey && slot.date && String(slot.date) !== dateKey) {
        return false;
      }
      return true;
    });

  const requestedSlotAvailable = matching.length > 0;
  let nearestAlternatives = Array.isArray(availability.nearestAlternatives)
    ? [...availability.nearestAlternatives]
    : [];

  if (requestedSlotAvailable) {
    // Implements BR-164 — exact match must not reintroduce unrelated slots.
    const preferred = [];
    const seen = new Set();
    for (const slot of matching) {
      const key = `${slot.date || ""}|${slot.time}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      preferred.push(slot);
      if (preferred.length >= 2) {
        break;
      }
    }
    nearestAlternatives = preferred;
  } else if (dateKey) {
    nearestAlternatives = nearestAlternatives.filter(
      (slot) => !slot.date || String(slot.date) === dateKey
    );
  }

  return {
    ...availability,
    requestedSlotAvailable,
    nearestAlternatives,
    status:
      nearestAlternatives.length > 0
        ? READ_STATUS.AVAILABLE
        : availability.status
  };
}


/**
 * BR-108 — bounded rolling search from org-local NOW.
 * 1) Read initial 48h window (date..dateEnd)
 * 2) If fewer than maxCandidates, expand day-by-day until found or MAX_EXPANSION_DAYS
 * Past slots excluded. Constraints applied per slot. Never fabricates.
 */
async function readRollingCandidateSlots({
  organizationId = null,
  agentId = null,
  agentResolutionSource = AGENT_RESOLUTION.UNRESOLVED,
  timezone = DEFAULT_TIMEZONE,
  constraints = {},
  purpose = "recruiting_interview",
  maxCandidates = DEFAULT_MAX_CANDIDATES,
  rejectIds = [],
  fixtureSlots = null,
  getSlots = null,
  getSlotsSync = null,
  now = null,
  sync = false
} = {}) {
  if (!agentId) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date: null,
      timezone,
      constraints,
      agentResolutionSource,
      failureReason: "missing_agent"
    });
  }

  const nowMs = now ? new Date(now).getTime() : Date.now();
  const tz = timezone || DEFAULT_TIMEZONE;
  const startDateKey = dateKeyInZone(nowMs, tz);
  const horizonEndMs = nowMs + INITIAL_HORIZON_HOURS * 60 * 60 * 1000;
  const initialEndDateKey = dateKeyInZone(horizonEndMs, tz);
  const maxEndDateKey = addDaysToDateKey(startDateKey, MAX_EXPANSION_DAYS - 1);

  const collectFromRaw = (rawSlots) => {
    const normalized = (rawSlots || [])
      .map((slot) => normalizeSlot(slot, tz))
      .filter(Boolean);
    const future = filterFutureSlots(
      normalized,
      nowMs,
      tz,
      constraints.minimumBookingLeadMinutes ??
        (Array.isArray(fixtureSlots) ? null : 0)
    );
    const qualifying = filterSlotsByConstraints(future, constraints);
    return { future, qualifying };
  };

  let qualifying = [];
  let unconstrainedFutureSlots = [];
  let resolvedTimezone = tz;
  let providerFailed = false;

  try {
    if (Array.isArray(fixtureSlots)) {
      const collected = collectFromRaw(fixtureSlots);
      qualifying = collected.qualifying;
      unconstrainedFutureSlots = collected.future;
    } else {
      const getSlotsFn =
        sync && typeof getSlotsSync === "function"
          ? getSlotsSync
          : getSlots ||
            ((params) =>
              require("../../application/appointmentApplicationService").getSlots(
                params
              ));

      const initialResult = await Promise.resolve(
        getSlotsFn({
          agentId,
          organizationId,
          date: startDateKey,
          dateEnd: initialEndDateKey,
          purpose,
          timePreference: "any",
          maxResults: 0
        })
      );
      resolvedTimezone = initialResult?.timezone || resolvedTimezone;
      const initialCollected = collectFromRaw(initialResult?.slots || []);
      qualifying = initialCollected.qualifying;
      unconstrainedFutureSlots = initialCollected.future;

      let offeredProbe = selectCrossDateCandidateSlots(qualifying, {
        maxCandidates,
        rejectIds
      });
      let cursor = addDaysToDateKey(initialEndDateKey, 1);
      while (
        offeredProbe.length < maxCandidates &&
        daysBetweenDateKeys(startDateKey, cursor) < MAX_EXPANSION_DAYS &&
        cursor <= maxEndDateKey
      ) {
        const dayResult = await Promise.resolve(
          getSlotsFn({
            agentId,
            organizationId,
            date: cursor,
            purpose,
            timePreference: "any",
            maxResults: 24
          })
        );
        resolvedTimezone = dayResult?.timezone || resolvedTimezone;
        const dayCollected = collectFromRaw(dayResult?.slots || []);
        const seenFuture = new Set(unconstrainedFutureSlots.map(slotIdentity));
        for (const slot of dayCollected.future) {
          const id = slotIdentity(slot);
          if (!seenFuture.has(id)) {
            unconstrainedFutureSlots.push(slot);
            seenFuture.add(id);
          }
        }
        const seen = new Set(qualifying.map(slotIdentity));
        for (const slot of dayCollected.qualifying) {
          const id = slotIdentity(slot);
          if (!seen.has(id)) {
            qualifying.push(slot);
            seen.add(id);
          }
        }
        offeredProbe = selectCrossDateCandidateSlots(qualifying, {
          maxCandidates,
          rejectIds
        });
        cursor = addDaysToDateKey(cursor, 1);
      }
    }
  } catch (_error) {
    providerFailed = true;
  }

  if (providerFailed) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date: null,
      timezone: resolvedTimezone,
      constraints,
      agentResolutionSource,
      failureReason: "provider_failure"
    });
  }

  // Fixture path also expands conceptually within fixture dates only (no live calls).
  if (Array.isArray(fixtureSlots)) {
    qualifying = qualifying.filter((slot) => {
      const dk = slot.dateKey || slot.date;
      return dk && dk >= startDateKey && dk <= maxEndDateKey;
    });
    unconstrainedFutureSlots = unconstrainedFutureSlots.filter((slot) => {
      const dk = slot.dateKey || slot.date;
      return dk && dk >= startDateKey && dk <= maxEndDateKey;
    });
  }

  const offered = selectCrossDateCandidateSlots(qualifying, {
    maxCandidates,
    rejectIds
  });

  return finalizeReadResultWithAlternatives(
    {
      status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
      organizationId,
      agentId,
      date: null,
      dateStart: startDateKey,
      dateEnd: offered.length
        ? offered[offered.length - 1].dateKey || offered[offered.length - 1].date
        : maxEndDateKey,
      rolling: true,
      timezone: resolvedTimezone,
      constraints: {
        earliestTime: constraints.earliestTime || null,
        latestTime: constraints.latestTime || null,
        earliestTimeInclusive:
          typeof constraints.earliestTimeInclusive === "boolean"
            ? constraints.earliestTimeInclusive
            : true
      },
      slots: sortSlotsChronologically(qualifying),
      unconstrainedFutureSlots: sortSlotsChronologically(unconstrainedFutureSlots),
      offeredSlots: offered,
      source: "sprint22",
      agentResolutionSource,
      failureReason: null,
      searchMeta: {
        initialHorizonHours: INITIAL_HORIZON_HOURS,
        maxExpansionDays: MAX_EXPANSION_DAYS,
        startDateKey,
        initialEndDateKey,
        maxEndDateKey
      }
    },
    { constraints, requestedDate: null, maxCandidates }
  );
}

function readRollingCandidateSlotsSync(params = {}) {
  const {
    organizationId = null,
    agentId = null,
    agentResolutionSource = AGENT_RESOLUTION.UNRESOLVED,
    timezone = DEFAULT_TIMEZONE,
    constraints = {},
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    rejectIds = [],
    fixtureSlots = null,
    getSlotsSync = null,
    now = null,
    purpose = "recruiting_interview"
  } = params;

  if (!agentId) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date: null,
      timezone,
      constraints,
      agentResolutionSource,
      failureReason: "missing_agent"
    });
  }

  if (!Array.isArray(fixtureSlots) && typeof getSlotsSync !== "function") {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date: null,
      timezone,
      constraints,
      agentResolutionSource,
      failureReason: "sync_requires_fixture"
    });
  }

  const nowMs = now ? new Date(now).getTime() : Date.now();
  const tz = timezone || DEFAULT_TIMEZONE;
  const startDateKey = dateKeyInZone(nowMs, tz);
  const horizonEndMs = nowMs + INITIAL_HORIZON_HOURS * 60 * 60 * 1000;
  const initialEndDateKey = dateKeyInZone(horizonEndMs, tz);
  const maxEndDateKey = addDaysToDateKey(startDateKey, MAX_EXPANSION_DAYS - 1);

  const collectPair = (rawSlots) => {
    const normalized = (rawSlots || [])
      .map((s) => normalizeSlot(s, tz))
      .filter(Boolean);
    const future = filterFutureSlots(normalized, nowMs, tz);
    const qualifying = filterSlotsByConstraints(future, constraints);
    return { future, qualifying };
  };

  if (Array.isArray(fixtureSlots)) {
    const collected = collectPair(fixtureSlots);
    const qualifying = collected.qualifying.filter((slot) => {
      const dk = slot.dateKey || slot.date;
      return dk && dk >= startDateKey && dk <= maxEndDateKey;
    });
    const unconstrainedFutureSlots = collected.future.filter((slot) => {
      const dk = slot.dateKey || slot.date;
      return dk && dk >= startDateKey && dk <= maxEndDateKey;
    });
    const offered = selectCrossDateCandidateSlots(qualifying, {
      maxCandidates,
      rejectIds
    });
    return finalizeReadResultWithAlternatives(
      {
        status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
        organizationId,
        agentId,
        date: null,
        rolling: true,
        timezone: tz,
        constraints: {
          earliestTime: constraints.earliestTime || null,
          latestTime: constraints.latestTime || null,
          earliestTimeInclusive:
            typeof constraints.earliestTimeInclusive === "boolean"
              ? constraints.earliestTimeInclusive
              : true
        },
        slots: sortSlotsChronologically(qualifying),
        unconstrainedFutureSlots: sortSlotsChronologically(unconstrainedFutureSlots),
        offeredSlots: offered,
        source: "sprint22",
        agentResolutionSource,
        failureReason: null,
        searchMeta: {
          initialHorizonHours: INITIAL_HORIZON_HOURS,
          maxExpansionDays: MAX_EXPANSION_DAYS,
          startDateKey,
          initialEndDateKey,
          maxEndDateKey
        }
      },
      { constraints, requestedDate: null, maxCandidates }
    );
  }

  try {
    let unconstrainedFutureSlots = [];
    const initialCollected = collectPair(
      getSlotsSync({
        agentId,
        organizationId,
        date: startDateKey,
        dateEnd: initialEndDateKey,
        purpose,
        timePreference: "any",
        maxResults: 0
      })?.slots || []
    );
    let qualifying = initialCollected.qualifying;
    unconstrainedFutureSlots = initialCollected.future;
    let offered = selectCrossDateCandidateSlots(qualifying, {
      maxCandidates,
      rejectIds
    });
    let cursor = addDaysToDateKey(initialEndDateKey, 1);
    while (
      offered.length < maxCandidates &&
      daysBetweenDateKeys(startDateKey, cursor) < MAX_EXPANSION_DAYS
    ) {
      const dayCollected = collectPair(
        getSlotsSync({
          agentId,
          organizationId,
          date: cursor,
          purpose,
          timePreference: "any",
          maxResults: 24
        })?.slots || []
      );
      const seenFuture = new Set(unconstrainedFutureSlots.map(slotIdentity));
      for (const slot of dayCollected.future) {
        const id = slotIdentity(slot);
        if (!seenFuture.has(id)) {
          unconstrainedFutureSlots.push(slot);
          seenFuture.add(id);
        }
      }
      const seen = new Set(qualifying.map(slotIdentity));
      for (const slot of dayCollected.qualifying) {
        if (!seen.has(slotIdentity(slot))) {
          qualifying.push(slot);
          seen.add(slotIdentity(slot));
        }
      }
      offered = selectCrossDateCandidateSlots(qualifying, {
        maxCandidates,
        rejectIds
      });
      cursor = addDaysToDateKey(cursor, 1);
    }
    return finalizeReadResultWithAlternatives(
      {
        status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
        organizationId,
        agentId,
        date: null,
        rolling: true,
        timezone: tz,
        constraints: {
          earliestTime: constraints.earliestTime || null,
          latestTime: constraints.latestTime || null,
          earliestTimeInclusive:
            typeof constraints.earliestTimeInclusive === "boolean"
              ? constraints.earliestTimeInclusive
              : true
        },
        slots: sortSlotsChronologically(qualifying),
        unconstrainedFutureSlots: sortSlotsChronologically(unconstrainedFutureSlots),
        offeredSlots: offered,
        source: "sprint22",
        agentResolutionSource,
        failureReason: null,
        searchMeta: {
          initialHorizonHours: INITIAL_HORIZON_HOURS,
          maxExpansionDays: MAX_EXPANSION_DAYS,
          startDateKey,
          initialEndDateKey,
          maxEndDateKey
        }
      },
      { constraints, requestedDate: null, maxCandidates }
    );
  } catch (_error) {
    return buildUnavailableResult({
      organizationId,
      agentId,
      date: null,
      timezone: tz,
      constraints,
      agentResolutionSource,
      failureReason: "provider_failure"
    });
  }
}

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
  const { agentId, agentResolutionSource } = await resolveAvailabilityAgentAsync({
    context,
    options,
    loadOrganizationSettings: options.loadOrganizationSettings || null
  });

  const priorOffered = context.appointment?.previouslyOfferedSlots || [];
  const avoidPrevious =
    options.avoidPreviouslyOffered === true ||
    interpretation?.entities?.requestsLaterAlternatives === true;
  const rejectIds = avoidPrevious
    ? priorOffered.map((slot) => slotIdentity(slot)).filter((id) => !id.startsWith("|"))
    : [];
  const rejectTimes = avoidPrevious
    ? priorOffered.map((slot) => slot.time || slot.timeKey).filter(Boolean)
    : [];

  const fixtureSlots =
    options.availabilityFixture?.slots ||
    context._availabilityFixture?.slots ||
    null;
  const timezone =
    options.timezone ||
    context.timezone ||
    options.availabilityFixture?.timezone ||
    DEFAULT_TIMEZONE;
  const organizationId = context.organizationId || options.organizationId || null;
  const now = options.now || context._testNow || null;
  const schedulingConfig = resolveSchedulingConfig(context, options);
  const negotiationState = buildNegotiationState({ context, interpretation });

  // BR-108 — no concrete date → bounded rolling multi-date search.
  if (!date) {
    const readResult = await readRollingCandidateSlots({
      organizationId,
      agentId,
      agentResolutionSource,
      timezone,
      constraints,
      purpose: schedulingConfig.purpose,
      fixtureSlots,
      getSlots: options.getSlots || null,
      rejectIds,
      maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES,
      now
    });
    const resolvedAvailability = enrichAvailabilityForRequestedTime(
      toDecisionAvailability(readResult),
      interpretation?.entities?.requestedTime || null,
      null
    );
    logSchedulingDiagnostics("shared_scheduling_availability_read", {
      ...buildSchedulingDiagnostics({
        workflowConfig: schedulingConfig,
        negotiationState,
        availability: resolvedAvailability
      }),
      organizationId,
      agentId
    });
    return resolvedAvailability;
  }

  // BR-107 — concrete date → single-day read.
  // BR-185 — if that date is org-local today and lead time cleared it, roll to the next valid day.
  const nowMs = now ? new Date(now).getTime() : Date.now();
  const todayKey = dateKeyInZone(nowMs, timezone);
  const readResult = await readCandidateSlots({
    organizationId,
    agentId,
    agentResolutionSource,
    date,
    timezone,
    constraints,
    purpose: schedulingConfig.purpose,
    fixtureSlots,
    getSlots: options.getSlots || null,
    rejectTimes,
    maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES,
    now,
    minimumBookingLeadMinutes: options.minimumBookingLeadMinutes
  });

  if (
    date === todayKey &&
    (readResult.offeredSlots || []).length === 0 &&
    (readResult.unconstrainedFutureSlots || []).length === 0 &&
    readResult.status !== READ_STATUS.UNAVAILABLE
  ) {
    const rolling = await readRollingCandidateSlots({
      organizationId,
      agentId,
      agentResolutionSource,
      timezone,
      constraints,
      purpose: schedulingConfig.purpose,
      fixtureSlots,
      getSlots: options.getSlots || null,
      rejectIds,
      maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES,
      now
    });
    if ((rolling.offeredSlots || []).length > 0) {
      const rolled = enrichAvailabilityForRequestedTime(
        toDecisionAvailability({
          ...rolling,
          todayUnavailableAfterLead: true
        }),
        interpretation?.entities?.requestedTime || null,
        null
      );
      logSchedulingDiagnostics("shared_scheduling_availability_read", {
        ...buildSchedulingDiagnostics({
          workflowConfig: schedulingConfig,
          negotiationState,
          availability: rolled
        }),
        organizationId,
        agentId,
        date,
        todayUnavailableAfterLead: true
      });
      return rolled;
    }
  }

  const resolvedAvailability = enrichAvailabilityForRequestedTime(
    toDecisionAvailability(readResult),
    interpretation?.entities?.requestedTime || null,
    date
  );
  logSchedulingDiagnostics("shared_scheduling_availability_read", {
    ...buildSchedulingDiagnostics({
      workflowConfig: schedulingConfig,
      negotiationState,
      availability: resolvedAvailability
    }),
    organizationId,
    agentId,
    date
  });
  return resolvedAvailability;
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
      rawSlots = slotsOnRequestedDate(
        fixtureSlots
          .map((slot) => normalizeSlot(slot, resolvedTimezone))
          .filter(Boolean),
        date
      );
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
      rawSlots = slotsOnRequestedDate(
        (result?.slots || [])
          .map((slot) => normalizeSlot(slot, resolvedTimezone))
          .filter(Boolean),
        date
      );
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

  const unconstrainedFutureSlots = rawSlots;
  const filtered = filterSlotsByConstraints(unconstrainedFutureSlots, constraints);
  const offered = selectCandidateSlots(filtered, {
    maxCandidates,
    rejectTimes
  });

  return finalizeReadResultWithAlternatives(
    {
      status: offered.length ? READ_STATUS.AVAILABLE : READ_STATUS.ZERO_SLOTS,
      organizationId,
      agentId,
      date,
      timezone: resolvedTimezone,
      constraints: {
        earliestTime: constraints.earliestTime || null,
        latestTime: constraints.latestTime || null,
        earliestTimeInclusive:
          typeof constraints.earliestTimeInclusive === "boolean"
            ? constraints.earliestTimeInclusive
            : true
      },
      slots: filtered,
      unconstrainedFutureSlots,
      offeredSlots: offered,
      source: "sprint22",
      agentResolutionSource,
      failureReason: null
    },
    { constraints, requestedDate: date, maxCandidates }
  );
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
  const timezone =
    options.timezone ||
    context.timezone ||
    options.availabilityFixture?.timezone ||
    DEFAULT_TIMEZONE;
  const organizationId = context.organizationId || options.organizationId || null;
  const now = options.now || context._testNow || null;
  const avoidPrevious =
    options.avoidPreviouslyOffered === true ||
    interpretation?.entities?.requestsLaterAlternatives === true;
  const priorOffered = context.appointment?.previouslyOfferedSlots || [];
  const rejectIds = avoidPrevious
    ? priorOffered.map((slot) => slotIdentity(slot)).filter((id) => !id.startsWith("|"))
    : [];
  const rejectTimes = avoidPrevious
    ? priorOffered.map((slot) => slot.time || slot.timeKey).filter(Boolean)
    : [];

  if (!date) {
    const readResult = readRollingCandidateSlotsSync({
      organizationId,
      agentId,
      agentResolutionSource,
      timezone,
      constraints,
      fixtureSlots,
      getSlotsSync: options.getSlotsSync || null,
      rejectIds,
      maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES,
      now
    });
    return enrichAvailabilityForRequestedTime(
      toDecisionAvailability(readResult),
      interpretation?.entities?.requestedTime || null,
      null
    );
  }

  const readResult = readCandidateSlotsSync({
    organizationId,
    agentId,
    agentResolutionSource,
    date,
    timezone,
    constraints,
    fixtureSlots,
    getSlotsSync: options.getSlotsSync || null,
    rejectTimes,
    maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES
  });

  return enrichAvailabilityForRequestedTime(
    toDecisionAvailability(readResult),
    interpretation?.entities?.requestedTime || null,
    date
  );
}

module.exports = {
  AGENT_RESOLUTION,
  READ_STATUS,
  INITIAL_HORIZON_HOURS,
  MAX_EXPANSION_DAYS,
  resolveAvailabilityAgent,
  resolveAvailabilityAgentAsync,
  resolveConcreteScheduleDate,
  resolveConstraints,
  filterSlotsByConstraints,
  filterFutureSlots,
  sortSlotsChronologically,
  selectCandidateSlots,
  selectCrossDateCandidateSlots,
  normalizeSlot,
  buildUnavailableResult,
  toDecisionAvailability,
  readCandidateSlots,
  readCandidateSlotsSync,
  readRollingCandidateSlots,
  readRollingCandidateSlotsSync,
  shouldAttemptAvailabilityOffer,
  enrichAvailabilityForRequestedTime,
  resolveAvailabilityForTurn,
  resolveAvailabilityForTurnSync,
  dateKeyInZone,
  addDaysToDateKey,
  timeKeyToMinutes
};
