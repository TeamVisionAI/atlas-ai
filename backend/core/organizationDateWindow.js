/**
 * BR-079 — Organization-local calendar date windows.
 * Server runtime timezone is never the business-calendar source of truth.
 */

const ATLAS_DEFAULT_TIMEZONE = "America/New_York";
const UTC_FALLBACK = "UTC";

const TIMEZONE_SOURCES = Object.freeze({
  ORGANIZATION_SETTINGS: "organization_settings",
  ORGANIZATION_PROFILE: "organization_profile",
  ATLAS_DEFAULT: "atlas_default",
  UTC_FALLBACK: "utc_fallback"
});

const RELATIVE_PERIODS = Object.freeze({
  TODAY: "today",
  YESTERDAY: "yesterday",
  TOMORROW: "tomorrow",
  THIS_WEEK: "this_week",
  LAST_WEEK: "last_week",
  CURRENT_MONTH: "current_month",
  PREVIOUS_MONTH: "previous_month"
});

function isValidIanaTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") {
    return false;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timeZone.trim() });
    return true;
  } catch {
    return false;
  }
}

function partsInZone(ms, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

/**
 * Convert a wall-clock local time in `timeZone` to a UTC epoch ms.
 * Iterates to converge across DST transitions (days may not be 24h).
 */
function zonedTimeToUtcMs(year, month, day, hour, minute, second, millisecond, timeZone) {
  let utc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);

  for (let i = 0; i < 4; i += 1) {
    const parts = partsInZone(utc, timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
      millisecond
    );
    const desired = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
    const delta = desired - asUtc;

    if (delta === 0) {
      break;
    }

    utc += delta;
  }

  return utc;
}

function addCalendarDays(year, month, day, deltaDays) {
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const shifted = new Date(utcNoon + deltaDays * 24 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function startOfWeekSunday(year, month, day) {
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const weekday = new Date(utcNoon).getUTCDay(); // 0=Sun
  return addCalendarDays(year, month, day, -weekday);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatLocalDateTime(year, month, day, hour, minute, second, millisecond) {
  const ms = String(millisecond).padStart(3, "0");
  return `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:${pad2(second)}.${ms}`;
}

function buildDayWindow(year, month, day, timeZone, source) {
  const utcStartMs = zonedTimeToUtcMs(year, month, day, 0, 0, 0, 0, timeZone);
  const utcEndMs = zonedTimeToUtcMs(year, month, day, 23, 59, 59, 999, timeZone);

  return {
    timeZone,
    source,
    period: null,
    localStart: formatLocalDateTime(year, month, day, 0, 0, 0, 0),
    localEnd: formatLocalDateTime(year, month, day, 23, 59, 59, 999),
    utcStart: new Date(utcStartMs).toISOString(),
    utcEnd: new Date(utcEndMs).toISOString(),
    utcStartMs,
    utcEndMs
  };
}

function resolveOrganizationTimezone(input = {}) {
  const candidates = [
    {
      value: input.organizationSettingsTimezone,
      source: TIMEZONE_SOURCES.ORGANIZATION_SETTINGS
    },
    {
      value: input.organizationProfileTimezone,
      source: TIMEZONE_SOURCES.ORGANIZATION_PROFILE
    },
    {
      value: process.env.ATLAS_DEFAULT_TIMEZONE || ATLAS_DEFAULT_TIMEZONE,
      source: TIMEZONE_SOURCES.ATLAS_DEFAULT
    }
  ];

  for (const candidate of candidates) {
    if (isValidIanaTimeZone(candidate.value)) {
      return {
        timeZone: String(candidate.value).trim(),
        source: candidate.source
      };
    }
  }

  return {
    timeZone: UTC_FALLBACK,
    source: TIMEZONE_SOURCES.UTC_FALLBACK
  };
}

/**
 * Resolve timezone for an organization-scoped session.
 *
 * Organization isolation (BR-079):
 * - Callers must pass the authenticated session / authorized report organizationId.
 * - Client-supplied timezone overrides are rejected (ignored).
 * - Cross-organization super-admin reports must resolve windows per organization;
 *   do not aggregate multi-org metrics under a single timezone unless a report
 *   explicitly documents that behavior.
 *
 * Current storage note: organization settings timezone is process/env scoped
 * until per-organization timezone persistence exists. Appointment profile defaults
 * supply America/New_York for Team Vision today.
 */
function loadOrganizationTimezone(organizationId = null, deps = {}) {
  if (deps.clientTimeZone) {
    // Explicitly ignore client overrides — never trust query/body timezone.
  }

  let organizationSettingsTimezone = null;
  let organizationProfileTimezone = null;

  try {
    const getOrganizationSettings =
      deps.getOrganizationSettings ||
      require("./organizationSettingsEngine").getOrganizationSettings;
    const settings = getOrganizationSettings(organizationId);
    organizationSettingsTimezone = settings?.timezone || null;
  } catch {
    organizationSettingsTimezone = null;
  }

  try {
    // Prefer sync organization/profile defaults — never await user-scoped profiles here.
    if (typeof deps.getOrganizationProfileTimezone === "function") {
      organizationProfileTimezone = deps.getOrganizationProfileTimezone(organizationId);
    } else {
      try {
        const { DEFAULT_APPOINTMENT_PROFILE } = require("../services/appointmentProfileService");
        organizationProfileTimezone =
          DEFAULT_APPOINTMENT_PROFILE?.defaults?.timezone || null;
      } catch {
        organizationProfileTimezone = null;
      }

      // Appointment profile default is America/New_York; keep available without DB I/O.
      if (!organizationProfileTimezone) {
        organizationProfileTimezone = ATLAS_DEFAULT_TIMEZONE;
      }
    }
  } catch {
    organizationProfileTimezone = ATLAS_DEFAULT_TIMEZONE;
  }

  return {
    ...resolveOrganizationTimezone({
      organizationSettingsTimezone,
      organizationProfileTimezone
    }),
    organizationId: organizationId || null
  };
}

function getOrganizationDateWindow({
  organizationId = null,
  relativePeriod = RELATIVE_PERIODS.YESTERDAY,
  reference = new Date(),
  timeZoneResolution = null,
  clientTimeZone = null,
  deps = {}
} = {}) {
  // BR-079 — never allow client-supplied timezone to override organization settings.
  void clientTimeZone;

  const resolved =
    timeZoneResolution ||
    loadOrganizationTimezone(organizationId, { ...deps, clientTimeZone });
  const { timeZone, source } = resolved;
  const refMs = reference instanceof Date ? reference.getTime() : Date.parse(reference);
  const safeRefMs = Number.isNaN(refMs) ? Date.now() : refMs;
  const localNow = partsInZone(safeRefMs, timeZone);

  let window;

  switch (relativePeriod) {
    case RELATIVE_PERIODS.TODAY: {
      window = buildDayWindow(
        localNow.year,
        localNow.month,
        localNow.day,
        timeZone,
        source
      );
      break;
    }
    case RELATIVE_PERIODS.YESTERDAY: {
      const y = addCalendarDays(localNow.year, localNow.month, localNow.day, -1);
      window = buildDayWindow(y.year, y.month, y.day, timeZone, source);
      break;
    }
    case RELATIVE_PERIODS.TOMORROW: {
      const t = addCalendarDays(localNow.year, localNow.month, localNow.day, 1);
      window = buildDayWindow(t.year, t.month, t.day, timeZone, source);
      break;
    }
    case RELATIVE_PERIODS.THIS_WEEK: {
      const start = startOfWeekSunday(localNow.year, localNow.month, localNow.day);
      const end = addCalendarDays(start.year, start.month, start.day, 6);
      const utcStartMs = zonedTimeToUtcMs(
        start.year,
        start.month,
        start.day,
        0,
        0,
        0,
        0,
        timeZone
      );
      const utcEndMs = zonedTimeToUtcMs(
        end.year,
        end.month,
        end.day,
        23,
        59,
        59,
        999,
        timeZone
      );
      window = {
        timeZone,
        source,
        localStart: formatLocalDateTime(start.year, start.month, start.day, 0, 0, 0, 0),
        localEnd: formatLocalDateTime(end.year, end.month, end.day, 23, 59, 59, 999),
        utcStart: new Date(utcStartMs).toISOString(),
        utcEnd: new Date(utcEndMs).toISOString(),
        utcStartMs,
        utcEndMs
      };
      break;
    }
    case RELATIVE_PERIODS.LAST_WEEK: {
      const thisStart = startOfWeekSunday(localNow.year, localNow.month, localNow.day);
      const start = addCalendarDays(thisStart.year, thisStart.month, thisStart.day, -7);
      const end = addCalendarDays(start.year, start.month, start.day, 6);
      const utcStartMs = zonedTimeToUtcMs(
        start.year,
        start.month,
        start.day,
        0,
        0,
        0,
        0,
        timeZone
      );
      const utcEndMs = zonedTimeToUtcMs(
        end.year,
        end.month,
        end.day,
        23,
        59,
        59,
        999,
        timeZone
      );
      window = {
        timeZone,
        source,
        localStart: formatLocalDateTime(start.year, start.month, start.day, 0, 0, 0, 0),
        localEnd: formatLocalDateTime(end.year, end.month, end.day, 23, 59, 59, 999),
        utcStart: new Date(utcStartMs).toISOString(),
        utcEnd: new Date(utcEndMs).toISOString(),
        utcStartMs,
        utcEndMs
      };
      break;
    }
    case RELATIVE_PERIODS.CURRENT_MONTH: {
      const utcStartMs = zonedTimeToUtcMs(
        localNow.year,
        localNow.month,
        1,
        0,
        0,
        0,
        0,
        timeZone
      );
      const nextMonth = localNow.month === 12
        ? { year: localNow.year + 1, month: 1 }
        : { year: localNow.year, month: localNow.month + 1 };
      const lastDay = addCalendarDays(nextMonth.year, nextMonth.month, 1, -1);
      const utcEndMs = zonedTimeToUtcMs(
        lastDay.year,
        lastDay.month,
        lastDay.day,
        23,
        59,
        59,
        999,
        timeZone
      );
      window = {
        timeZone,
        source,
        localStart: formatLocalDateTime(localNow.year, localNow.month, 1, 0, 0, 0, 0),
        localEnd: formatLocalDateTime(
          lastDay.year,
          lastDay.month,
          lastDay.day,
          23,
          59,
          59,
          999
        ),
        utcStart: new Date(utcStartMs).toISOString(),
        utcEnd: new Date(utcEndMs).toISOString(),
        utcStartMs,
        utcEndMs
      };
      break;
    }
    case RELATIVE_PERIODS.PREVIOUS_MONTH: {
      const prev =
        localNow.month === 1
          ? { year: localNow.year - 1, month: 12 }
          : { year: localNow.year, month: localNow.month - 1 };
      const utcStartMs = zonedTimeToUtcMs(prev.year, prev.month, 1, 0, 0, 0, 0, timeZone);
      const nextMonth =
        prev.month === 12
          ? { year: prev.year + 1, month: 1 }
          : { year: prev.year, month: prev.month + 1 };
      const lastDay = addCalendarDays(nextMonth.year, nextMonth.month, 1, -1);
      const utcEndMs = zonedTimeToUtcMs(
        lastDay.year,
        lastDay.month,
        lastDay.day,
        23,
        59,
        59,
        999,
        timeZone
      );
      window = {
        timeZone,
        source,
        localStart: formatLocalDateTime(prev.year, prev.month, 1, 0, 0, 0, 0),
        localEnd: formatLocalDateTime(
          lastDay.year,
          lastDay.month,
          lastDay.day,
          23,
          59,
          59,
          999
        ),
        utcStart: new Date(utcStartMs).toISOString(),
        utcEnd: new Date(utcEndMs).toISOString(),
        utcStartMs,
        utcEndMs
      };
      break;
    }
    default:
      throw new Error(`Unsupported relativePeriod: ${relativePeriod}`);
  }

  return {
    ...window,
    period: relativePeriod,
    organizationId: organizationId || null
  };
}

function isTimestampInWindow(timestamp, window) {
  if (!window) {
    return false;
  }

  let ms;
  if (timestamp instanceof Date) {
    ms = timestamp.getTime();
  } else if (typeof timestamp === "number") {
    ms = timestamp;
  } else if (typeof timestamp === "string") {
    ms = Date.parse(timestamp);
  } else {
    return false;
  }

  if (!Number.isFinite(ms)) {
    return false;
  }

  return ms >= window.utcStartMs && ms <= window.utcEndMs;
}

function buildDateWindowCacheKey({ organizationId, timeZone, period, localStart, localEnd }) {
  return [
    "org-date-window",
    organizationId || "none",
    timeZone || "none",
    period || "none",
    localStart || "none",
    localEnd || "none"
  ].join(":");
}

module.exports = {
  ATLAS_DEFAULT_TIMEZONE,
  UTC_FALLBACK,
  TIMEZONE_SOURCES,
  RELATIVE_PERIODS,
  isValidIanaTimeZone,
  resolveOrganizationTimezone,
  loadOrganizationTimezone,
  getOrganizationDateWindow,
  isTimestampInWindow,
  buildDateWindowCacheKey,
  zonedTimeToUtcMs,
  partsInZone
};
