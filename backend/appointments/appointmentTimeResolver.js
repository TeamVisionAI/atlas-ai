/**
 * Journey #2 — Resolve preferred date/time text into a concrete ISO start time.
 * Implements BR-001 spirit: schedule within ~48 hours when possible.
 */

const TIME_ZONE = "America/New_York";

function startOfDay(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function addDays(date, days) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function nextBusinessDay(fromDate = new Date()) {
  let cursor = addDays(startOfDay(fromDate), 1);

  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor = addDays(cursor, 1);
  }

  return cursor;
}

function resolvePreferredDate(preferredDate) {
  const text = String(preferredDate || "").trim().toLowerCase();
  const today = startOfDay(new Date());

  if (!text || text === "today") {
    return today;
  }

  if (text === "tomorrow") {
    return addDays(today, 1);
  }

  const weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

  if (weekdays.includes(text)) {
    const target = weekdays.indexOf(text);
    const cursor = new Date(today);
    let safety = 0;

    while (cursor.getDay() !== target && safety < 8) {
      cursor.setDate(cursor.getDate() + 1);
      safety += 1;
    }

    return cursor;
  }

  const parsed = Date.parse(text);

  if (!Number.isNaN(parsed)) {
    return new Date(parsed);
  }

  return nextBusinessDay(today);
}

function resolvePreferredTime(preferredTime, baseDate) {
  const text = String(preferredTime || "").trim().toLowerCase();
  const date = new Date(baseDate);

  if (!text || text.includes("morning") || text.includes("mañana")) {
    date.setHours(10, 0, 0, 0);
    return date;
  }

  if (text.includes("afternoon") || text.includes("tarde")) {
    date.setHours(14, 0, 0, 0);
    return date;
  }

  if (text.includes("evening")) {
    date.setHours(17, 30, 0, 0);
    return date;
  }

  const match = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);

  if (match) {
    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = match[3]?.toLowerCase();

    if (meridiem === "pm" && hour < 12) {
      hour += 12;
    }

    if (meridiem === "am" && hour === 12) {
      hour = 0;
    }

    date.setHours(hour, minute, 0, 0);
    return date;
  }

  date.setHours(10, 0, 0, 0);
  return date;
}

/**
 * @param {Object} interview
 * @returns {{ startTime: string, endTime: string, timeZone: string }}
 */
function resolveInterviewDateTime(interview = {}) {
  const baseDate = resolvePreferredDate(interview.preferredDate);
  const start = resolvePreferredTime(interview.preferredTime, baseDate);
  const end = new Date(start.getTime() + 30 * 60 * 1000);

  return {
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    timeZone: TIME_ZONE
  };
}

module.exports = {
  resolveInterviewDateTime
};
