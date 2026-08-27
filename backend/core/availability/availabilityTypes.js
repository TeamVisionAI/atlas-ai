/**
 * BR-161 — Provider-neutral personal availability types.
 * Scheduling engine consumes merged busy windows only.
 */

const PROVIDERS = Object.freeze({
  GOOGLE_CALENDAR: "google_calendar",
  ICLOUD_CALENDAR: "icloud_calendar",
  ATLAS_APPOINTMENT: "atlas_appointment"
});

const AVAILABILITY_ERROR_KINDS = Object.freeze({
  AUTH: "auth",
  UNAVAILABLE: "unavailable"
});

class AvailabilityError extends Error {
  constructor(kind, code, message) {
    super(message);
    this.name = "AvailabilityError";
    this.kind = kind;
    this.code = code;
    this.publicCode = code;
  }
}

function createAvailabilityAuthError(code = "ICLOUD_RECONNECT_REQUIRED") {
  const error = new AvailabilityError(
    AVAILABILITY_ERROR_KINDS.AUTH,
    code,
    "Apple Calendar authorization expired. Reconnect Apple Calendar / iCloud to continue."
  );
  error.statusCode = 409;
  return error;
}

function createAvailabilityUnavailableError(code = "ICLOUD_UNAVAILABLE") {
  const error = new AvailabilityError(
    AVAILABILITY_ERROR_KINDS.UNAVAILABLE,
    code,
    "Apple Calendar is temporarily unavailable."
  );
  error.statusCode = 503;
  return error;
}

function isAvailabilityAuthError(error) {
  return error?.kind === AVAILABILITY_ERROR_KINDS.AUTH;
}

function isAvailabilityUnavailableError(error) {
  return error?.kind === AVAILABILITY_ERROR_KINDS.UNAVAILABLE;
}

function normalizeBusyWindow(input = {}, fallbackTimezone = "America/New_York") {
  const startMs = Date.parse(input.start);
  const endMs = Date.parse(input.end);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return null;
  }

  return {
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    timezone: String(input.timezone || fallbackTimezone).trim() || fallbackTimezone,
    source: input.source || input.provider || null,
    allDay: Boolean(input.allDay),
    calendarId: input.calendarId || null
  };
}

function busyWindowToRange(window) {
  return {
    start: Date.parse(window.start),
    end: Date.parse(window.end),
    source: window.source,
    allDay: Boolean(window.allDay),
    calendarId: window.calendarId || null
  };
}

function unionBusyRanges(ranges = []) {
  const valid = (ranges || [])
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged = [];
  for (const range of valid) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      if (range.source && last.source && range.source !== last.source) {
        last.source = `${last.source}+${range.source}`;
      }
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

module.exports = {
  PROVIDERS,
  AVAILABILITY_ERROR_KINDS,
  AvailabilityError,
  createAvailabilityAuthError,
  createAvailabilityUnavailableError,
  isAvailabilityAuthError,
  isAvailabilityUnavailableError,
  normalizeBusyWindow,
  busyWindowToRange,
  unionBusyRanges
};
