/**
 * Recruiting campaign-intake first-turn burst / dedup (BR-147 + BR-155 + BR-229).
 * Combines rapid prospect fragments before the first substantive Atlas reply.
 */

const {
  looksLikeJobOpportunityQuestion,
  looksLikeSpanishInfoRequest,
  looksLikeEnglishInfoRequest
} = require("./recruitAiV2/conversationContinuity");

/** Covers typical WhatsApp double-tap gaps (~7s) without extending on each fragment. */
const RECRUITING_FIRST_TURN_BURST_WAIT_MS = Number(
  process.env.RECRUITING_FIRST_TURN_BURST_WAIT_MS || 10000
);

/** In-flight first-turn replies keyed by org::phone — BR-229 race guard. */
const firstTurnInFlight = new Map();

function upper(value) {
  return String(value || "").trim().toUpperCase();
}

function firstTurnInFlightKey(phone, organizationId) {
  return `${String(organizationId || "").trim()}::${String(phone || "").trim()}`;
}

function markRecruitingFirstTurnInFlight(phone, organizationId) {
  const key = firstTurnInFlightKey(phone, organizationId);
  if (!key.endsWith("::") && key !== "::") {
    firstTurnInFlight.set(key, Date.now());
  }
  return key;
}

function clearRecruitingFirstTurnInFlight(phone, organizationId) {
  firstTurnInFlight.delete(firstTurnInFlightKey(phone, organizationId));
}

function isRecruitingFirstTurnInFlight(phone, organizationId) {
  return firstTurnInFlight.has(firstTurnInFlightKey(phone, organizationId));
}

function resetRecruitingFirstTurnInFlightForTests() {
  firstTurnInFlight.clear();
}

function isCtwaRecruitingFirstTurn({
  atlasEligibilitySource = null,
  ctwaReferral = null,
  workflowState = null
} = {}) {
  const source = upper(
    atlasEligibilitySource || workflowState?.atlasEligibilitySource
  );
  if (source === "CTWA_REFERRAL" || source === "META_AD_DESTINATION") {
    return true;
  }
  return Boolean(ctwaReferral || workflowState?.ctwaReferral || workflowState?.ctwa_clid);
}

function isRecruitingCampaignIntakeFirstTurnBurst({
  campaignIntakeMatch = null,
  hasDeliveredAutomatedOutbound = false,
  atlasEligibilitySource = null,
  ctwaReferral = null,
  workflowState = null
} = {}) {
  if (hasDeliveredAutomatedOutbound) {
    return false;
  }
  const match = campaignIntakeMatch;
  if (
    match?.matched === true &&
    upper(match.purpose) === "RECRUITING" &&
    match.recruitingEligible === true
  ) {
    return true;
  }
  // Implements BR-229 — CTWA ad first turns need the same burst window as
  // campaign-code intake. Referral metadata is usually only on message 1.
  return isCtwaRecruitingFirstTurn({
    atlasEligibilitySource,
    ctwaReferral,
    workflowState
  });
}

function looksLikeRecruitingFirstTurnSupplement(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return false;
  }
  if (looksLikeJobOpportunityQuestion(raw)) {
    return true;
  }
  if (looksLikeSpanishInfoRequest(raw) || looksLikeEnglishInfoRequest(raw)) {
    return true;
  }
  const t = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    /\bme interesa\b/.test(t) ||
    /\bbusc[ao] (de )?trabajo\b/.test(t) ||
    /\bbuscando (de )?trabajo\b/.test(t) ||
    /\bbusco empleo\b/.test(t) ||
    /\blooking for (a )?job\b/.test(t) ||
    /\blooking for work\b/.test(t) ||
    /\b(hola|hi|hello)\b/.test(t) && /\b(trabajo|job|empleo|oportunidad|info)\b/.test(t)
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

function isRecruitingFirstTurnContext({
  campaignIntakeMatch = null,
  atlasEligibilitySource = null,
  ctwaReferral = null,
  workflowState = null
} = {}) {
  const match = campaignIntakeMatch;
  if (
    match?.matched === true &&
    upper(match.purpose) === "RECRUITING" &&
    match.recruitingEligible !== false
  ) {
    return true;
  }
  return isCtwaRecruitingFirstTurn({
    atlasEligibilitySource,
    ctwaReferral,
    workflowState
  });
}

/**
 * Skip a late fragment that would duplicate the first-turn opener + location ask.
 * Implements BR-229 — do not require a campaign code on the late fragment.
 */
function shouldSkipDuplicateRecruitingFirstTurnReply({
  campaignIntakeMatch = null,
  hasDeliveredAutomatedOutbound = false,
  workflowState = null,
  semanticBody = "",
  atlasEligibilitySource = null,
  ctwaReferral = null,
  firstTurnInFlight = false
} = {}) {
  if (!hasDeliveredAutomatedOutbound && !firstTurnInFlight) {
    return false;
  }
  if (!isAwaitingInitialRecruitingLocation(workflowState)) {
    return false;
  }
  if (
    !isRecruitingFirstTurnContext({
      campaignIntakeMatch,
      atlasEligibilitySource,
      ctwaReferral,
      workflowState
    })
  ) {
    return false;
  }
  return looksLikeRecruitingFirstTurnSupplement(semanticBody);
}

module.exports = {
  RECRUITING_FIRST_TURN_BURST_WAIT_MS,
  isRecruitingCampaignIntakeFirstTurnBurst,
  looksLikeRecruitingFirstTurnSupplement,
  shouldSkipDuplicateRecruitingFirstTurnReply,
  markRecruitingFirstTurnInFlight,
  clearRecruitingFirstTurnInFlight,
  isRecruitingFirstTurnInFlight,
  resetRecruitingFirstTurnInFlightForTests,
  isCtwaRecruitingFirstTurn
};
