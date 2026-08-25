/**
 * BR-156 — Detect Meta unsupported lead-candidate webhooks (error 131060).
 * Does not grant eligibility; operational review only.
 */

const {
  hasPositiveCtwaReferral,
  resolveAtlasInboundAutomationEligibility
} = require("../atlasInboundAutomationEligibility");
const {
  META_UNSUPPORTED_LEAD_ERROR_CODE,
  ORGANIZATION_CONNECTION_SOURCE
} = require("./constants");

function extractMetaMessageErrors(rawMessage) {
  const errors = Array.isArray(rawMessage?.errors) ? rawMessage.errors : [];
  return errors.map((entry) => ({
    code: entry?.code != null ? Number(entry.code) : null,
    title: entry?.title ? String(entry.title) : entry?.message ? String(entry.message) : null
  }));
}

function hasMetaErrorCode(rawMessage, code) {
  return extractMetaMessageErrors(rawMessage).some((entry) => entry.code === code);
}

function isUnsupportedMetaLeadCandidateShape({
  inbound,
  organizationSource,
  campaignIntakeMatch = null
} = {}) {
  if (organizationSource !== ORGANIZATION_CONNECTION_SOURCE) {
    return false;
  }

  if (String(inbound?.messageType || "").toLowerCase() !== "unsupported") {
    return false;
  }

  if (!hasMetaErrorCode(inbound?.rawMessage, META_UNSUPPORTED_LEAD_ERROR_CODE)) {
    return false;
  }

  if (hasPositiveCtwaReferral(inbound?.ctwaReferral || inbound?.referral)) {
    return false;
  }

  if (campaignIntakeMatch?.matched === true) {
    return false;
  }

  return true;
}

async function shouldCreateUnsupportedInboundReview({
  inbound,
  organizationSource,
  campaignIntakeMatch = null,
  prospect = null,
  qrAttributed = false,
  qrTouch = null,
  workflowState = null,
  dependencies = {}
} = {}) {
  if (
    !isUnsupportedMetaLeadCandidateShape({
      inbound,
      organizationSource,
      campaignIntakeMatch
    })
  ) {
    return { create: false, reason: "NOT_CANDIDATE" };
  }

  const resolveEligibility =
    dependencies.resolveAtlasInboundAutomationEligibility ||
    resolveAtlasInboundAutomationEligibility;

  const eligibility = await resolveEligibility({
    prospect,
    inbound,
    qrAttributed,
    qrTouch,
    workflowState
  });

  if (eligibility.eligible) {
    return { create: false, reason: "ALREADY_ELIGIBLE" };
  }

  return { create: true, reason: "UNSUPPORTED_META_LEAD_CANDIDATE" };
}

module.exports = {
  extractMetaMessageErrors,
  hasMetaErrorCode,
  isUnsupportedMetaLeadCandidateShape,
  shouldCreateUnsupportedInboundReview
};
