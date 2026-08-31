/**
 * BR-189 — IUL / Policy Review operational dashboard read model.
 * Composes BR-186 pipeline rows and BR-188 acquisition metrics.
 * Does not invent spend, commission math, or a second revenue SoT.
 */

const {
  getOrganizationDateWindow,
  isTimestampInWindow,
  loadOrganizationTimezone,
  partsInZone,
  zonedTimeToUtcMs,
  RELATIVE_PERIODS,
  ATLAS_DEFAULT_TIMEZONE
} = require("./organizationDateWindow");
const { emptyAcquisitionMetrics } = require("./policyReviewAttribution");
const { POLICY_REVIEW_STAGES } = require("./policyReviewPipeline/constants");

const DASHBOARD_DATE_PRESETS = Object.freeze([
  "today",
  "7d",
  "30d",
  "this_month",
  "last_month",
  "custom",
  "all"
]);

const FUNNEL_STAGES = Object.freeze([
  POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD,
  POLICY_REVIEW_STAGES.QUALIFIED,
  POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
  POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
  POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY,
  POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED,
  POLICY_REVIEW_STAGES.PLACED
]);

const NEEDS_ACTION_KEYS = Object.freeze([
  "newLeadsUnworked",
  "qualifiedWithoutAppointment",
  "appointmentsUpcoming",
  "documentsRequested",
  "reviewsAwaitingOutcome",
  "replacementWithoutApplication",
  "applicationsUnplaced"
]);

function pad2(value) {
  return String(value).padStart(2, "0");
}

function localDateKey(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function addLocalDays(year, month, day, deltaDays) {
  const utcNoon = Date.UTC(year, month - 1, day, 12, 0, 0, 0);
  const shifted = new Date(utcNoon + deltaDays * 24 * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function parseLocalDate(value) {
  const match = String(value || "").trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function buildInclusiveWindow(start, end, timeZone, source, preset) {
  const utcStartMs = zonedTimeToUtcMs(start.year, start.month, start.day, 0, 0, 0, 0, timeZone);
  const utcEndMs = zonedTimeToUtcMs(end.year, end.month, end.day, 23, 59, 59, 999, timeZone);
  return {
    preset,
    from: localDateKey(start.year, start.month, start.day),
    to: localDateKey(end.year, end.month, end.day),
    timezone: timeZone,
    window: {
      timeZone,
      source,
      utcStart: new Date(utcStartMs).toISOString(),
      utcEnd: new Date(utcEndMs).toISOString(),
      utcStartMs,
      utcEndMs
    }
  };
}

function emptyDateRange(timezone = ATLAS_DEFAULT_TIMEZONE) {
  return {
    preset: "all",
    from: null,
    to: null,
    timezone,
    window: null
  };
}

function resolveDashboardDateRange({
  organizationId,
  range,
  from,
  to,
  reference = new Date(),
  timezoneDeps = {}
} = {}) {
  const resolved = loadOrganizationTimezone(organizationId, timezoneDeps);
  const timeZone = resolved.timeZone || ATLAS_DEFAULT_TIMEZONE;
  const preset = String(range || (from || to ? "custom" : "all")).toLowerCase();
  if (!DASHBOARD_DATE_PRESETS.includes(preset) || preset === "all") {
    return emptyDateRange(timeZone);
  }

  if (preset === "today") {
    const window = getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.TODAY,
      reference,
      timeZoneResolution: resolved
    });
    return {
      preset,
      from: String(window.localStart || "").slice(0, 10),
      to: String(window.localEnd || "").slice(0, 10),
      timezone: timeZone,
      window
    };
  }
  if (preset === "this_month") {
    const window = getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.CURRENT_MONTH,
      reference,
      timeZoneResolution: resolved
    });
    return {
      preset,
      from: String(window.localStart || "").slice(0, 10),
      to: String(window.localEnd || "").slice(0, 10),
      timezone: timeZone,
      window
    };
  }
  if (preset === "last_month") {
    const window = getOrganizationDateWindow({
      organizationId,
      relativePeriod: RELATIVE_PERIODS.PREVIOUS_MONTH,
      reference,
      timeZoneResolution: resolved
    });
    return {
      preset,
      from: String(window.localStart || "").slice(0, 10),
      to: String(window.localEnd || "").slice(0, 10),
      timezone: timeZone,
      window
    };
  }

  const refMs = reference instanceof Date ? reference.getTime() : Date.parse(reference);
  const localNow = partsInZone(Number.isFinite(refMs) ? refMs : Date.now(), timeZone);

  if (preset === "7d" || preset === "30d") {
    const span = preset === "7d" ? 6 : 29;
    const start = addLocalDays(localNow.year, localNow.month, localNow.day, -span);
    return buildInclusiveWindow(start, localNow, timeZone, resolved.source, preset);
  }

  const start = parseLocalDate(from) || localNow;
  const end = parseLocalDate(to) || start;
  const ordered =
    Date.UTC(start.year, start.month - 1, start.day) <= Date.UTC(end.year, end.month - 1, end.day)
      ? { start, end }
      : { start: end, end: start };
  return buildInclusiveWindow(ordered.start, ordered.end, timeZone, resolved.source, "custom");
}

function itemInDateRange(item, dateRange) {
  if (!dateRange?.window) return true;
  return isTimestampInWindow(item?.createdAt, dateRange.window);
}

function conversionPct(current, previous) {
  if (!previous) return null;
  return Math.round((Number(current) / Number(previous)) * 1000) / 10;
}

function buildFunnel(totals = emptyAcquisitionMetrics()) {
  const counts = {
    [POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD]: Number(totals.reviewLeads) || 0,
    [POLICY_REVIEW_STAGES.QUALIFIED]: Number(totals.qualifiedReviews) || 0,
    [POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED]: Number(totals.appointmentsBooked) || 0,
    [POLICY_REVIEW_STAGES.REVIEW_COMPLETED]: Number(totals.reviewsCompleted) || 0,
    [POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY]: Number(totals.replacementOpportunities) || 0,
    [POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED]: Number(totals.applicationsSubmitted) || 0,
    [POLICY_REVIEW_STAGES.PLACED]: Number(totals.placedPolicies) || 0
  };
  return FUNNEL_STAGES.map((stage, index) => {
    const previousStage = index === 0 ? null : FUNNEL_STAGES[index - 1];
    const count = counts[stage];
    const previousCount = previousStage ? counts[previousStage] : null;
    return {
      stage,
      count,
      previousStage,
      conversionFromPrevious: previousStage == null ? null : conversionPct(count, previousCount)
    };
  });
}

function emptyNeedsAction() {
  return Object.fromEntries(NEEDS_ACTION_KEYS.map((key) => [key, 0]));
}

function classifyNeedsAction(items = []) {
  const counts = emptyNeedsAction();
  for (const item of items) {
    const stage = item?.stage;
    if (stage === POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD || stage === POLICY_REVIEW_STAGES.REVIEW_REQUESTED) {
      counts.newLeadsUnworked += 1;
    }
    if (stage === POLICY_REVIEW_STAGES.QUALIFIED && !item.appointmentId) {
      counts.qualifiedWithoutAppointment += 1;
    }
    if (stage === POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED) {
      counts.appointmentsUpcoming += 1;
    }
    if (stage === POLICY_REVIEW_STAGES.DOCUMENTS_REQUESTED) {
      counts.documentsRequested += 1;
    }
    if (stage === POLICY_REVIEW_STAGES.REVIEW_COMPLETED) {
      counts.reviewsAwaitingOutcome += 1;
    }
    if (stage === POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY) {
      counts.replacementWithoutApplication += 1;
    }
    if (stage === POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED) {
      counts.applicationsUnplaced += 1;
    }
  }
  return counts;
}

function buildNeedsActionRows(counts = emptyNeedsAction()) {
  return [
    {
      key: "newLeadsUnworked",
      count: counts.newLeadsUnworked,
      stage: POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD,
      href: "/app/policy-reviews?view=pipeline&stage=NEW_REVIEW_LEAD"
    },
    {
      key: "qualifiedWithoutAppointment",
      count: counts.qualifiedWithoutAppointment,
      stage: POLICY_REVIEW_STAGES.QUALIFIED,
      href: "/app/policy-reviews?view=pipeline&stage=QUALIFIED"
    },
    {
      key: "appointmentsUpcoming",
      count: counts.appointmentsUpcoming,
      stage: POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
      href: "/app/policy-reviews?view=pipeline&stage=APPOINTMENT_BOOKED",
      relatedHref: "/app/appointments"
    },
    {
      key: "documentsRequested",
      count: counts.documentsRequested,
      stage: POLICY_REVIEW_STAGES.DOCUMENTS_REQUESTED,
      href: "/app/policy-reviews?view=pipeline&stage=DOCUMENTS_REQUESTED",
      relatedHref: "/app/today?filter=documents"
    },
    {
      key: "reviewsAwaitingOutcome",
      count: counts.reviewsAwaitingOutcome,
      stage: POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
      href: "/app/policy-reviews?view=pipeline&stage=REVIEW_COMPLETED"
    },
    {
      key: "replacementWithoutApplication",
      count: counts.replacementWithoutApplication,
      stage: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY,
      href: "/app/policy-reviews?view=pipeline&stage=REPLACEMENT_OPPORTUNITY"
    },
    {
      key: "applicationsUnplaced",
      count: counts.applicationsUnplaced,
      stage: POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED,
      href: "/app/policy-reviews?view=pipeline&stage=APPLICATION_SUBMITTED"
    }
  ];
}

function buildDashboardKpis(totals = emptyAcquisitionMetrics()) {
  return {
    newReviewLeads: Number(totals.reviewLeads) || 0,
    qualified: Number(totals.qualifiedReviews) || 0,
    appointmentsBooked: Number(totals.appointmentsBooked) || 0,
    reviewsCompleted: Number(totals.reviewsCompleted) || 0,
    replacementOpportunities: Number(totals.replacementOpportunities) || 0,
    applicationsSubmitted: Number(totals.applicationsSubmitted) || 0,
    placed: Number(totals.placedPolicies) || 0,
    monthlyPremium: Number(totals.monthlyPremium) || 0,
    annualizedPremium: Number(totals.annualizedPremium) || 0,
    estimatedCommission: Number(totals.estimatedCommission) || 0,
    adSpend: null,
    costPerLead: null,
    roas: null
  };
}

function emptyPolicyReviewDashboard() {
  const totals = emptyAcquisitionMetrics();
  return {
    generatedAt: new Date().toISOString(),
    controlPlane: false,
    organizationId: null,
    scope: "mine",
    teamAvailable: false,
    range: emptyDateRange(),
    groupBy: "campaign",
    kpis: buildDashboardKpis(totals),
    funnel: buildFunnel(totals),
    attribution: {
      groupBy: "campaign",
      totals,
      groups: []
    },
    needsAction: buildNeedsActionRows(emptyNeedsAction())
  };
}

function kpiDrilldownFilter(kpiKey) {
  switch (kpiKey) {
    case "qualified":
      return { stage: POLICY_REVIEW_STAGES.QUALIFIED };
    case "appointmentsBooked":
      return { stage: POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED };
    case "reviewsCompleted":
      return { stage: POLICY_REVIEW_STAGES.REVIEW_COMPLETED };
    case "replacementOpportunities":
      return { stage: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY };
    case "applicationsSubmitted":
      return { stage: POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED };
    case "placed":
      return { stage: POLICY_REVIEW_STAGES.PLACED };
    default:
      return {};
  }
}

function attributionDrilldownFilter(groupBy, key) {
  if (!key || key === "unknown") return {};
  switch (groupBy) {
    case "platform":
      return { platform: key };
    case "campaign":
      return { campaign: key };
    case "ad":
      return { source: key };
    case "creative":
      return { source: key };
    case "intakeCode":
      return { intakeCode: key };
    case "owner":
      return { ownerUserId: key };
    case "language":
      return { language: key };
    case "state":
      return { state: key };
    default:
      return {};
  }
}

module.exports = {
  DASHBOARD_DATE_PRESETS,
  FUNNEL_STAGES,
  NEEDS_ACTION_KEYS,
  resolveDashboardDateRange,
  itemInDateRange,
  conversionPct,
  buildFunnel,
  classifyNeedsAction,
  buildNeedsActionRows,
  buildDashboardKpis,
  emptyPolicyReviewDashboard,
  emptyNeedsAction,
  kpiDrilldownFilter,
  attributionDrilldownFilter
};
