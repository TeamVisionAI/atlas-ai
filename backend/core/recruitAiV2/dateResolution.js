/**
 * Recruit AI v2 — conversational date resolution (BR-085).
 * Uses organization-local calendar rules (BR-079); never Railway UTC day boundaries.
 */

const {
  ATLAS_DEFAULT_TIMEZONE,
  partsInZone
} = require("../organizationDateWindow");

const WEEKDAY_INDEX = Object.freeze({
  sunday: 0,
  domingo: 0,
  monday: 1,
  lunes: 1,
  tuesday: 2,
  martes: 2,
  wednesday: 3,
  miercoles: 3,
  thursday: 4,
  jueves: 4,
  friday: 5,
  viernes: 5,
  saturday: 6,
  sabado: 6
});

const WEEKDAY_LABELS = Object.freeze({
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
  ],
  es: [
    "domingo",
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado"
  ]
});

function normalizeAscii(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatIsoDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
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

function localWeekdayIndex(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0)).getUTCDay();
}

/**
 * Extract unavailable relative days (today / tomorrow) without discarding the candidate.
 */
function parseDateExclusions(text) {
  const t = normalizeAscii(text);
  const exclusions = [];

  const mentionsTodayUnavailable =
    /\bni hoy\b/.test(t) ||
    /\bno puedo\b[\s\S]{0,40}\bhoy\b/.test(t) ||
    /\bno\b[\s\S]{0,20}\bhoy\b[\s\S]{0,20}\b(ni|manana|mañana)\b/.test(t);

  const mentionsTomorrowUnavailable =
    /\bni manana\b/.test(t) ||
    /\bno puedo\b[\s\S]{0,40}\bmanana\b/.test(t) ||
    /\bhoy ni manana\b/.test(t);

  if (mentionsTodayUnavailable) {
    exclusions.push({ kind: "offset", days: 0, label: "today" });
  }
  if (mentionsTomorrowUnavailable) {
    exclusions.push({ kind: "offset", days: 1, label: "tomorrow" });
  }

  return exclusions;
}

/**
 * Prefer weekday / next-week candidates over relative tokens that appear in exclusions.
 */
function extractDateCandidateHint(text) {
  const t = normalizeAscii(text);

  if (/\b(next week|la proxima semana|proxima semana)\b/.test(t)) {
    return { kind: "next_week" };
  }

  const weekdayNames = Object.keys(WEEKDAY_INDEX);
  const weekdayMatch = weekdayNames.find((name) =>
    new RegExp(`\\b${name}\\b`).test(t)
  );
  if (weekdayMatch) {
    return { kind: "weekday", dayName: weekdayMatch };
  }

  if (/\b(day after tomorrow|pasado manana)\b/.test(t)) {
    return { kind: "offset", days: 2, label: "day_after_tomorrow" };
  }

  // Relative candidates only when not clearly negated.
  const exclusions = parseDateExclusions(text);
  const tomorrowExcluded = exclusions.some((e) => e.days === 1);
  const todayExcluded = exclusions.some((e) => e.days === 0);

  if (!tomorrowExcluded && /\b(tomorrow|manana)\b/.test(t)) {
    return { kind: "offset", days: 1, label: "tomorrow" };
  }
  if (!todayExcluded && /\b(today|hoy)\b/.test(t)) {
    return { kind: "offset", days: 0, label: "today" };
  }

  return null;
}

function resolveDateCandidate(dayHint, options = {}) {
  if (!dayHint) {
    return null;
  }

  const timeZone = options.timeZone || ATLAS_DEFAULT_TIMEZONE;
  const now = options.now instanceof Date ? options.now : new Date();
  const parts = partsInZone(now.getTime(), timeZone);

  let resolved;
  if (dayHint.kind === "weekday" && dayHint.dayName) {
    const target = WEEKDAY_INDEX[normalizeAscii(dayHint.dayName)];
    if (target == null) {
      return null;
    }
    const current = localWeekdayIndex(parts.year, parts.month, parts.day);
    const delta = (target - current + 7) % 7;
    resolved = addCalendarDays(parts.year, parts.month, parts.day, delta);
  } else if (dayHint.kind === "offset" && Number.isFinite(dayHint.days)) {
    resolved = addCalendarDays(parts.year, parts.month, parts.day, dayHint.days);
  } else if (dayHint.kind === "next_week") {
    // Start of next calendar week (Sunday) + 1 day → Monday of next week.
    const current = localWeekdayIndex(parts.year, parts.month, parts.day);
    const toNextSunday = (7 - current) % 7 || 7;
    resolved = addCalendarDays(parts.year, parts.month, parts.day, toNextSunday + 1);
  } else {
    return null;
  }

  const isoDate = formatIsoDate(resolved.year, resolved.month, resolved.day);
  const weekdayIndex = localWeekdayIndex(resolved.year, resolved.month, resolved.day);

  return {
    isoDate,
    year: resolved.year,
    month: resolved.month,
    day: resolved.day,
    weekdayIndex,
    dayName: WEEKDAY_LABELS.en[weekdayIndex].toLowerCase(),
    dayNameEs: WEEKDAY_LABELS.es[weekdayIndex],
    timeZone,
    kind: dayHint.kind,
    sourceHint: dayHint
  };
}

function resolveDateExclusions(exclusions = [], options = {}) {
  return exclusions
    .map((ex) => resolveDateCandidate(ex, options))
    .filter(Boolean)
    .map((r) => r.isoDate);
}

function formatDateLabel(resolved, language = "english") {
  if (!resolved) {
    return language === "spanish" ? "ese día" : "that day";
  }
  if (language === "spanish") {
    return resolved.dayNameEs || resolved.dayName || resolved.isoDate;
  }
  const en = resolved.dayName
    ? resolved.dayName.charAt(0).toUpperCase() + resolved.dayName.slice(1)
    : resolved.isoDate;
  return en;
}

/**
 * True when schedule has a date/day hint and no clock time (never invent midnight).
 */
function isDateOnlySchedule(schedule) {
  if (!schedule?.dayHint) {
    return false;
  }
  return schedule.normalizedHour == null && schedule.hour == null;
}

module.exports = {
  WEEKDAY_INDEX,
  parseDateExclusions,
  extractDateCandidateHint,
  resolveDateCandidate,
  resolveDateExclusions,
  formatDateLabel,
  isDateOnlySchedule,
  formatIsoDate,
  addCalendarDays
};
