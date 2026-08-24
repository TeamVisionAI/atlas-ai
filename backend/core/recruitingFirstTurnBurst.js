/**
 * Recruiting campaign-intake first-turn burst / dedup (BR-147 + BR-155).
 * Combines rapid prospect fragments before the first substantive Atlas reply.
 */

const { looksLikeJobOpportunityQuestion } = require("./recruitAiV2/conversationContinuity");

/** Covers typical WhatsApp double-tap gaps (~7s) without extending on each fragment. */
const RECRUITING_FIRST_TURN_BURST_WAIT_MS = Number(
  process.env.RECRUITING_FIRST_TURN_BURST_WAIT_MS || 10000
);

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function isRecruitingCampaignIntakeFirstTurnBurst({
  campaignIntakeMatch = null,
  hasDeliveredAutomatedOutbound = false
} = {}) {
  if (hasDeliveredAutomatedOutbound) {
    return false;
  }
  const match = campaignIntakeMatch;
  return Boolean(
    match?.matched === true &&
      upper(match.purpose) === "RECRUITING" &&
      match.recruitingEligible === true
  );
}

function looksLikeRecruitingFirstTurnSupplement(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return false;
  }
  if (looksLikeJobOpportunityQuestion(raw)) {
    return true;
  }
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return (
    /\bbusco trabajo\b/.test(t) ||
    /\bbuscando trabajo\b/.test(t) ||
    /\bbusco empleo\b/.test(t) ||
    /\blooking for (a )?job\b/.test(t) ||
    /\blooking for work\b/.test(t)
  );
}

function isAwaitingInitialRecruitingLocation(workflowState = {}) {
  const wf = workflowState && typeof workflowState === "object" ? workflowState : {};
  const lastAsk = String(wf.conversation?.lastQuestionAsked || wf.lastQuestionAsked || "")
    .trim()
    .toLowerCase();
  if (lastAsk === "ask_location") {
    return true;
  }
  const milestone = upper(wf.canonicalMilestone);
  return milestone === "NEW_LEAD" || milestone === "GREETING_SENT";
}

/**
 * Skip a late fragment that would duplicate the first-turn opener + location ask.
 */
function shouldSkipDuplicateRecruitingFirstTurnReply({
  campaignIntakeMatch = null,
  hasDeliveredAutomatedOutbound = false,
  workflowState = null,
  semanticBody = ""
} = {}) {
  if (!hasDeliveredAutomatedOutbound) {
    return false;
  }
  if (!isRecruitingCampaignIntakeFirstTurnBurst({ campaignIntakeMatch })) {
    return false;
  }
  if (!isAwaitingInitialRecruitingLocation(workflowState)) {
    return false;
  }
  return looksLikeRecruitingFirstTurnSupplement(semanticBody);
}

module.exports = {
  RECRUITING_FIRST_TURN_BURST_WAIT_MS,
  isRecruitingCampaignIntakeFirstTurnBurst,
  looksLikeRecruitingFirstTurnSupplement,
  shouldSkipDuplicateRecruitingFirstTurnReply
};
