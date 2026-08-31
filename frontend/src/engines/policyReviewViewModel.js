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
