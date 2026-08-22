/**
 * Conversations Center constants.
 * TEAM_VISION_ORG_ID / NIOVEL_USER_ID remain for legacy fixtures and migration notes only —
 * they are not product access gates (see conversationsCenterAccess.js).
 */

const TEAM_VISION_ORG_ID = "00000000-0000-4000-8000-000000000001";
const NIOVEL_USER_ID = "33ad243a-9d00-4a4d-810b-df2762c0f076";
/** Digits-only E.164 — production WhatsApp Cloud API number. */
const PRODUCTION_WHATSAPP_E164_DIGITS = "17867528080";

/** Product presentation ownership (maps AGENT → HUMAN). Implements pilot handoff UI. */
const CONVERSATION_OWNERSHIP_STATE = Object.freeze({
  ATLAS: "ATLAS",
  HUMAN: "HUMAN",
  NEEDS_ATTENTION: "NEEDS_ATTENTION"
});

/**
 * List filters.
 * Default working inbox is `active` (not scheduled/closed/test/archived).
 * Ownership filters apply within Active only.
 */
const CONVERSATION_FILTERS = Object.freeze({
  ACTIVE: "active",
  /** @deprecated Prefer ACTIVE — kept for backward-compatible clients. */
  ALL: "all",
  NEEDS_ATTENTION: "needs_attention",
  ATLAS: "atlas",
  HUMAN: "human",
  ARCHIVED: "archived",
  TEST: "test"
});

const HANDOFF_REASONS = Object.freeze({
  EXPLICIT_HUMAN_REQUEST: "explicit_human_request",
  ESCALATION: "escalation",
  AMBIGUITY: "ambiguity",
  UNSUPPORTED_SITUATION: "unsupported_situation",
  SYSTEM_FAILURE: "system_failure",
  SCHEDULING_ISSUE: "scheduling_issue",
  TAKE_OVER: "take_over",
  RECRUITER_ESCALATION: "recruiter_escalation",
  STALL: "stall",
  WHATSAPP_BUSINESS_APP: "whatsapp_business_app",
  UNKNOWN: "unknown"
});

module.exports = {
  TEAM_VISION_ORG_ID,
  NIOVEL_USER_ID,
  PRODUCTION_WHATSAPP_E164_DIGITS,
  CONVERSATION_OWNERSHIP_STATE,
  CONVERSATION_FILTERS,
  HANDOFF_REASONS
};
