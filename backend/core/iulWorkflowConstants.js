/**
 * IUL Policy Review V1 — workflow states, outcomes, and follow-up filters.
 * Distinct namespace from recruiting milestones (BR-132 purpose-scoped).
 */

const IUL_STAGES = Object.freeze({
  NEW_IUL_LEAD: "NEW_IUL_LEAD",
  ENGAGED: "ENGAGED",
  REVIEW_QUALIFICATION: "REVIEW_QUALIFICATION",
  REVIEW_READY: "REVIEW_READY",
  REVIEW_SCHEDULED: "REVIEW_SCHEDULED",
  REVIEW_CONFIRMED: "REVIEW_CONFIRMED",
  REVIEW_COMPLETED: "REVIEW_COMPLETED",
  OPPORTUNITY: "OPPORTUNITY",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  ISSUED: "ISSUED",
  NO_ACTION: "NO_ACTION",
  CLOSED_NOT_INTERESTED: "CLOSED_NOT_INTERESTED"
});

const IUL_OUTCOMES = Object.freeze({
  REVIEW_COMPLETED_NO_ACTION: "REVIEW_COMPLETED_NO_ACTION",
  FOLLOW_UP_NEEDED: "FOLLOW_UP_NEEDED",
  OPPORTUNITY_IDENTIFIED: "OPPORTUNITY_IDENTIFIED",
  APPLICATION_SUBMITTED: "APPLICATION_SUBMITTED",
  ISSUED: "ISSUED",
  NOT_INTERESTED: "NOT_INTERESTED"
});

const IUL_FOLLOW_UP_FILTERS = Object.freeze({
  ALL: "all",
  DUE_TODAY: "DUE_TODAY",
  OVERDUE: "OVERDUE",
  THIS_WEEK: "THIS_WEEK",
  WAITING_ON_PROSPECT: "WAITING_ON_PROSPECT",
  REVIEW_SCHEDULED: "REVIEW_SCHEDULED",
  NO_FOLLOW_UP_SET: "NO_FOLLOW_UP_SET"
});

const WHATSAPP_WINDOW_STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED"
});

const RECOMMENDED_FOLLOW_UP_CHANNEL = Object.freeze({
  WHATSAPP_FREEFORM: "WHATSAPP_FREEFORM",
  WHATSAPP_TEMPLATE_REQUIRED: "WHATSAPP_TEMPLATE_REQUIRED",
  PHONE_CALL: "PHONE_CALL"
});

const IUL_REVIEW_MEETING_TYPE = Object.freeze({
  ZOOM: "ZOOM"
});

const IUL_CONVERSATION_GOAL = "policy_review";
const IUL_CAMPAIGN_KIND = "iul_review_ad";

function resolvePurposeValue(input) {
  if (typeof input === "string") {
    return input;
  }
  return input?.purpose || input?.campaignIntakePurpose || null;
}

function isIulReviewPurpose(input) {
  const value = String(resolvePurposeValue(input) || "")
    .trim()
    .toUpperCase();
  return value === "IUL" || value === "IUL_REVIEW";
}

function isIulWorkflowProspect(workflowState = {}, context = {}) {
  if (isIulReviewPurpose(workflowState.campaignIntakePurpose)) {
    return true;
  }
  if (workflowState.iulWorkflowStage) {
    return true;
  }
  if (context.conversationGoal === "policy_review") {
    return true;
  }
  if (context.campaignKind === "iul_review_ad") {
    return true;
  }
  return false;
}

module.exports = {
  IUL_STAGES,
  IUL_OUTCOMES,
  IUL_FOLLOW_UP_FILTERS,
  WHATSAPP_WINDOW_STATUS,
  RECOMMENDED_FOLLOW_UP_CHANNEL,
  IUL_REVIEW_MEETING_TYPE,
  IUL_CONVERSATION_GOAL,
  IUL_CAMPAIGN_KIND,
  isIulReviewPurpose,
  isIulWorkflowProspect
};
