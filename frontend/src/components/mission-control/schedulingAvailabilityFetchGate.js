/**
 * Availability fetch gate for Mission Control scheduling.
 * Keys refetches on calendar-relevant inputs only (mode + interviewer + duration).
 * Public-location name/address/url must NOT appear in the key.
 */

const counters = {
  logicalLoads: 0,
  httpRequests: 0,
  initialLoads: 0,
  blockedIdentical: 0,
  triggerReasons: []
};

export function resetSchedulingAvailabilityFetchCounters() {
  counters.logicalLoads = 0;
  counters.httpRequests = 0;
  counters.initialLoads = 0;
  counters.blockedIdentical = 0;
  counters.triggerReasons = [];
}

export function getSchedulingAvailabilityFetchCounters() {
  return {
    logicalLoads: counters.logicalLoads,
    httpRequests: counters.httpRequests,
    /** @deprecated alias for logicalLoads — prefer logicalLoads */
    availabilityRequests: counters.logicalLoads,
    initialLoads: counters.initialLoads,
    blockedIdentical: counters.blockedIdentical,
    triggerReasons: [...counters.triggerReasons]
  };
}

export function recordSchedulingAvailabilityFetch(reason, key) {
  if (reason === "http") {
    counters.httpRequests += 1;
  } else {
    counters.logicalLoads += 1;
    if (reason === "initial") {
      counters.initialLoads += 1;
    }
  }

  counters.triggerReasons.push({ reason, key, at: Date.now() });
}

export function recordSchedulingAvailabilityBlocked(key) {
  counters.blockedIdentical += 1;
  counters.triggerReasons.push({ reason: "blocked_identical", key, at: Date.now() });
}

/**
 * Build a stable primitive key for availability loads.
 * Intentionally excludes: meetingLocationName/Address/Url, notes, dateKey/timeKey,
 * and duration (duration is resolved from profile inside the load — including it
 * in the effect key would re-fetch after setDurationMinutes).
 */
export function buildSchedulingAvailabilityFetchKey({
  interviewType = "",
  interviewerUserId = "",
  interviewerSelection = ""
} = {}) {
  const type = String(interviewType || "").trim().toLowerCase();
  const interviewer = String(interviewerUserId || "").trim();
  const selection = String(interviewerSelection || "").trim().toLowerCase();

  if (!type) {
    return "";
  }

  return `${type}|${selection || "auto"}|${interviewer}`;
}

/**
 * Public-location detail fields that must never trigger availability refetch.
 */
export const PUBLIC_LOCATION_FIELDS_EXCLUDED_FROM_AVAILABILITY = Object.freeze([
  "meetingLocationName",
  "meetingLocationAddress",
  "meetingLocationUrl"
]);

export function shouldFetchSchedulingAvailability(previousKey, nextKey) {
  if (!nextKey) {
    return false;
  }

  if (previousKey === nextKey) {
    recordSchedulingAvailabilityBlocked(nextKey);
    return false;
  }

  return true;
}

export function resolveAvailabilityFetchReason(previousKey, nextKey) {
  if (!nextKey) {
    return "skip_empty";
  }

  if (!previousKey) {
    return "initial";
  }

  const [prevType, prevSelection, prevInterviewer] = previousKey.split("|");
  const [nextType, nextSelection, nextInterviewer] = nextKey.split("|");

  if (prevType !== nextType) {
    return "interview_type";
  }

  if (prevSelection !== nextSelection || prevInterviewer !== nextInterviewer) {
    return "interviewer";
  }

  return "duration_or_other";
}

export function isLivePollPausedForExpandedMissionAction(expandedMissionActionId) {
  return Boolean(expandedMissionActionId);
}
