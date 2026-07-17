const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

const ISO_DATE_TIME_PATTERN =
  /\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?/g;

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfWeek(date) {
  const copy = startOfDay(date);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function isSameDay(left, right) {
  return startOfDay(left).getTime() === startOfDay(right).getTime();
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function formatTime(date) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function formatMonthDay(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatMonthDayYear(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

/**
 * Parses Atlas-supported date/time values into a Date.
 * @param {Date | string | number | null | undefined} value
 * @returns {Date | null}
 */
export function parseAtlasDate(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value).trim();

  if (!text) {
    return null;
  }

  const parsed = Date.parse(text);

  if (Number.isNaN(parsed)) {
    return null;
  }

  return new Date(parsed);
}

/**
 * Global Atlas datetime display standard.
 * Examples:
 * - Today • 5:00 PM
 * - Tomorrow • 9:30 AM
 * - Yesterday • 2:00 PM
 * - Monday • 4:30 PM
 * - Jul 17 • 5:00 PM
 * - Jul 17, 2027 • 5:00 PM
 *
 * @param {Date | string | number | null | undefined} value
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatAtlasDateTime(value, referenceDate = new Date()) {
  const date = parseAtlasDate(value);

  if (!date) {
    return "";
  }

  const text = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return formatAtlasDate(value, referenceDate);
  }

  const now = referenceDate;
  const timeLabel = formatTime(date);

  if (isSameDay(date, now)) {
    return `Today • ${timeLabel}`;
  }

  if (isSameDay(date, addDays(now, 1))) {
    return `Tomorrow • ${timeLabel}`;
  }

  if (isSameDay(date, addDays(now, -1))) {
    return `Yesterday • ${timeLabel}`;
  }

  if (startOfWeek(date).getTime() === startOfWeek(now).getTime()) {
    return `${WEEKDAY_NAMES[date.getDay()]} • ${timeLabel}`;
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${formatMonthDay(date)} • ${timeLabel}`;
  }

  return `${formatMonthDayYear(date)} • ${timeLabel}`;
}

/**
 * Date-only Atlas display standard.
 * @param {Date | string | number | null | undefined} value
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatAtlasDate(value, referenceDate = new Date()) {
  const date = parseAtlasDate(value);

  if (!date) {
    return "";
  }

  const now = referenceDate;

  if (isSameDay(date, now)) {
    return "Today";
  }

  if (isSameDay(date, addDays(now, 1))) {
    return "Tomorrow";
  }

  if (isSameDay(date, addDays(now, -1))) {
    return "Yesterday";
  }

  if (startOfWeek(date).getTime() === startOfWeek(now).getTime()) {
    return WEEKDAY_NAMES[date.getDay()];
  }

  if (date.getFullYear() === now.getFullYear()) {
    return formatMonthDay(date);
  }

  return formatMonthDayYear(date);
}

/**
 * Formats separate date/time fields commonly stored on prospects.
 * @param {string | null | undefined} dateValue
 * @param {string | null | undefined} timeValue
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatAtlasDateTimeParts(dateValue, timeValue, referenceDate = new Date()) {
  const parsedDate = parseAtlasDate(dateValue);
  const parsedTime = parseAtlasDate(timeValue);

  if (parsedDate && parsedTime) {
    return formatAtlasDateTime(parsedDate, referenceDate);
  }

  if (parsedDate) {
    const formattedDate = formatAtlasDate(parsedDate, referenceDate);
    const timeLabel = timeValue ? String(timeValue).trim() : formatTime(parsedDate);

    if (formattedDate === "Today" || formattedDate === "Tomorrow" || formattedDate === "Yesterday") {
      return `${formattedDate} • ${timeLabel}`;
    }

    if (WEEKDAY_NAMES.includes(formattedDate)) {
      return `${formattedDate} • ${timeLabel}`;
    }

    if (formattedDate.includes(",")) {
      return `${formattedDate} • ${timeLabel}`;
    }

    return `${formattedDate} • ${timeLabel}`;
  }

  if (parsedTime) {
    return formatAtlasDateTime(parsedTime, referenceDate);
  }

  if (timeValue) {
    return String(timeValue).trim();
  }

  return "";
}

/**
 * Formats a value for UI display.
 * Parses ISO / timestamp values and preserves already-readable strings.
 * @param {Date | string | number | null | undefined} value
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatIfDateTime(value, referenceDate = new Date()) {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const text = String(value).trim();

  if (!text) {
    return "";
  }

  if (ISO_DATE_TIME_PATTERN.test(text) || /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    ISO_DATE_TIME_PATTERN.lastIndex = 0;
    const formatted = formatAtlasDateTime(text, referenceDate);
    return formatted || text;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) {
    return formatAtlasDateTime(text, referenceDate) || text;
  }

  const parsed = parseAtlasDate(text);

  if (parsed && (/^\d{4}-\d{2}-\d{2}/.test(text) || text.includes("T"))) {
    return formatAtlasDateTime(parsed, referenceDate);
  }

  return text;
}

/**
 * Replaces ISO datetime substrings inside free-form UI copy.
 * @param {string | null | undefined} text
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatTextWithDates(text, referenceDate = new Date()) {
  if (!text) {
    return "";
  }

  return String(text).replace(ISO_DATE_TIME_PATTERN, (match) => {
    const formatted = formatAtlasDateTime(match, referenceDate);
    return formatted || match;
  });
}

/**
 * Preferred formatter for prospect interview display fields.
 * @param {{ interview_time?: string | null, appointment_date?: string | null }} prospect
 * @param {Date} [referenceDate]
 * @returns {string}
 */
export function formatProspectInterviewTime(prospect, referenceDate = new Date()) {
  if (!prospect) {
    return "";
  }

  const combined = formatAtlasDateTimeParts(
    prospect.appointment_date,
    prospect.interview_time,
    referenceDate
  );

  if (combined) {
    return combined;
  }

  return formatIfDateTime(prospect.interview_time, referenceDate);
}

export default {
  parseAtlasDate,
  formatAtlasDateTime,
  formatAtlasDate,
  formatAtlasDateTimeParts,
  formatIfDateTime,
  formatTextWithDates,
  formatProspectInterviewTime
};
