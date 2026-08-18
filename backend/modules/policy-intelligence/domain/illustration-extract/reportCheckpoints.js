/**
 * Future client-report checkpoints (Year 1, 10, 20, 30, 40…).
 * 5-year fallback when an exact year is absent. Does not invent values.
 */

const DEFAULT_CHECKPOINT_YEARS = Object.freeze([1, 10, 20, 30, 40, 50, 60]);
const FALLBACK_STEP = 5;

function buildReportCheckpoints(timeline = [], requestedYears = DEFAULT_CHECKPOINT_YEARS) {
  const byYear = new Map();
  for (const row of Array.isArray(timeline) ? timeline : []) {
    if (row?.policyYear == null) {
      continue;
    }
    byYear.set(Number(row.policyYear), row);
  }

  const years = [...byYear.keys()].sort((a, b) => a - b);

  return requestedYears.map((requestedYear) => {
    if (byYear.has(requestedYear)) {
      return Object.freeze({
        requestedYear,
        usedYear: requestedYear,
        fallback: false,
        fallbackStep: null,
        row: byYear.get(requestedYear)
      });
    }

    let usedYear = null;
    for (let distance = FALLBACK_STEP; distance <= 20 && usedYear == null; distance += FALLBACK_STEP) {
      if (byYear.has(requestedYear - distance)) {
        usedYear = requestedYear - distance;
      } else if (byYear.has(requestedYear + distance)) {
        usedYear = requestedYear + distance;
      }
    }

    if (usedYear == null && years.length) {
      usedYear = years.reduce((closest, year) =>
        Math.abs(year - requestedYear) < Math.abs(closest - requestedYear) ? year : closest
      );
      if (Math.abs(usedYear - requestedYear) > 20) {
        usedYear = null;
      }
    }

    return Object.freeze({
      requestedYear,
      usedYear,
      fallback: usedYear != null,
      fallbackStep: usedYear != null ? FALLBACK_STEP : null,
      row: usedYear != null ? byYear.get(usedYear) : null
    });
  });
}

module.exports = {
  DEFAULT_CHECKPOINT_YEARS,
  FALLBACK_STEP,
  buildReportCheckpoints
};
