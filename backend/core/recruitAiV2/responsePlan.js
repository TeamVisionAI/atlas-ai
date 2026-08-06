/**
 * Recruit AI v2 — response plan from StructuredDecision.
 * Separates planning from rendered copy and from execution.
 */

const { NEXT_ACTIONS, LANGUAGES } = require("./constants");

function buildResponsePlan(structuredDecision) {
  const decision = structuredDecision?.decision || {};
  const replyPlan = structuredDecision?.customerReplyPlan || {};
  const language = replyPlan.language || structuredDecision?.preferredLanguage || LANGUAGES.ENGLISH;

  return {
    language,
    templateKey: replyPlan.templateKey || null,
    acknowledgeRequest: Boolean(replyPlan.acknowledgeRequest),
    forbidInternalDiagnostics: replyPlan.forbidInternalDiagnostics !== false,
    nextAction: decision.nextAction || NEXT_ACTIONS.NOOP,
    shouldEscalate: Boolean(decision.shouldEscalate),
    mayCreateAppointment: false,
    maySendOutbound: false,
    reasonCodes: [...(structuredDecision?.reasonCodes || [])],
    entities: {
      ...(structuredDecision?.entities || {}),
      ...(structuredDecision?.customerReplyPlan?.entities || {})
    },
    offeredSlots: structuredDecision?.context?.previouslyOfferedSlots || [],
    alternatives: structuredDecision?.availability?.nearestAlternatives || []
  };
}

module.exports = {
  buildResponsePlan
};
