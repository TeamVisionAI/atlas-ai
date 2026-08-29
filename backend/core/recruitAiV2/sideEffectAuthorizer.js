/**
 * Recruit AI v2 — SideEffectAuthorizer (BR-111).
 *
 * Fail-closed server-side gate immediately before mutation.
 * Decision intent (nextAction / mayCreateAppointment) never grants permission.
 *
 * Authorization requires ALL of:
 * 1. RECRUIT_AI_V2_EXECUTION_ENABLED === "true"
 * 2. organizationId in RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS
 * 3. actingUserId in RECRUIT_AI_V2_EXECUTION_USER_IDS
 * 4. profileConfigured === true
 * 5. requested action is an explicitly supported v2 executable action
 *
 * Role / being RVP never authorizes. Tenant allowlist alone never authorizes.
 */

const { FEATURE_FLAGS, REASON_CODES, V2_EXECUTABLE_ACTIONS } = require("./constants");
const {
  resolveExecutionConfig,
  isEligibleForExecution,
  isExecutionFlagEnabled
} = require("./executionConfig");

function isExecutionEnabled(env = process.env) {
  return isExecutionFlagEnabled(env);
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

function resolveActingUserId({ context, options } = {}) {
  return (
    options?.actingUserId ||
    options?.agentId ||
    options?.userId ||
    context?.agentId ||
    context?.prospectOwnerUserId ||
    context?.ownerUserId ||
    context?.identity?.ownerUserId ||
    null
  );
}

function resolveOrganizationId({ structuredDecision, context, options } = {}) {
  return (
    options?.organizationId ||
    context?.organizationId ||
    structuredDecision?.organizationId ||
    null
  );
}

function collectProposedMutationTypes(structuredDecision, responsePlan) {
  const types = [];
  const nextAction = structuredDecision?.decision?.nextAction || null;
  const intent = structuredDecision?.intent || null;
  const kind = structuredDecision?.entities?.cancellationKind || null;
  const alsoCancel = Boolean(structuredDecision?.entities?.alsoCancelAppointment);
  const alsoWithdraw = Boolean(structuredDecision?.entities?.alsoWithdraw);

  if (nextAction === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT) {
    types.push(V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT);
  }

  if (
    nextAction === "acknowledge_cancel_no_write" ||
    intent === "cancel_request" ||
    alsoCancel ||
    kind === "cancel_and_opt_out" ||
    (intent === "withdraw_interest" && kind === "withdraw_and_cancel")
  ) {
    types.push("cancel_appointment");
  }

  if (
    nextAction === "acknowledge_withdraw_no_write" ||
    intent === "withdraw_interest" ||
    alsoWithdraw
  ) {
    types.push("withdraw_prospect");
  }

  if (
    nextAction === "acknowledge_opt_out_no_write" ||
    intent === "opt_out_request" ||
    kind === "opt_out" ||
    kind === "cancel_and_opt_out"
  ) {
    types.push("communication_opt_out");
  }

  if (
    nextAction === "acknowledge_meeting_access" ||
    intent === "meeting_access_request"
  ) {
    types.push("share_zoom_link");
  }

  if (structuredDecision?.decision?.shouldEscalate) {
    types.push("mark_human_attention");
  }

  if (responsePlan?.templateKey) {
    types.push("send_whatsapp_reply");
  }

  return [...new Set(types)];
}

function isSupportedExecutableAction(type) {
  return type === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT;
}

/**
 * Authorize proposed side effects. Never infers permission from nextAction alone.
 */
function authorizeSideEffects({
  structuredDecision,
  responsePlan,
  context = null,
  env = process.env,
  profileConfigured = false,
  actingUserId = null,
  organizationId = null,
  options = {}
} = {}) {
  const executionEnabled = isExecutionEnabled(env);
  const config = resolveExecutionConfig(env);
  const orgId = organizationId || resolveOrganizationId({ structuredDecision, context, options });
  const userId =
    actingUserId || resolveActingUserId({ context, options });

  const proposedTypes = collectProposedMutationTypes(structuredDecision, responsePlan);
  const denyReasons = [];
  const proposals = [];

  const eligibility = isEligibleForExecution({
    organizationId: orgId,
    actingUserId: userId,
    env,
    grant: options.v2Grant || options.grant || null
  });

  if (!executionEnabled || config.failClosed) {
    denyReasons.push(
      config.failClosedReason === "MALFORMED_EXECUTION_ENABLED"
        ? REASON_CODES.EXECUTION_DENIED
        : REASON_CODES.SIDE_EFFECTS_DISABLED
    );
  } else if (!eligibility.eligible) {
    if (eligibility.reason === "ORG_ALLOWLIST_EMPTY" || eligibility.reason === "ORG_NOT_ALLOWLISTED") {
      denyReasons.push(REASON_CODES.EXECUTION_ORG_NOT_ALLOWLISTED);
    } else if (
      eligibility.reason === "USER_ALLOWLIST_EMPTY" ||
      eligibility.reason === "USER_NOT_ALLOWLISTED"
    ) {
      denyReasons.push(REASON_CODES.EXECUTION_USER_NOT_ALLOWLISTED);
    } else {
      denyReasons.push(REASON_CODES.EXECUTION_DENIED);
    }
  }

  if (profileConfigured !== true) {
    denyReasons.push(REASON_CODES.EXECUTION_PROFILE_NOT_CONFIGURED);
  }

  // mayCreateAppointment / nextAction are proposal signals only — never permission.
  const decisionProposesCreate =
    structuredDecision?.decision?.nextAction === V2_EXECUTABLE_ACTIONS.CREATE_APPOINTMENT;
  const decisionMayCreate = structuredDecision?.decision?.mayCreateAppointment === true;

  for (const type of proposedTypes) {
    const supported = isSupportedExecutableAction(type);
    let authorized = false;
    let reason = REASON_CODES.SIDE_EFFECTS_DISABLED;

    if (!supported) {
      reason = REASON_CODES.EXECUTION_UNSUPPORTED_ACTION;
    } else if (denyReasons.length > 0) {
      reason = denyReasons[0];
    } else if (!decisionProposesCreate || !decisionMayCreate) {
      // Create must be an explicit confirmed proposal, not a bare nextAction string.
      reason = REASON_CODES.PREMATURE_BOOKING_BLOCKED;
    } else {
      authorized = true;
      reason = REASON_CODES.EXECUTION_AUTHORIZED;
    }

    proposals.push({
      type,
      status: authorized ? "authorized" : "proposed",
      authorized,
      reason
    });
  }

  const authorized =
    proposals.some((p) => p.authorized === true) &&
    denyReasons.length === 0 &&
    eligibility.eligible === true &&
    profileConfigured === true;

  if (!authorized && denyReasons.length === 0) {
    denyReasons.push(REASON_CODES.SIDE_EFFECTS_DISABLED);
  }

  return {
    executionEnabled,
    shadowEnabled: isShadowEnabled(env),
    authorized,
    proposals,
    denyReasons: [...new Set(denyReasons)],
    organizationId: orgId,
    actingUserId: userId,
    profileConfigured: profileConfigured === true,
    eligibilityReason: eligibility.reason,
    note: authorized
      ? "Recruit AI v2 execution authorized for supported canary action only."
      : "Recruit AI v2 side effects denied (fail-closed). Decisions remain auditable."
  };
}

module.exports = {
  authorizeSideEffects,
  isExecutionEnabled,
  isShadowEnabled,
  resolveActingUserId,
  resolveOrganizationId,
  V2_EXECUTABLE_ACTIONS
};
