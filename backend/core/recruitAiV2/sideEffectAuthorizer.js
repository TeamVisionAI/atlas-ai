/**
 * Recruit AI v2 — SideEffectAuthorizer.
 * This sprint: always deny execution. Decisions remain auditable.
 * Implements BR-081.
 */

const { FEATURE_FLAGS, REASON_CODES } = require("./constants");

function isExecutionEnabled(env = process.env) {
  return String(env[FEATURE_FLAGS.EXECUTION_ENABLED_ENV] || "").toLowerCase() === "true";
}

function isShadowEnabled(env = process.env) {
  const primary = String(env[FEATURE_FLAGS.SHADOW_ENABLED_ENV] || "").toLowerCase();
  if (primary === "true") {
    return true;
  }
  if (primary === "false") {
    return false;
  }
  return String(env[FEATURE_FLAGS.SHADOW_ENABLED_LEGACY_ENV] || "").toLowerCase() === "true";
}

/**
 * Authorize proposed side effects. Returns proposals + hard deny in this sprint.
 */
function authorizeSideEffects({
  structuredDecision,
  responsePlan,
  env = process.env
} = {}) {
  const executionEnabled = isExecutionEnabled(env);
  const proposals = [];

  const nextAction = structuredDecision?.decision?.nextAction || null;
  const intent = structuredDecision?.intent || null;

  if (nextAction === "create_appointment") {
    proposals.push({
      type: "create_appointment",
      status: "proposed",
      authorized: false,
      reason: REASON_CODES.SIDE_EFFECTS_DISABLED
    });
  }

  // BR-085 — cancel/withdraw proposals remain auditable and denied.
  if (
    nextAction === "acknowledge_cancel_no_write" ||
    intent === "cancel_request" ||
    (intent === "withdraw_interest" &&
      structuredDecision?.entities?.cancellationKind === "withdraw_and_cancel")
  ) {
    proposals.push({
      type: "cancel_appointment",
      status: "proposed",
      authorized: false,
      reason: REASON_CODES.SIDE_EFFECTS_DISABLED
    });
  }

  if (
    nextAction === "acknowledge_withdraw_no_write" ||
    intent === "withdraw_interest"
  ) {
    proposals.push({
      type: "withdraw_prospect",
      status: "proposed",
      authorized: false,
      reason: REASON_CODES.SIDE_EFFECTS_DISABLED
    });
  }

  if (
    nextAction === "acknowledge_opt_out_no_write" ||
    intent === "opt_out_request"
  ) {
    proposals.push({
      type: "communication_opt_out",
      status: "proposed",
      authorized: false,
      reason: REASON_CODES.SIDE_EFFECTS_DISABLED
    });
  }

  if (structuredDecision?.decision?.shouldEscalate) {
    proposals.push({
      type: "mark_human_attention",
      status: "proposed",
      authorized: false,
      reason: REASON_CODES.SIDE_EFFECTS_DISABLED
    });
  }

  if (responsePlan?.templateKey) {
    proposals.push({
      type: "send_whatsapp_reply",
      status: "proposed",
      authorized: false,
      reason: REASON_CODES.SIDE_EFFECTS_DISABLED
    });
  }

  // Hard gate: even if env is flipped accidentally in this sprint's callers,
  // callers must still pass an explicit allowExecution override (never set here).
  const authorized = false;

  return {
    executionEnabled,
    shadowEnabled: isShadowEnabled(env),
    authorized,
    proposals,
    denyReasons: [REASON_CODES.SIDE_EFFECTS_DISABLED],
    note:
      "Recruit AI v2 side effects are disabled for this sprint. Decisions and copy are auditable only."
  };
}

module.exports = {
  authorizeSideEffects,
  isExecutionEnabled,
  isShadowEnabled
};
