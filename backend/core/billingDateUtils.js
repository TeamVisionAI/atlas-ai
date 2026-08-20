/**
 * BR-145 — Calendar-month billing date helpers (not naive millisecond months).
 */

function addOneCalendarMonth(isoInput, referenceDate = new Date()) {
  const base = isoInput ? new Date(isoInput) : referenceDate;

  if (Number.isNaN(base.getTime())) {
    const error = new Error("Invalid paidAt date.");
    error.statusCode = 400;
    error.publicCode = "INVALID_PAID_AT";
    throw error;
  }

  const year = base.getUTCFullYear();
  const month = base.getUTCMonth();
  const day = base.getUTCDate();
  const hours = base.getUTCHours();
  const minutes = base.getUTCMinutes();
  const seconds = base.getUTCSeconds();
  const milliseconds = base.getUTCMilliseconds();

  const targetMonthIndex = month + 1;
  const lastDayOfTargetMonth = new Date(Date.UTC(year, targetMonthIndex + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  return new Date(
    Date.UTC(year, targetMonthIndex, clampedDay, hours, minutes, seconds, milliseconds)
  ).toISOString();
}

function addCalendarDays(isoInput, days) {
  const base = new Date(isoInput);

  if (Number.isNaN(base.getTime())) {
    const error = new Error("Invalid date.");
    error.statusCode = 400;
    error.publicCode = "INVALID_DATE";
    throw error;
  }

  const result = new Date(base);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString();
}

module.exports = {
  addOneCalendarMonth,
  addCalendarDays
};
