/**
 * BR-186 — deterministic premium and estimated-commission math.
 * No global default percents. Missing config yields a null estimate.
 */

const { COMMISSION_LABELS } = require("./constants");

function parseMoney(value, fieldName = "amount") {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    const error = new Error(`A valid ${fieldName} is required.`);
    error.code = "VALIDATION_ERROR";
    error.publicCode = "VALIDATION_ERROR";
    error.statusCode = 400;
    throw error;
  }
  return Math.round(number * 100) / 100;
}

function parsePercent(value, fieldName = "percent") {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1000) {
    const error = new Error(`A valid ${fieldName} is required.`);
    error.code = "VALIDATION_ERROR";
    error.publicCode = "VALIDATION_ERROR";
    error.statusCode = 400;
    throw error;
  }
  return Math.round(number * 100) / 100;
}

function calculateAnnualizedPremium(monthlyPremium, annualizedPremium) {
  const explicit = parseMoney(annualizedPremium, "annualized premium");
  if (explicit != null) return explicit;
  const monthly = parseMoney(monthlyPremium, "monthly premium");
  if (monthly == null) return null;
  return parseMoney(monthly * 12, "annualized premium");
}

function calculateEstimatedTakeHome({
  annualizedPremium,
  commissionLevelPct,
  paidAdvanceFactorPct
} = {}) {
  const ap = parseMoney(annualizedPremium, "annualized premium");
  const level = parsePercent(commissionLevelPct, "commission level");
  const factor = parsePercent(paidAdvanceFactorPct, "paid/advance factor");
  if (ap == null || level == null || factor == null) return null;
  return parseMoney(ap * (level / 100) * (factor / 100), "estimated take-home");
}

function resolveCommissionPresentation({
  estimatedTakeHome,
  actualPaidCommission
} = {}) {
  const actual = parseMoney(actualPaidCommission, "actual paid commission");
  if (actual != null) {
    return {
      commissionLabel: COMMISSION_LABELS.ACTUAL,
      commissionAmount: actual,
      estimatedTakeHome: estimatedTakeHome == null ? null : parseMoney(estimatedTakeHome)
    };
  }
  const estimated = parseMoney(estimatedTakeHome, "estimated take-home");
  return {
    commissionLabel: COMMISSION_LABELS.ESTIMATED,
    commissionAmount: estimated,
    estimatedTakeHome: estimated
  };
}

function emptyDashboardMetrics() {
  return {
    newLeads: 0,
    qualified: 0,
    appointmentsBooked: 0,
    documentsPending: 0,
    reviewsCompleted: 0,
    replacementOpportunities: 0,
    applicationsSubmitted: 0,
    placed: 0,
    monthlyPremium: 0,
    annualizedPremium: 0,
    estimatedCommission: 0
  };
}

function aggregateDashboardMetrics(items = []) {
  const metrics = emptyDashboardMetrics();
  for (const item of items) {
    if (item.stage === "NEW_REVIEW_LEAD") metrics.newLeads += 1;
    if (item.stage === "QUALIFIED") metrics.qualified += 1;
    if (item.stage === "APPOINTMENT_BOOKED") metrics.appointmentsBooked += 1;
    if (item.stage === "DOCUMENTS_REQUESTED") metrics.documentsPending += 1;
    if (
      item.stage === "REVIEW_COMPLETED" ||
      item.stage === "KEEP_CURRENT" ||
      item.stage === "ADJUST_CURRENT" ||
      item.stage === "REPLACEMENT_OPPORTUNITY" ||
      item.stage === "APPLICATION_SUBMITTED" ||
      item.stage === "PLACED"
    ) {
      metrics.reviewsCompleted += 1;
    }
    if (item.stage === "REPLACEMENT_OPPORTUNITY") metrics.replacementOpportunities += 1;
    if (item.stage === "APPLICATION_SUBMITTED") metrics.applicationsSubmitted += 1;
    if (item.stage === "PLACED") metrics.placed += 1;
    metrics.monthlyPremium += Number(item.monthlyPremium) || 0;
    metrics.annualizedPremium += Number(item.annualizedPremium) || 0;
    const commission =
      item.commissionLabel === COMMISSION_LABELS.ACTUAL
        ? Number(item.commissionAmount) || 0
        : Number(item.estimatedTakeHome) || 0;
    metrics.estimatedCommission += commission;
  }
  metrics.monthlyPremium = parseMoney(metrics.monthlyPremium) || 0;
  metrics.annualizedPremium = parseMoney(metrics.annualizedPremium) || 0;
  metrics.estimatedCommission = parseMoney(metrics.estimatedCommission) || 0;
  return metrics;
}

module.exports = {
  parseMoney,
  parsePercent,
  calculateAnnualizedPremium,
  calculateEstimatedTakeHome,
  resolveCommissionPresentation,
  emptyDashboardMetrics,
  aggregateDashboardMetrics
};
