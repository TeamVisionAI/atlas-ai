/**
 * BR-186 — Policy Review Pipeline presentation helpers.
 */

export const POLICY_REVIEW_STAGES = Object.freeze({
  NEW_REVIEW_LEAD: "NEW_REVIEW_LEAD",
  REVIEW_REQUESTED: "REVIEW_REQUESTED",
  QUALIFIED: "QUALIFIED",
  APPOINTMENT_BOOKED: "APPOINTMENT_BOOKED",
  DOCUMENTS_REQUESTED: "DOCUMENTS_REQUESTED",
  DOCUMENTS_RECEIVED: "DOCUMENTS_RECEIVED",
  REVIEW_COMPLETED: "REVIEW_COMPLETED",
  KEEP_CURRENT: "KEEP_CURRENT",
  ADJUST_CURRENT: "ADJUST_CURRENT",
  REPLACEMENT_OPPORTUNITY: "REPLACEMENT_OPPORTUNITY",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  PLACED: "PLACED",
  NOT_PROCEEDING: "NOT_PROCEEDING"
});

export const POLICY_REVIEW_OUTCOMES = Object.freeze({
  KEEP_CURRENT: "KEEP_CURRENT",
  ADJUST_CURRENT: "ADJUST_CURRENT",
  REPLACEMENT_OPPORTUNITY: "REPLACEMENT_OPPORTUNITY",
  NOT_PROCEEDING: "NOT_PROCEEDING"
});

export function emptyPolicyReviewForm(overrides = {}) {
  return {
    clientId: "",
    stage: POLICY_REVIEW_STAGES.NEW_REVIEW_LEAD,
    language: "",
    state: "",
    source: "",
    campaign: "",
    campaignIntakeCode: "",
    appointmentId: "",
    title: "",
    instructions: "",
    dueDate: "",
    dueTime: "",
    notes: "",
    outcome: "",
    carrierProductLabel: "",
    monthlyPremium: "",
    annualizedPremium: "",
    commissionLevelPct: "",
    paidAdvanceFactorPct: "",
    submissionDate: "",
    placedDate: "",
    ...overrides
  };
}

export function buildPolicyReviewStageLabel(stage, translate) {
  const key = {
    NEW_REVIEW_LEAD: "policyReviewStageNewLead",
    REVIEW_REQUESTED: "policyReviewStageRequested",
    QUALIFIED: "policyReviewStageQualified",
    APPOINTMENT_BOOKED: "policyReviewStageAppointment",
    DOCUMENTS_REQUESTED: "policyReviewStageDocsRequested",
    DOCUMENTS_RECEIVED: "policyReviewStageDocsReceived",
    REVIEW_COMPLETED: "policyReviewStageCompleted",
    KEEP_CURRENT: "policyReviewOutcomeKeep",
    ADJUST_CURRENT: "policyReviewOutcomeAdjust",
    REPLACEMENT_OPPORTUNITY: "policyReviewOutcomeReplacement",
    APPLICATION_SUBMITTED: "policyReviewStageApplication",
    PLACED: "policyReviewStagePlaced",
    NOT_PROCEEDING: "policyReviewOutcomeNotProceeding"
  }[stage];
  return key ? translate(key) : stage;
}

export function buildPolicyReviewSourceLabel(item, translate) {
  return (
    item?.sourceLabel ||
    item?.acquisition?.sourceLabel ||
    item?.campaignName ||
    item?.campaign ||
    item?.campaignIntakeCode ||
    item?.source ||
    translate("policyReviewNoAttribution")
  );
}

export function formatPolicyReviewTouch(touch) {
  if (!touch || (!touch.at && !touch.sourceLabel && !touch.campaignLabel && !touch.intakeCode)) {
    return null;
  }
  return {
    at: touch.at || null,
    source: touch.sourceLabel || touch.platformLabel || touch.platform || null,
    campaign: touch.campaignLabel || touch.campaignName || touch.campaignId || null,
    ad: touch.adLabel || touch.adName || touch.adId || null,
    creative: touch.creativeLabel || touch.creativeName || touch.creativeId || null,
    intakeCode: touch.intakeCode || null,
    utmSource: touch.utmSource || null
  };
}

export function formatPolicyReviewMoney(value, locale) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(number);
}

export const POLICY_REVIEW_VIEWS = Object.freeze({
  DASHBOARD: "dashboard",
  PIPELINE: "pipeline"
});

export const POLICY_REVIEW_DATE_PRESETS = Object.freeze([
  ["today", "policyReviewRangeToday"],
  ["7d", "policyReviewRange7d"],
  ["30d", "policyReviewRange30d"],
  ["this_month", "policyReviewRangeThisMonth"],
  ["last_month", "policyReviewRangeLastMonth"],
  ["custom", "policyReviewRangeCustom"],
  ["all", "policyReviewRangeAll"]
]);

export const POLICY_REVIEW_FUNNEL_STAGES = Object.freeze([
  "NEW_REVIEW_LEAD",
  "QUALIFIED",
  "APPOINTMENT_BOOKED",
  "REVIEW_COMPLETED",
  "REPLACEMENT_OPPORTUNITY",
  "APPLICATION_SUBMITTED",
  "PLACED"
]);

export const POLICY_REVIEW_ATTRIBUTION_GROUPS = Object.freeze([
  ["campaign", "policyReviewGroupCampaign"],
  ["platform", "policyReviewGroupPlatform"],
  ["ad", "policyReviewGroupAd"],
  ["creative", "policyReviewGroupCreative"],
  ["intakeCode", "policyReviewGroupIntakeCode"],
  ["owner", "policyReviewGroupOwner"],
  ["language", "policyReviewGroupLanguage"],
  ["state", "policyReviewGroupState"]
]);

export const POLICY_REVIEW_DASHBOARD_KPIS = Object.freeze([
  ["newReviewLeads", "policyReviewMetricNewLeads", false],
  ["qualified", "policyReviewMetricQualified", false],
  ["appointmentsBooked", "policyReviewMetricAppointments", false],
  ["reviewsCompleted", "policyReviewMetricReviewsCompleted", false],
  ["replacementOpportunities", "policyReviewMetricReplacement", false],
  ["applicationsSubmitted", "policyReviewMetricApplications", false],
  ["placed", "policyReviewMetricPlaced", false],
  ["monthlyPremium", "policyReviewMetricMonthly", true],
  ["annualizedPremium", "policyReviewMetricAnnualized", true],
  ["estimatedCommission", "policyReviewMetricCommission", true]
]);

export const POLICY_REVIEW_NEEDS_ACTION = Object.freeze([
  ["newLeadsUnworked", "policyReviewNeedsNewLeads"],
  ["qualifiedWithoutAppointment", "policyReviewNeedsQualified"],
  ["appointmentsUpcoming", "policyReviewNeedsAppointments"],
  ["documentsRequested", "policyReviewNeedsDocuments"],
  ["reviewsAwaitingOutcome", "policyReviewNeedsOutcome"],
  ["replacementWithoutApplication", "policyReviewNeedsApplication"],
  ["applicationsUnplaced", "policyReviewNeedsPlaced"]
]);

export function formatPolicyReviewConversion(value) {
  if (value === undefined || value === null || value === "") return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number}%`;
}

export function kpiStageFilter(kpiKey) {
  return (
    {
      qualified: POLICY_REVIEW_STAGES.QUALIFIED,
      appointmentsBooked: POLICY_REVIEW_STAGES.APPOINTMENT_BOOKED,
      reviewsCompleted: POLICY_REVIEW_STAGES.REVIEW_COMPLETED,
      replacementOpportunities: POLICY_REVIEW_STAGES.REPLACEMENT_OPPORTUNITY,
      applicationsSubmitted: POLICY_REVIEW_STAGES.APPLICATION_SUBMITTED,
      placed: POLICY_REVIEW_STAGES.PLACED
    }[kpiKey] || ""
  );
}

export function attributionRowFilters(groupBy, key) {
  if (!key || key === "unknown") return {};
  switch (groupBy) {
    case "platform":
      return { platform: key };
    case "campaign":
      return { campaign: key };
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
