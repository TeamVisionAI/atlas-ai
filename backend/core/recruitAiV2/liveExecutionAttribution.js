/**
 * Recruit AI v2 — live booking attribution telemetry (BR-113).
 * Telemetry only. Does not authorize, mutate, or change fallback behavior.
 *
 * Final executionSource classifications (exactly one per booking attempt):
 * - V2
 * - LEGACY_FALLBACK
 * - LEGACY_NO_V2_ATTEMPT
 */

const STAGES = Object.freeze({
  NOT_ATTEMPTED: "recruit_ai_v2_live_execution_not_attempted",
  USED: "recruit_ai_v2_live_execution_used",
  NOT_USED: "recruit_ai_v2_live_execution_not_used",
  LEGACY_FALLBACK: "recruit_ai_v2_legacy_fallback_performed",
  BRIDGE_FAILED: "recruit_ai_v2_live_execution_bridge_failed"
});

const EXECUTION_SOURCE = Object.freeze({
  V2: "V2",
  LEGACY_FALLBACK: "LEGACY_FALLBACK",
  LEGACY_NO_V2_ATTEMPT: "LEGACY_NO_V2_ATTEMPT"
});

const OUTCOME = Object.freeze({
  V2_EXECUTION_PERFORMED: "V2_EXECUTION_PERFORMED",
  V2_EXECUTION_DENIED_LEGACY_FALLBACK_PERFORMED:
    "V2_EXECUTION_DENIED_LEGACY_FALLBACK_PERFORMED",
  V2_EXECUTION_NOT_ATTEMPTED: "V2_EXECUTION_NOT_ATTEMPTED"
});

function buildNotAttemptedDetails({
  phone,
  organizationId,
  agentId,
  reason = "LIVE_PATH_DISABLED"
} = {}) {
  return {
    level: "info",
    phone: phone || null,
    organizationId: organizationId || null,
    agentId: agentId || null,
    reason: reason || "LIVE_PATH_DISABLED",
    executionSource: EXECUTION_SOURCE.LEGACY_NO_V2_ATTEMPT,
    outcome: OUTCOME.V2_EXECUTION_NOT_ATTEMPTED
  };
}

function buildUsedDetails({
  phone,
  organizationId,
  agentId,
  appointmentId = null,
  idempotent = false
} = {}) {
  return {
    phone: phone || null,
    organizationId: organizationId || null,
    agentId: agentId || null,
    appointmentId: appointmentId || null,
    idempotent: Boolean(idempotent),
    executionSource: EXECUTION_SOURCE.V2,
    outcome: OUTCOME.V2_EXECUTION_PERFORMED
  };
}

function buildNotUsedDetails({
  phone,
  organizationId,
  agentId,
  reason = null,
  authorized = false
} = {}) {
  return {
    level: "info",
    phone: phone || null,
    organizationId: organizationId || null,
    agentId: agentId || null,
    reason: reason || null,
    authorized: Boolean(authorized)
  };
}

/**
 * Only emit after the legacy CE booking call actually runs
 * following a v2 attempt that did not perform the booking.
 */
function buildLegacyFallbackDetails({
  phone,
  organizationId,
  agentId,
  priorReason = null,
  authorized = null,
  appointmentId = null,
  legacySuccess = null
} = {}) {
  return {
    level: "info",
    phone: phone || null,
    organizationId: organizationId || null,
    agentId: agentId || null,
    priorReason: priorReason || null,
    authorized: authorized == null ? null : Boolean(authorized),
    appointmentId: appointmentId || null,
    legacySuccess: legacySuccess == null ? null : Boolean(legacySuccess),
    executionSource: EXECUTION_SOURCE.LEGACY_FALLBACK,
    outcome: OUTCOME.V2_EXECUTION_DENIED_LEGACY_FALLBACK_PERFORMED
  };
}

function classifyFromStages(stages = []) {
  const set = new Set(stages);
  if (set.has(STAGES.USED)) {
    return EXECUTION_SOURCE.V2;
  }
  if (set.has(STAGES.LEGACY_FALLBACK)) {
    return EXECUTION_SOURCE.LEGACY_FALLBACK;
  }
  if (set.has(STAGES.NOT_ATTEMPTED)) {
    return EXECUTION_SOURCE.LEGACY_NO_V2_ATTEMPT;
  }
  return null;
}

module.exports = {
  STAGES,
  EXECUTION_SOURCE,
  OUTCOME,
  buildNotAttemptedDetails,
  buildUsedDetails,
  buildNotUsedDetails,
  buildLegacyFallbackDetails,
  classifyFromStages
};
