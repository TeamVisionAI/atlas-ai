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
  const constraint = fromIntent || fromContext || null;
  const {
    resolveEarliestTimeInclusive
  } = require("./schedulingConstraints");
  return {
    earliestTime: constraint?.earliestTime || null,
    latestTime: constraint?.latestTime || null,
    dayPart: constraint?.dayPart || null,
    // BR-107 consumes normalized inclusivity — never reparse raw here.
    earliestTimeInclusive: constraint
      ? resolveEarliestTimeInclusive(constraint)
      : true,
    raw: constraint?.raw || null
  };
}

/**
 * Explicit earliest/latest outrank day-part. Do not use engine afternoon (ends 18:00)
 * when earliestTime is set — pass timePreference "any" and filter here.
 * Exclusive earliestTime → minutes > bound; inclusive → minutes >= bound.
 */
function filterSlotsByConstraints(slots, constraints = {}) {
  const earliest = timeKeyToMinutes(constraints.earliestTime);
  const latest = timeKeyToMinutes(constraints.latestTime);
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

/** Drop slots at/before now (org-local wall clock via ISO/zoned conversion). */
function filterFutureSlots(slots, nowMs, timeZone = DEFAULT_TIMEZONE) {
  const now = Number(nowMs) || Date.now();
  return (slots || []).filter((slot) => {
    const start = slotStartMs(slot, timeZone);
    return start != null && start > now;
  });
}

function slotIdentity(slot) {
  return `${slot?.dateKey || slot?.date || ""}|${slot?.timeKey || slot?.time || ""}`;
}

/**
 * BR-108 — prefer meaningful choice across dates when real options exist:
 * Slot A = earliest qualifying slot
 * Slot B = earliest slot on a later date when available; else same-day latest (BR-107)
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
      latestTime: constraints.latestTime || null,
      earliestTimeInclusive:
        typeof constraints.earliestTimeInclusive === "boolean"
          ? constraints.earliestTimeInclusive
          : true
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
 * BR-108 — concrete date optional when an explicit time constraint exists
 * (rolling multi-date search). Never invents slots.
 */
function shouldAttemptAvailabilityOffer({ context, interpretation } = {}) {
  const constraints = resolveConstraints({ context, interpretation });
  if (!constraints.earliestTime && !constraints.latestTime) {
    return false;
  }

  const intent = interpretation?.intent || null;
  const { INTENTS } = require("./constants");
  const allowedIntent =
    intent === INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT ||
    intent === INTENTS.SCHEDULING_DATE_PROPOSAL ||
    intent === INTENTS.REASSERT_KNOWN_FACT;
  if (!allowedIntent) {
    return false;
  }

  const date = resolveConcreteScheduleDate({ context, interpretation });
  // Concrete date → single-day BR-107 path. No date → BR-108 rolling path.
  return Boolean(date) || intent === INTENTS.PROVIDE_AVAILABILITY_CONSTRAINT;
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
    const future = filterFutureSlots(normalized, nowMs, tz);
    return filterSlotsByConstraints(future, constraints);
  };

  let qualifying = [];
  let resolvedTimezone = tz;
  let providerFailed = false;

  try {
    if (Array.isArray(fixtureSlots)) {
      qualifying = collectFromRaw(fixtureSlots);
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
      qualifying = collectFromRaw(initialResult?.slots || []);

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
        const dayQualifying = collectFromRaw(dayResult?.slots || []);
        const seen = new Set(qualifying.map(slotIdentity));
        for (const slot of dayQualifying) {
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
  }

  const offered = selectCrossDateCandidateSlots(qualifying, {
    maxCandidates,
    rejectIds
  });

  return {
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
  };
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
    now = null
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

  const collect = (rawSlots) =>
    filterSlotsByConstraints(
      filterFutureSlots(
        (rawSlots || []).map((s) => normalizeSlot(s, tz)).filter(Boolean),
        nowMs,
        tz
      ),
      constraints
    );

  if (Array.isArray(fixtureSlots)) {
    const qualifying = collect(fixtureSlots).filter((slot) => {
      const dk = slot.dateKey || slot.date;
      return dk && dk >= startDateKey && dk <= maxEndDateKey;
    });
    const offered = selectCrossDateCandidateSlots(qualifying, {
      maxCandidates,
      rejectIds
    });
    return {
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
    };
  }

  try {
    let qualifying = collect(
      getSlotsSync({
        agentId,
        organizationId,
        date: startDateKey,
        dateEnd: initialEndDateKey,
        purpose: "recruiting_interview",
        timePreference: "any",
        maxResults: 0
      })?.slots || []
    );
    let offered = selectCrossDateCandidateSlots(qualifying, {
      maxCandidates,
      rejectIds
    });
    let cursor = addDaysToDateKey(initialEndDateKey, 1);
    while (
      offered.length < maxCandidates &&
      daysBetweenDateKeys(startDateKey, cursor) < MAX_EXPANSION_DAYS
    ) {
      const daySlots = collect(
        getSlotsSync({
          agentId,
          organizationId,
          date: cursor,
          purpose: "recruiting_interview",
          timePreference: "any",
          maxResults: 24
        })?.slots || []
      );
      const seen = new Set(qualifying.map(slotIdentity));
      for (const slot of daySlots) {
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
    return {
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
    };
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
  const avoidPrevious = options.avoidPreviouslyOffered === true;
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

  // BR-108 — no concrete date → bounded rolling multi-date search.
  if (!date) {
    const readResult = await readRollingCandidateSlots({
      organizationId,
      agentId,
      agentResolutionSource,
      timezone,
      constraints,
      fixtureSlots,
      getSlots: options.getSlots || null,
      rejectIds,
      maxCandidates: options.maxCandidates || DEFAULT_MAX_CANDIDATES,
      now
    });
    return toDecisionAvailability(readResult);
  }

  // BR-107 — concrete date → single-day read.
  const readResult = await readCandidateSlots({
    organizationId,
    agentId,
    agentResolutionSource,
    date,
    timezone,
    constraints,
    fixtureSlots,
    getSlots: options.getSlots || null,
    rejectTimes,
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
      latestTime: constraints.latestTime || null,
      earliestTimeInclusive:
        typeof constraints.earliestTimeInclusive === "boolean"
          ? constraints.earliestTimeInclusive
          : true
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
  const timezone =
    options.timezone ||
    context.timezone ||
    options.availabilityFixture?.timezone ||
    DEFAULT_TIMEZONE;
  const organizationId = context.organizationId || options.organizationId || null;
  const now = options.now || context._testNow || null;
  const avoidPrevious = options.avoidPreviouslyOffered === true;
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
    return toDecisionAvailability(readResult);
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

  return toDecisionAvailability(readResult);
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
  resolveAvailabilityForTurn,
  resolveAvailabilityForTurnSync,
  dateKeyInZone,
  addDaysToDateKey,
  timeKeyToMinutes
};
