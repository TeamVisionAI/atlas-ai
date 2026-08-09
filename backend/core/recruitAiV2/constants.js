/**
 * Recruit AI v2 — shared constants.
 * Implements BR-081 (structured context + decision; side effects disabled).
 * BR-082 — conversational clarification and partial-fact resolution.
 * BR-084 — scheduling constraints and direct-time resolution.
 * BR-085 — date-only scheduling, cancellation/withdraw, in-person travel confirm.
 * BR-086 — natural-language communication opt-out resolution.
 * BR-087 — scheduling memory, meeting logistics, clean withdrawal.
 * BR-088 — intent priority, job/opportunity FAQ, contextual continuation.
 * BR-089 — license requirement question vs ambiguous license statement.
 * BR-090 — Puerto Rico work-auth normalization + fixed-employment preference.
 * BR-091 — direct lack-of-interest withdrawal ("No me interesa", etc.).
 */

const STAGES = Object.freeze({
  GREETING: "greeting",
  QUALIFICATION: "qualification",
  SCHEDULING: "scheduling",
  PROPOSED: "proposed",
  CONFIRMED: "confirmed",
  RESCHEDULING: "rescheduling",
  WITHDRAWN: "withdrawn",
  /** BR-090 — clear current non-fit; not opt-out / not withdraw side-effect. */
  CURRENT_NOT_FIT: "current_not_fit",
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
  GREETING: "greeting",
  OPPORTUNITY_QUESTION: "opportunity_question",
  JOB_OPPORTUNITY_QUESTION: "job_opportunity_question",
  INSURANCE_QUESTION: "insurance_question",
  LICENSE_REQUIREMENT_QUESTION: "license_requirement_question",
  LICENSE_PATH_DETAIL_QUESTION: "license_path_detail_question",
  COMPENSATION_QUESTION: "compensation_question",
  /** BR-098 — prior-experience FAQ. */
  EXPERIENCE_QUESTION: "experience_question",
  /** BR-099 — sales skill / experience / aversion objection. */
  SALES_OBJECTION: "sales_objection",
  /** BR-103 — network / prospecting objection (no contacts / who to call). */
  NETWORK_OBJECTION: "network_objection",
  /** BR-103 — soft acknowledgement while availability is still pending. */
  SOFT_ACKNOWLEDGEMENT: "soft_acknowledgement",
  /** BR-090 — seeking fixed/salaried/hourly traditional employment. */
  FIXED_EMPLOYMENT_PREFERENCE: "fixed_employment_preference",
  /** BR-090 — reinforced current non-fit / not-now after opportunity explained. */
  CURRENT_NOT_FIT: "current_not_fit",
  CONVERSATION_CLARIFICATION_REQUEST: "conversation_clarification_request",
  ECHO_OR_NOOP: "echo_or_noop",
  /** BR-118 — non-text WhatsApp media (document/image/audio/…); not prospect language. */
  NON_TEXT_MEDIA: "non_text_media",
  PROVIDE_LOCATION: "provide_location",
  CORRECT_LOCATION: "correct_location",
  PROVIDE_AUTHORIZATION: "provide_authorization",
  AMBIGUOUS_LICENSE_STATEMENT: "ambiguous_license_statement",
  PROVIDE_LICENSE_CLARIFICATION: "provide_license_clarification",
  PROVIDE_NAME: "provide_name",
  PROVIDE_DAY_PART: "provide_day_part",
  INCOMPLETE_DAY_PART: "incomplete_day_part",
  AMBIGUOUS_FRAGMENT: "ambiguous_fragment",
  PROVIDE_MEETING_PREFERENCE: "provide_meeting_preference",
  PROVIDE_AVAILABILITY_CONSTRAINT: "provide_availability_constraint",
  REQUEST_LANGUAGE_SWITCH: "request_language_switch",
  CANCEL_REQUEST: "cancel_request",
  WITHDRAW_INTEREST: "withdraw_interest",
  OPT_OUT_REQUEST: "opt_out_request",
  CONFIRM_IN_PERSON_TRAVEL: "confirm_in_person_travel",
  SCHEDULING_DATE_PROPOSAL: "scheduling_date_proposal",
  MEETING_ACCESS_REQUEST: "meeting_access_request",
  REASSERT_KNOWN_FACT: "reassert_known_fact",
  SELECT_OPTION: "select_option",
  SCHEDULING_COUNTEROFFER: "scheduling_counteroffer",
  CLARIFY_AM_PM: "clarify_am_pm",
  SCHEDULE_CONFIRM: "schedule_confirm",
  RESCHEDULE_REQUEST: "reschedule_request",
  /** BR-124 — explicit renewed ask to schedule an interview (pre-booking recovery). */
  REQUEST_SCHEDULE_INTERVIEW: "request_schedule_interview",
  UNKNOWN: "unknown"
});

const NEXT_ACTIONS = Object.freeze({
  ANSWER_BRIEF_VALUE_PROP_THEN_QUALIFY: "answer_brief_value_prop_then_qualify",
  ANSWER_JOB_OPPORTUNITY_THEN_RESUME: "answer_job_opportunity_then_resume",
  ANSWER_INSURANCE_FAQ_THEN_RESUME: "answer_insurance_faq_then_resume",
  ANSWER_LICENSE_REQUIREMENT_THEN_RESUME: "answer_license_requirement_then_resume",
  ANSWER_LICENSE_PATH_DETAIL_THEN_RESUME: "answer_license_path_detail_then_resume",
  ANSWER_COMPENSATION_FAQ_THEN_RESUME: "answer_compensation_faq_then_resume",
  ANSWER_EXPERIENCE_FAQ_THEN_RESUME: "answer_experience_faq_then_resume",
  ANSWER_SALES_OBJECTION_THEN_RESUME: "answer_sales_objection_then_resume",
  ANSWER_NETWORK_OBJECTION_THEN_RESUME: "answer_network_objection_then_resume",
  ACKNOWLEDGE_SOFT_CONTINUE: "acknowledge_soft_continue",
  /** BR-118 — soft media ack; do not reopen text clarification path. */
  ACKNOWLEDGE_NON_TEXT_MEDIA: "acknowledge_non_text_media",
  /** BR-090 — acknowledge fixed-employment preference without forcing scheduling. */
  ACKNOWLEDGE_FIXED_EMPLOYMENT_PREFERENCE:
    "acknowledge_fixed_employment_preference",
  /** BR-090 — polite terminal closure; no opt-out / handoff / appointment. */
  ACKNOWLEDGE_CURRENT_NOT_FIT_NO_WRITE: "acknowledge_current_not_fit_no_write",
  EXPLAIN_PENDING_THEN_ASK: "explain_pending_then_ask",
  ACKNOWLEDGE_DAY_PART_ASK_TIME: "acknowledge_day_part_ask_time",
  CONTINUE_AFTER_GREETING: "continue_after_greeting",
  CLARIFY_ONCE: "clarify_once",
  CLARIFY_LOCATION: "clarify_location",
  CLARIFY_DAY_PART: "clarify_day_part",
  CLARIFY_LICENSE_TYPE: "clarify_license_type",
  CLARIFY_WORK_AUTH_AFTER_LICENSE: "clarify_work_auth_after_license",
  CONTINUE_QUALIFICATION: "continue_qualification",
  /** BR-124 — resume scheduling after explicit schedule request clears stale ambiguity. */
  RESUME_SCHEDULING_AFTER_EXPLICIT_REQUEST:
    "resume_scheduling_after_explicit_request",
  ACKNOWLEDGE_CORRECTION_THEN_RESUME: "acknowledge_correction_then_resume",
  CAPTURE_AUTHORIZATION_CONTINUE: "capture_authorization_continue",
  UPDATE_MEETING_PREFERENCE: "update_meeting_preference",
  SWITCH_LANGUAGE_CONTINUE: "switch_language_continue",
  ACKNOWLEDGE_CANCEL_NO_WRITE: "acknowledge_cancel_no_write",
  ACKNOWLEDGE_WITHDRAW_NO_WRITE: "acknowledge_withdraw_no_write",
  ACKNOWLEDGE_OPT_OUT_NO_WRITE: "acknowledge_opt_out_no_write",
  CONFIRM_IN_PERSON_TRAVEL: "confirm_in_person_travel",
  CONFIRM_DATE_WITH_TIME: "confirm_date_with_time",
  ACKNOWLEDGE_DATE_ASK_TIME: "acknowledge_date_ask_time",
  ACKNOWLEDGE_AND_CHECK_AVAILABILITY: "acknowledge_and_check_availability",
  ACKNOWLEDGE_AVAILABILITY_CONSTRAINT: "acknowledge_availability_constraint",
  ACKNOWLEDGE_KNOWN_AVAILABILITY: "acknowledge_known_availability",
  ACKNOWLEDGE_MEETING_ACCESS: "acknowledge_meeting_access",
  /** BR-107 — offer real Sprint 22 candidate slots (read-only). */
  OFFER_AVAILABLE_SLOTS: "offer_available_slots",
  /** BR-107 — successful read, zero qualifying slots. */
  ACKNOWLEDGE_NO_QUALIFYING_AVAILABILITY: "acknowledge_no_qualifying_availability",
  OFFER_ALTERNATIVES_OR_ESCALATE: "offer_alternatives_or_escalate",
  OFFER_ALTERNATIVES_NO_HANDOFF: "offer_alternatives_no_handoff",
  CLARIFY_AM_PM: "clarify_am_pm",
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
  /** BR-115 — natural/spoken time uniquely matched a previously offered slot. */
  OFFERED_SLOT_NATURAL_TIME_SELECTED: "OFFERED_SLOT_NATURAL_TIME_SELECTED",
  /** BR-115 — same time offered on multiple days; ask which day. */
  OFFERED_SLOT_TIME_AMBIGUOUS: "OFFERED_SLOT_TIME_AMBIGUOUS",
  /** BR-119 — day-only reply uniquely matched a previously offered slot. */
  OFFERED_SLOT_DAY_NARROWED: "OFFERED_SLOT_DAY_NARROWED",
  /** BR-119 — day matched multiple offered times; keep those times only. */
  OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS: "OFFERED_SLOT_DAY_NARROWED_AMBIGUOUS",
  /** BR-119 — named day already fixed on all offered slots; ask time only. */
  OFFERED_SLOT_DAY_ALREADY_FIXED: "OFFERED_SLOT_DAY_ALREADY_FIXED",
  /** BR-119 — prospect wants later alternatives outside the offered set. */
  REQUESTED_LATER_ALTERNATIVES: "REQUESTED_LATER_ALTERNATIVES",
  /** BR-119 — day-part answer offered real Sprint 22 slots instead of open time ask. */
  DAY_PART_OFFERED_AVAILABLE_SLOTS: "DAY_PART_OFFERED_AVAILABLE_SLOTS",
  SAME_SLOTS_ALREADY_REJECTED: "SAME_SLOTS_ALREADY_REJECTED",
  ESCALATE_AFTER_REPEATED_MISMATCH: "ESCALATE_AFTER_REPEATED_MISMATCH",
  EXPLICIT_CONFIRMATION_REQUIRED: "EXPLICIT_CONFIRMATION_REQUIRED",
  APPOINTMENT_ALREADY_CONFIRMED: "APPOINTMENT_ALREADY_CONFIRMED",
  RESCHEDULE_AFTER_CONFIRMATION: "RESCHEDULE_AFTER_CONFIRMATION",
  FORBID_INTERNAL_DIAGNOSTICS: "FORBID_INTERNAL_DIAGNOSTICS",
  LANGUAGE_STICKY: "LANGUAGE_STICKY",
  LANGUAGE_ADAPTED_ACTIVE_CONVERSATION: "LANGUAGE_ADAPTED_ACTIVE_CONVERSATION",
  SIDE_EFFECTS_DISABLED: "SIDE_EFFECTS_DISABLED",
  LOW_CONFIDENCE: "LOW_CONFIDENCE",
  ECHO_DETECTED: "ECHO_DETECTED",
  PREMATURE_BOOKING_BLOCKED: "PREMATURE_BOOKING_BLOCKED",
  PARTIAL_LOCATION: "PARTIAL_LOCATION",
  STATE_ONLY_LOCATION: "STATE_ONLY_LOCATION",
  LOCATION_STATE_UNCONFIRMED: "LOCATION_STATE_UNCONFIRMED",
  RECOVERABLE_AMBIGUITY: "RECOVERABLE_AMBIGUITY",
  REPEATED_AMBIGUITY_ESCALATE: "REPEATED_AMBIGUITY_ESCALATE",
  GREETING_NO_ESCALATE: "GREETING_NO_ESCALATE",
  /** BR-124 — explicit schedule intent resets stale pre-appointment clarification. */
  EXPLICIT_SCHEDULE_INTENT_RECOVERS_AMBIGUITY:
    "EXPLICIT_SCHEDULE_INTENT_RECOVERS_AMBIGUITY",
  /** BR-124 — customer-facing handoff copy delivered for genuine escalate. */
  ESCALATE_HANDOFF_CUSTOMER_ACK: "ESCALATE_HANDOFF_CUSTOMER_ACK",
  FRAGMENT_NOT_NAME: "FRAGMENT_NOT_NAME",
  FACT_CORRECTION: "FACT_CORRECTION",
  PENDING_QUESTION_DEFERRED: "PENDING_QUESTION_DEFERRED",
  DIRECT_QUESTION_ANSWERED: "DIRECT_QUESTION_ANSWERED",
  HANDOFF_GUARD_SKIPPED: "HANDOFF_GUARD_SKIPPED",
  AUTHORIZATION_CAPTURED: "AUTHORIZATION_CAPTURED",
  LANGUAGE_EXPLICIT_SWITCH: "LANGUAGE_EXPLICIT_SWITCH",
  WORK_AUTH_LICENSE_SEPARATED: "WORK_AUTH_LICENSE_SEPARATED",
  GENERIC_LICENSE_AMBIGUOUS: "GENERIC_LICENSE_AMBIGUOUS",
  SPECIFIC_FAQ_ANSWERED: "SPECIFIC_FAQ_ANSWERED",
  OUTSIDE_COVERAGE_ZOOM_DEFAULT: "OUTSIDE_COVERAGE_ZOOM_DEFAULT",
  LOCAL_COVERAGE_OFFICE_DEFAULT: "LOCAL_COVERAGE_OFFICE_DEFAULT",
  NO_INCOME_GUARANTEE: "NO_INCOME_GUARANTEE",
  AVAILABILITY_CONSTRAINT_CAPTURED: "AVAILABILITY_CONSTRAINT_CAPTURED",
  AVAILABILITY_CONSTRAINT_CONFLICT: "AVAILABILITY_CONSTRAINT_CONFLICT",
  /** BR-107 */
  AVAILABLE_SLOTS_OFFERED: "AVAILABLE_SLOTS_OFFERED",
  ZERO_QUALIFYING_SLOTS: "ZERO_QUALIFYING_SLOTS",
  AVAILABILITY_READ_UNAVAILABLE: "AVAILABILITY_READ_UNAVAILABLE",
  AVAILABILITY_REQUIRES_CONCRETE_DATE: "AVAILABILITY_REQUIRES_CONCRETE_DATE",
  /** BR-108 — proactive rolling multi-date availability search. */
  ROLLING_AVAILABILITY_SEARCH: "ROLLING_AVAILABILITY_SEARCH",
  MOST_SPECIFIC_SCHEDULING_RESUME: "MOST_SPECIFIC_SCHEDULING_RESUME",
  DIRECT_TIME_OVERRIDES_DAY_PART: "DIRECT_TIME_OVERRIDES_DAY_PART",
  CANDIDATE_TIME_REPLACED: "CANDIDATE_TIME_REPLACED",
  AMPM_CLARIFICATION_REQUIRED: "AMPM_CLARIFICATION_REQUIRED",
  SLOT_UNAVAILABLE_OFFER_ALTERNATIVES: "SLOT_UNAVAILABLE_OFFER_ALTERNATIVES",
  /** BR-116 — preferred time triggered same-turn canonical availability offer. */
  REQUESTED_TIME_AVAILABILITY_OFFERED: "REQUESTED_TIME_AVAILABILITY_OFFERED",
  SCHEDULING_HANDOFF_GUARD: "SCHEDULING_HANDOFF_GUARD",
  LOCATION_COVERAGE_REEVALUATED: "LOCATION_COVERAGE_REEVALUATED",
  OUTSIDE_CLEARS_STALE_OFFICE: "OUTSIDE_CLEARS_STALE_OFFICE",
  DATE_ONLY_PROPOSAL: "DATE_ONLY_PROPOSAL",
  DATE_CANDIDATE_REPLACED: "DATE_CANDIDATE_REPLACED",
  DATE_EXCLUSIONS_CAPTURED: "DATE_EXCLUSIONS_CAPTURED",
  PRIOR_TIME_PRESERVED_WITH_DATE: "PRIOR_TIME_PRESERVED_WITH_DATE",
  CANCEL_INTENT_RECOGNIZED: "CANCEL_INTENT_RECOGNIZED",
  WITHDRAW_INTENT_RECOGNIZED: "WITHDRAW_INTENT_RECOGNIZED",
  OPT_OUT_INTENT_RECOGNIZED: "OPT_OUT_INTENT_RECOGNIZED",
  NATURAL_LANGUAGE_OPT_OUT: "NATURAL_LANGUAGE_OPT_OUT",
  IN_PERSON_TRAVEL_CONFIRMATION_REQUIRED: "IN_PERSON_TRAVEL_CONFIRMATION_REQUIRED",
  IN_PERSON_TRAVEL_CONFIRMED: "IN_PERSON_TRAVEL_CONFIRMED",
  EXPLICIT_ZOOM_CLEARS_OFFICE: "EXPLICIT_ZOOM_CLEARS_OFFICE",
  SCHEDULING_STOPPED: "SCHEDULING_STOPPED",
  SCHEDULING_MEMORY_PRESERVED: "SCHEDULING_MEMORY_PRESERVED",
  SKIP_REDUNDANT_DAY_PART: "SKIP_REDUNDANT_DAY_PART",
  ASK_ONLY_MISSING_INFORMATION: "ASK_ONLY_MISSING_INFORMATION",
  MEETING_ACCESS_REQUESTED: "MEETING_ACCESS_REQUESTED",
  ZOOM_LINK_DEFERRED_UNTIL_CONFIRM: "ZOOM_LINK_DEFERRED_UNTIL_CONFIRM",
  ZOOM_LINK_CANONICAL_PROPOSED: "ZOOM_LINK_CANONICAL_PROPOSED",
  ZOOM_LINK_PENDING_UNAVAILABLE: "ZOOM_LINK_PENDING_UNAVAILABLE",
  REPETITION_ACKNOWLEDGED: "REPETITION_ACKNOWLEDGED",
  CLEAN_WITHDRAWAL_CLOSURE: "CLEAN_WITHDRAWAL_CLOSURE",
  JOB_OPPORTUNITY_FAQ: "JOB_OPPORTUNITY_FAQ",
  JOB_OVERVIEW_FAQ: "JOB_OVERVIEW_FAQ",
  JOB_FAQ_PROGRESSIVE_DISCLOSURE: "JOB_FAQ_PROGRESSIVE_DISCLOSURE",
  FAQ_OUTRANKS_SCHEDULING: "FAQ_OUTRANKS_SCHEDULING",
  FAQ_OUTRANKS_LOCATION: "FAQ_OUTRANKS_LOCATION",
  EXPERIENCE_FAQ: "EXPERIENCE_FAQ",
  INSURANCE_FAQ_ROUTED: "INSURANCE_FAQ_ROUTED",
  SALES_OBJECTION_RECOGNIZED: "SALES_OBJECTION_RECOGNIZED",
  SALES_OBJECTION_OUTRANKS_CORRECTION: "SALES_OBJECTION_OUTRANKS_CORRECTION",
  NETWORK_OBJECTION_RECOGNIZED: "NETWORK_OBJECTION_RECOGNIZED",
  SOFT_ACKNOWLEDGEMENT_ONLY: "SOFT_ACKNOWLEDGEMENT_ONLY",
  CONFIRMATION_REQUIRES_CONCRETE_SLOT: "CONFIRMATION_REQUIRES_CONCRETE_SLOT",
  PREMATURE_SCHEDULE_CONFIRM_BLOCKED: "PREMATURE_SCHEDULE_CONFIRM_BLOCKED",
  MANANA_DAY_PART_CONTEXT: "MANANA_DAY_PART_CONTEXT",
  MANANA_DATE_CONTEXT: "MANANA_DATE_CONTEXT",
  DAY_PART_CONTEXT_PRIORITY: "DAY_PART_CONTEXT_PRIORITY",
  DAY_PART_INHERITS_MERIDIEM: "DAY_PART_INHERITS_MERIDIEM",
  DAY_PART_ADVANCES_TO_TIME: "DAY_PART_ADVANCES_TO_TIME",
  NO_DEAD_END_CONTINUATION: "NO_DEAD_END_CONTINUATION",
  META_CONVERSATION_CLARIFIED: "META_CONVERSATION_CLARIFIED",
  LICENSE_REQUIREMENT_QUESTION_RECOGNIZED: "LICENSE_REQUIREMENT_QUESTION_RECOGNIZED",
  LICENSE_PATH_DETAIL_ANSWERED: "LICENSE_PATH_DETAIL_ANSWERED",
  LICENSE_PATH_DETAIL_NOT_VOLUNTEERED: "LICENSE_PATH_DETAIL_NOT_VOLUNTEERED",
  LICENSE_STATUS_STATEMENT: "LICENSE_STATUS_STATEMENT",
  LICENSE_AMBIGUITY_RESERVED: "LICENSE_AMBIGUITY_RESERVED",
  PUERTO_RICO_WORK_AUTH_NORMALIZED: "PUERTO_RICO_WORK_AUTH_NORMALIZED",
  FIXED_EMPLOYMENT_PREFERENCE_RECOGNIZED:
    "FIXED_EMPLOYMENT_PREFERENCE_RECOGNIZED",
  FIXED_EMPLOYMENT_NO_PRESSURE: "FIXED_EMPLOYMENT_NO_PRESSURE",
  CURRENT_NOT_FIT_RECOGNIZED: "CURRENT_NOT_FIT_RECOGNIZED",
  POLITE_CURRENT_NOT_FIT_CLOSURE: "POLITE_CURRENT_NOT_FIT_CLOSURE",
  EMPLOYMENT_FIT_STATE_SEPARATED: "EMPLOYMENT_FIT_STATE_SEPARATED",
  DIRECT_LACK_OF_INTEREST_RECOGNIZED: "DIRECT_LACK_OF_INTEREST_RECOGNIZED",
  /** BR-111 — decision proposes create; authorization is independent. */
  APPOINTMENT_CREATE_PROPOSED: "APPOINTMENT_CREATE_PROPOSED",
  /** BR-118 — inbound classified as non-text media (not free-form language). */
  NON_TEXT_MEDIA_RECEIVED: "NON_TEXT_MEDIA_RECEIVED",
  /** BR-118 — skipped text interpreter / clarify_once for media. */
  NON_TEXT_MEDIA_DIALOGUE_SKIPPED: "NON_TEXT_MEDIA_DIALOGUE_SKIPPED",
  /** BR-118 — media after appointment_confirm_deferred / confirmed proposed slot. */
  NON_TEXT_MEDIA_POST_CONFIRM_HANDLED: "NON_TEXT_MEDIA_POST_CONFIRM_HANDLED",
  EXPLICIT_CONFIRMATION_RECEIVED: "EXPLICIT_CONFIRMATION_RECEIVED",
  EXECUTION_AUTHORIZED: "EXECUTION_AUTHORIZED",
  EXECUTION_DENIED: "EXECUTION_DENIED",
  EXECUTION_PROFILE_NOT_CONFIGURED: "EXECUTION_PROFILE_NOT_CONFIGURED",
  EXECUTION_UNSUPPORTED_ACTION: "EXECUTION_UNSUPPORTED_ACTION",
  EXECUTION_ORG_NOT_ALLOWLISTED: "EXECUTION_ORG_NOT_ALLOWLISTED",
  EXECUTION_USER_NOT_ALLOWLISTED: "EXECUTION_USER_NOT_ALLOWLISTED",
  EXECUTION_SLOT_STALE: "EXECUTION_SLOT_STALE",
  EXECUTION_IDEMPOTENT_REPLAY: "EXECUTION_IDEMPOTENT_REPLAY",
  EXECUTION_ACTIVE_SLOT_CONFLICT: "EXECUTION_ACTIVE_SLOT_CONFLICT",
  EXECUTION_CANONICAL_FAILED: "EXECUTION_CANONICAL_FAILED",
  /** BR-122 — canonical reported failure but an active appointment remains. */
  EXECUTION_RECONCILED_ACTIVE_APPOINTMENT: "EXECUTION_RECONCILED_ACTIVE_APPOINTMENT"
});

/** Feature flags — v2 decisions are auditable; execution stays fail-closed until canary. */
const FEATURE_FLAGS = Object.freeze({
  /** Primary production shadow flag (default false). */
  SHADOW_ENABLED_ENV: "RECRUIT_AI_V2_SHADOW_ENABLED",
  /** Legacy alias accepted by shadowConfig / authorizer. */
  SHADOW_ENABLED_LEGACY_ENV: "RECRUIT_AI_V2_SHADOW",
  /** Continuous context capture (Phase 3B; default false; independent of shadow sample). */
  CONTEXT_CAPTURE_ENABLED_ENV: "RECRUIT_AI_V2_CONTEXT_CAPTURE_ENABLED",
  /** When true, SideEffectAuthorizer may approve execution (fail-closed without allowlists). */
  EXECUTION_ENABLED_ENV: "RECRUIT_AI_V2_EXECUTION_ENABLED",
  /** Exact organization UUID allowlist for v2 execution canary (BR-111). */
  EXECUTION_ORGANIZATION_IDS_ENV: "RECRUIT_AI_V2_EXECUTION_ORGANIZATION_IDS",
  /** Exact atlas_users.id allowlist for v2 execution canary (BR-111). Role never authorizes. */
  EXECUTION_USER_IDS_ENV: "RECRUIT_AI_V2_EXECUTION_USER_IDS",
  /**
   * BR-112 — when true, authoritative live CE may pass allowExecution=true.
   * Independent from BR-111 mutation authorization. Fail-closed when absent.
   */
  LIVE_EXECUTION_PATH_ENABLED_ENV: "RECRUIT_AI_V2_LIVE_EXECUTION_PATH_ENABLED",
  /**
   * BR-114 — when true, one-user live WhatsApp turns may be authored by v2.
   * Independent from BR-111 execution and BR-112 live execution path.
   * Fail-closed when absent.
   */
  LIVE_AUTHORING_ENABLED_ENV: "RECRUIT_AI_V2_LIVE_AUTHORING_ENABLED",
  /** Exact organization UUID allowlist for live authoring canary (BR-114). */
  LIVE_AUTHORING_ORGANIZATION_IDS_ENV:
    "RECRUIT_AI_V2_LIVE_AUTHORING_ORGANIZATION_IDS",
  /** Exact atlas_users.id allowlist for live authoring canary (BR-114). */
  LIVE_AUTHORING_USER_IDS_ENV: "RECRUIT_AI_V2_LIVE_AUTHORING_USER_IDS",
  /** Optional timeout (ms) for live authoring before legacy CE fall-through. */
  LIVE_AUTHORING_TIMEOUT_MS_ENV: "RECRUIT_AI_V2_LIVE_AUTHORING_TIMEOUT_MS"
});

/** BR-111 — only these mutation types may be authorized for the first canary. */
const V2_EXECUTABLE_ACTIONS = Object.freeze({
  CREATE_APPOINTMENT: "create_appointment"
});

const SHADOW_DIVERGENCE = Object.freeze({
  EXACT_OR_EQUIVALENT: "exact_or_equivalent",
  LANGUAGE_MISMATCH: "language_mismatch",
  INTENT_MISMATCH: "intent_mismatch",
  TIME_COUNTEROFFER_MISSED_BY_LIVE: "time_counteroffer_missed_by_live",
  TIME_COUNTEROFFER_MISSED_BY_V2: "time_counteroffer_missed_by_v2",
  CONFIRMATION_DUPLICATE_RISK: "confirmation_duplicate_risk",
  RESCHEDULE_MISSED: "reschedule_missed",
  APPOINTMENT_STATE_MISMATCH: "appointment_state_mismatch",
  UNSAFE_SIDE_EFFECT_DIFFERENCE: "unsafe_side_effect_difference",
  DIAGNOSTIC_LEAK_LIVE: "diagnostic_leak_live",
  DIAGNOSTIC_LEAK_V2: "diagnostic_leak_v2",
  HUMAN_ESCALATION_DIFFERENCE: "human_escalation_difference",
  UNSUPPORTED_FOR_COMPARISON: "unsupported_for_comparison",
  SHADOW_ERROR: "shadow_error"
});

const MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE = 2;
/** Recoverable ambiguity clarifications before human handoff (BR-082). */
const MAX_CLARIFICATIONS_BEFORE_ESCALATE = 2;

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
  V2_EXECUTABLE_ACTIONS,
  SHADOW_DIVERGENCE,
  MAX_COUNTEROFFER_MISMATCHES_BEFORE_ESCALATE,
  MAX_CLARIFICATIONS_BEFORE_ESCALATE,
  INTERNAL_DIAGNOSTIC_PATTERNS
};
