/**
 * Legacy CE appointment-mutation gate for LIVE_AUTHORING canary cohorts.
 *
 * BR-111 remains the sole appointment-mutation authority.
 * BR-114 authorizes speak/send only.
 *
 * For the LIVE_AUTHORING allowlisted org+user, CE fallthrough must also respect
 * BR-111 before create (Calendar / atlas_appointments / executeScheduleInterview).
 * Outside the authoring cohort, legacy CE scheduling is unchanged.
 */

const {
  isEligibleForLiveAuthoring,
  resolveActingUserIdFromProspect
} = require("./liveAuthoringConfig");
const { isEligibleForExecution } = require("./executionConfig");

const DENY_REASON = "CE_APPOINTMENT_MUTATION_DENIED_AUTHORING_CANARY";
const DENY_STAGE = "ce_appointment_mutation_denied_authoring_canary";

/**
 * @returns {{
 *   allowed: boolean,
 *   reason: string|null,
 *   authoringEligible: boolean,
 *   executionEligible: boolean
 * }}
 */
function evaluateLegacyCeAppointmentMutation({
  organizationId,
  actingUserId,
  env = process.env
} = {}) {
  const authoring = isEligibleForLiveAuthoring({
    organizationId,
    actingUserId,
    env,
    invocationSource: "live_whatsapp"
  });

  if (!authoring.eligible) {
    return {
      allowed: true,
      reason: authoring.reason || "NOT_LIVE_AUTHORING_COHORT",
      authoringEligible: false,
      executionEligible: false
    };
  }

  const execution = isEligibleForExecution({
    organizationId,
    actingUserId,
    env
  });

  if (execution.eligible) {
    return {
      allowed: true,
      reason: null,
      authoringEligible: true,
      executionEligible: true
    };
  }

  return {
    allowed: false,
    reason: DENY_REASON,
    authoringEligible: true,
    executionEligible: false,
    executionDenyReason: execution.reason || "EXECUTION_NOT_AUTHORIZED"
  };
}

/**
 * Existing speak-only deferred / human-finalization posture (V2 appointment_confirm_deferred).
 */
function buildDeferredMutationDeniedReply(language = "en") {
  if (String(language).toLowerCase().startsWith("es")) {
    return "Gracias — anoté tu confirmación. Un compañero finalizará los detalles en breve.";
  }

  return "Thanks — I've noted your confirmation. A teammate will finalize the booking details shortly.";
}

module.exports = {
  DENY_REASON,
  DENY_STAGE,
  evaluateLegacyCeAppointmentMutation,
  buildDeferredMutationDeniedReply,
  resolveActingUserIdFromProspect
};
