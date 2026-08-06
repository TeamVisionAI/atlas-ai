/**
 * Recruit AI v2 — shared constants.
 * Implements BR-081 (structured context + decision; side effects disabled).
 */

const STAGES = Object.freeze({
  GREETING: "greeting",
  QUALIFICATION: "qualification",
  SCHEDULING: "scheduling",
  PROPOSED: "proposed",
  CONFIRMED: "confirmed",
  RESCHEDULING: "rescheduling",
  HUMAN_REQUIRED: "human_required"
});

const APPOINTMENT_STATUS = Object.freeze({
  NONE: "none",
  PROPOSED: "proposed",
  CONFIRMED: "confirmed",
  RESCHEDULE_REQUESTED: "reschedule_requested"
});

const LANGUAGES = Object.freeze({
  ENGLISH: "english",
  SPANISH: "spanish",
  UNKNOWN: "unknown"
});

const INTENTS = Object.freeze({
  OPPORTUNITY_QUESTION: "opportunity_question",
  ECHO_OR_NOOP: "echo_or_noop",
  PROVIDE_LOCATION: "provide_location",
  PROVIDE_NAME: "provide_name",
  SELECT_OPTION: "select_option",
  SCHEDULING_COUNTEROFFER: "scheduling_counteroffer",
  SCHEDULE_CONFIRM: "schedule_confirm",
  RESCHEDULE_REQUEST: "reschedule_request",
  UNKNOWN: "unknown"
});

const NEXT_ACTIONS = Object.freeze({
  ANSWER_BRIEF_VALUE_PROP_THEN_QUALIFY: "answer_brief_value_prop_then_qualify",
  CLARIFY_ONCE: "clarify_once",
  CONTINUE_QUALIFICATION: "continue_qualification",
  ACKNOWLEDGE_AND_CHECK_AVAILABILITY: "acknowledge_and_check_availability",
  OFFER_ALTERNATIVES_OR_ESCALATE: "offer_alternatives_or_escalate",
  ASK_EXPLICIT_CONFIRMATION: "ask_explicit_confirmation",
  CREATE_APPOINTMENT: "create_appointment",
  OFFER_RESCHEDULE_FLOW: "offer_reschedule_flow",
  SAFE_FAILURE_AND_ESCALATE: "safe_failure_and_escalate",
  ESCALATE_TO_HUMAN: "escalate_to_human",
  NOOP: "noop"
});

const REASON_CODES = Object.freeze({
  COUNTEROFFER_DETECTED: "COUNTEROFFER_DETECTED",
  COUNTEROFFER_OUTSIDE_OFFERED_SET: "COUNTEROFFER_OUTSIDE_OFFERED_SET",
  SAME_SLOTS_ALREADY_REJECTED: "SAME_SLOTS_ALREADY_REJECTED",
  ESCALATE_AFTER_REPEATED_MISMATCH: "ESCALATE_AFTER_REPEATED_MISMATCH",
  EXPLICIT_CONFIRMATION_REQUIRED: "EXPLICIT_CONFIRMATION_REQUIRED",
  APPOINTMENT_ALREADY_CONFIRMED: "APPOINTMENT_ALREADY_CONFIRMED",
  RESCHEDULE_AFTER_CONFIRMATION: "RESCHEDULE_AFTER_CONFIRMATION",
  FORBID_INTERNAL_DIAGNOSTICS: "FORBID_INTERNAL_DIAGNOSTICS",
  LANGUAGE_STICKY: "LANGUAGE_STICKY",
  SIDE_EFFECTS_DISABLED: "SIDE_EFFECTS_DISABLED",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  ECHO_DETECTED: "ECHO_DETECTED",
  PREMATURE_BOOKING_BLOCKED: "PREMATURE_BOOKING_BLOCKED"
});

/** Feature flags — v2 decisions are auditable; execution stays off until cutover. */
const FEATURE_FLAGS = Object.freeze({
  /** Primary production shadow flag (default false). */
  SHADOW_ENABLED_ENV: "RECRUIT_AI_V2_SHADOW_ENABLED",
  /** Legacy alias accepted by shadowConfig / authorizer. */
  SHADOW_ENABLED_LEGACY_ENV: "RECRUIT_AI_V2_SHADOW",
  /** When true, SideEffectAuthorizer may approve execution (must stay false). */
  EXECUTION_ENABLED_ENV: "RECRUIT_AI_V2_EXECUTION_ENABLED"
});

const SHADOW_DIVERGENCE = Object.freeze({
  ALIGNED: "aligned",
  INTENT_MISMATCH: "intent_mismatch",
  LANGUAGE_MISMATCH: "language_mismatch",
  ACTION_MISMATCH: "action_mismatch",
  LIVE_EMPTY_V2_ACTIVE: "live_empty_v2_active",
  V2_SAFE_FAILURE: "v2_safe_failure",
  V2_EVALUATION_FAILED: "v2_evaluation_failed",
  DIAGNOSTIC_LEAK: "diagnostic_leak",
  UNKNOWN: "unknown"
});

const MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE = 2;

const INTERNAL_DIAGNOSTIC_PATTERNS = Object.freeze([
  /authenticated agent/i,
  /agent id/i,
  /persistence/i,
  /APPOINTMENT_PERSISTENCE/i,
  /stack trace/i,
  /TypeError/i,
  /organization_rvp/i,
  /missing_schedule_agent/i,
  /supabase/i,
  /DATABASE_URL/i
]);

module.exports = {
  STAGES,
  APPOINTMENT_STATUS,
  LANGUAGES,
  INTENTS,
  NEXT_ACTIONS,
  REASON_CODES,
  FEATURE_FLAGS,
  SHADOW_DIVERGENCE,
  MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE,
  INTERNAL_DIAGNOSTIC_PATTERNS
};
